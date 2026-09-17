import assert from "node:assert/strict";
import test from "node:test";
import {
  createProviderLimitsAdapter,
  formatLowestLimit,
  resolveClaudeCodeOAuthCredential,
  resolveOAuthCredential,
} from "../provider-limits.ts";

test("compact formatting selects the quota window with lowest remaining capacity", () => {
  assert.equal(formatLowestLimit([
    { usedPercent: 46, resetsAt: new Date("2026-01-04T00:00:00Z").valueOf() },
    { usedPercent: 80, resetsAt: new Date("2026-01-01T03:00:00Z").valueOf() },
  ], new Date("2026-01-01T00:00:00Z").valueOf()), "20%·3h");
});

test("Claude remains visible as unavailable and cached values are visibly stale", async () => {
  const published = new Map<string, string>();
  let succeed = true;
  const adapter = createProviderLimitsAdapter({
    resolveOAuth: async () => ({ accessToken: "secret-oauth" }),
    resolveClaudeOAuth: async () => ({ accessToken: "secret-oauth" }),
    fetch: async (url) => {
      if (!succeed) throw new Error("offline");
      if (String(url).includes("anthropic")) return new Response(JSON.stringify({ five_hour: { utilization: 25, resets_at: "2026-01-01T01:00:00Z" } }), { status: 200 });
      return new Response("{}", { status: 500 });
    },
    publish: (key, value) => published.set(key, value),
    now: () => new Date("2026-01-01T00:00:00Z").valueOf(),
  });
  await adapter.refresh("claude");
  assert.equal(published.get("provider-limit-claude"), "75%·1h");
  succeed = false;
  await adapter.refresh("claude");
  assert.equal(published.get("provider-limit-claude"), "75%·1h~");

  const unavailable = createProviderLimitsAdapter({
    resolveOAuth: async () => null,
    resolveClaudeOAuth: async () => null,
    fetch: async () => { throw new Error("must not fetch"); },
    publish: (key, value) => published.set(key, value),
  });
  await unavailable.refresh("claude");
  assert.equal(published.get("provider-limit-claude"), "⚠");
});

test("credential resolution accepts Pi's resolved OAuth contract and adapter never publishes or puts secrets in URLs", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const statuses: string[] = [];
  const registry = {
    getProviderAuth: async (provider: string) => provider === "anthropic"
      ? { auth: { apiKey: "forbidden-api-key" }, source: "ANTHROPIC_API_KEY" }
      : { auth: { apiKey: "oauth-secret", headers: { "ChatGPT-Account-Id": "account-1" } }, source: "OAuth" },
  };
  assert.equal(await resolveOAuthCredential(registry, "anthropic"), null);
  assert.deepEqual(await resolveOAuthCredential(registry, "openai-codex"), {
    accessToken: "oauth-secret",
    headers: { "ChatGPT-Account-Id": "account-1" },
  });

  const adapter = createProviderLimitsAdapter({
    resolveOAuth: (provider) => resolveOAuthCredential(registry, provider),
    resolveClaudeOAuth: async () => { throw new Error("Codex must not inspect Claude Code credentials"); },
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ rate_limit: { primary_window: { used_percent: 46, reset_after_seconds: 3600 } } }), { status: 200 });
    },
    publish: (_key, value) => statuses.push(value),
    now: () => 0,
  });
  await adapter.refresh("codex");
  assert.ok(!calls[0].url.includes("oauth-secret"));
  assert.equal(calls[0].init?.headers instanceof Headers && calls[0].init.headers.get("Authorization"), "Bearer oauth-secret");
  assert.deepEqual(statuses, ["54%·1h"]);
  assert.ok(statuses.every((value) => !value.includes("oauth-secret")));
  assert.equal(calls[0].init?.method, "GET");
});

test("Claude resolves only its dedicated Claude Code OAuth credential", async () => {
  const credential = await resolveClaudeCodeOAuthCredential({
    configDir: "/isolated-claude",
    readFile: (path) => path.endsWith("/.credentials.json")
      ? JSON.stringify({ claudeAiOauth: { accessToken: "claude-oauth-secret" } })
      : "{}",
    readKeychain: () => { throw new Error("custom config must not inspect keychain"); },
  });
  assert.deepEqual(credential, { accessToken: "claude-oauth-secret" });

  let genericCalls = 0;
  let claudeCalls = 0;
  const adapter = createProviderLimitsAdapter({
    resolveOAuth: async () => { genericCalls++; return null; },
    resolveClaudeOAuth: async () => { claudeCalls++; return credential; },
    fetch: async () => new Response(JSON.stringify({ five_hour: { utilization: 20, resets_at: "2026-01-01T01:00:00Z" } }), { status: 200 }),
    publish: () => {},
    now: () => new Date("2026-01-01T00:00:00Z").valueOf(),
  });
  await adapter.refresh("claude");
  assert.equal(genericCalls, 0);
  assert.equal(claudeCalls, 1);
});
