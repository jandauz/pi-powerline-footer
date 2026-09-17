export type LimitProvider = "codex" | "claude";

export interface OAuthCredential {
  accessToken: string;
  headers?: Record<string, string>;
}

export interface LimitWindow {
  usedPercent: number;
  resetsAt: number;
}

export interface ProviderLimitsRuntime {
  /** Pi resolved provider auth; used only for Codex. */
  resolveOAuth(provider: string): Promise<OAuthCredential | null>;
  /** Dedicated Claude Code credential source; never generic Anthropic provider auth. */
  resolveClaudeOAuth(): Promise<OAuthCredential | null>;
  fetch(input: string, init?: RequestInit): Promise<Response>;
  publish(key: string, value: string): void;
  now?: () => number;
}

const STATUS_KEYS: Record<LimitProvider, string> = {
  codex: "provider-limit-codex",
  claude: "provider-limit-claude",
};

const CODEX_PROVIDER = "openai-codex";

function finitePercent(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : null;
}

function resetTime(value: unknown, now: number): number | null {
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  return null;
}

function compactCountdown(milliseconds: number): string {
  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.ceil(hours / 24)}d`;
}

export function formatLowestLimit(windows: readonly LimitWindow[], now = Date.now()): string | null {
  const valid = windows.filter((window) => Number.isFinite(window.usedPercent) && Number.isFinite(window.resetsAt));
  if (valid.length === 0) return null;
  const lowest = valid.reduce((selected, candidate) => candidate.usedPercent > selected.usedPercent ? candidate : selected);
  return `${Math.round(100 - Math.min(100, Math.max(0, lowest.usedPercent)))}%·${compactCountdown(lowest.resetsAt - now)}`;
}

function codexWindows(payload: unknown, now: number): LimitWindow[] {
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const rateLimit = root.rate_limit && typeof root.rate_limit === "object" ? root.rate_limit as Record<string, unknown> : root;
  return [rateLimit.primary_window, rateLimit.secondary_window].flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const window = raw as Record<string, unknown>;
    const usedPercent = finitePercent(window.used_percent);
    const resetsAt = resetTime(window.reset_at, now)
      ?? (typeof window.reset_after_seconds === "number" ? now + window.reset_after_seconds * 1000 : null);
    return usedPercent === null || resetsAt === null ? [] : [{ usedPercent, resetsAt }];
  });
}

function claudeWindows(payload: unknown, now: number): LimitWindow[] {
  if (!payload || typeof payload !== "object") return [];
  return Object.values(payload as Record<string, unknown>).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const window = raw as Record<string, unknown>;
    const usedPercent = finitePercent(window.utilization);
    const resetsAt = resetTime(window.resets_at, now);
    return usedPercent === null || resetsAt === null ? [] : [{ usedPercent, resetsAt }];
  });
}

/**
 * Resolve Pi's runtime AuthResult contract without reading the persisted
 * credential. OAuth is identified by its non-secret source metadata; the
 * request token is exposed by Pi as auth.apiKey (pi-ai >= 0.81).
 */
export async function resolveOAuthCredential(registry: any, provider: string): Promise<OAuthCredential | null> {
  const resolved = await registry?.getProviderAuth?.(provider);
  if (!resolved || resolved.source !== "OAuth" || !resolved.auth || typeof resolved.auth !== "object") return null;
  const accessToken = resolved.auth.apiKey;
  if (typeof accessToken !== "string" || !accessToken) return null;
  const headers: Record<string, string> = resolved.auth.headers && typeof resolved.auth.headers === "object"
    ? Object.fromEntries(Object.entries(resolved.auth.headers).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
    : {};
  return { accessToken, headers };
}

interface ClaudeCodeCredentialOptions {
  configDir?: string;
  readFile?: (path: string) => string;
  readKeychain?: () => string;
}

/** Read only Claude Code's own OAuth store, independently of Pi provider auth. */
export async function resolveClaudeCodeOAuthCredential(options: ClaudeCodeCredentialOptions = {}): Promise<OAuthCredential | null> {
  const { readFileSync } = await import("node:fs");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  const readFile = options.readFile ?? ((path: string) => readFileSync(path, "utf8"));
  const configDir = options.configDir ?? process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude");

  const parse = (raw: string): OAuthCredential | null => {
    try {
      const value = JSON.parse(raw);
      const accessToken = value?.claudeAiOauth?.accessToken;
      return typeof accessToken === "string" && accessToken ? { accessToken } : null;
    } catch {
      return null;
    }
  };

  for (const name of [".credentials.json", "credentials.json"]) {
    try {
      const credential = parse(readFile(join(configDir, name)));
      if (credential) return credential;
    } catch { /* unavailable source */ }
  }

  // Claude Code uses this Keychain item on macOS when no custom config dir is set.
  if (process.platform === "darwin" && !options.configDir && !process.env.CLAUDE_CONFIG_DIR) {
    try {
      let readKeychain = options.readKeychain;
      if (!readKeychain) {
        const { execFileSync } = await import("node:child_process");
        readKeychain = () => execFileSync("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"], {
          encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
        });
      }
      return parse(readKeychain());
    } catch { /* unavailable source */ }
  }
  return null;
}

export function createProviderLimitsAdapter(runtime: ProviderLimitsRuntime) {
  const cache = new Map<LimitProvider, string>();

  async function refresh(provider: LimitProvider): Promise<void> {
    try {
      const credential = provider === "claude"
        ? await runtime.resolveClaudeOAuth()
        : await runtime.resolveOAuth(CODEX_PROVIDER);
      if (!credential) throw new Error("OAuth unavailable");
      const headers = new Headers(credential.headers);
      headers.set("Authorization", `Bearer ${credential.accessToken}`);
      headers.set("Accept", "application/json");
      if (provider === "claude") headers.set("anthropic-beta", "oauth-2025-04-20");
      const url = provider === "codex"
        ? "https://chatgpt.com/backend-api/wham/usage"
        : "https://api.anthropic.com/api/oauth/usage";
      const response = await runtime.fetch(url, { method: "GET", headers, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`Usage unavailable (${response.status})`);
      const now = runtime.now?.() ?? Date.now();
      const payload: unknown = await response.json();
      const windows = provider === "codex" ? codexWindows(payload, now) : claudeWindows(payload, now);
      const compact = formatLowestLimit(windows, now);
      if (!compact) throw new Error("No quota windows");
      cache.set(provider, compact);
      runtime.publish(STATUS_KEYS[provider], compact);
    } catch {
      const stale = cache.get(provider);
      runtime.publish(STATUS_KEYS[provider], stale ? `${stale}~` : "⚠");
    }
  }

  return {
    refresh,
    refreshAll: () => Promise.all([refresh("codex"), refresh("claude")]).then(() => undefined),
  };
}
