const RESET = "\x1b[0m";
const FOREGROUND_ANSI = /\x1b\[(?:38;(?:2;\d+;\d+;\d+|5;\d+)|3\d|9\d)m/;
const ANSI = /\x1b\[[0-9;]*m/g;

const DEFAULT_SURFACE = "#303442";
const DEFAULT_ICON_FOREGROUND = "#171922";

export const PILL_BACKGROUND_ANSI = "\x1b[48;2;48;52;66m";
export const PILL_BACKGROUND_FOREGROUND_ANSI = "\x1b[38;2;48;52;66m";
export const PILL_CONTENT_PADDING = 2;
export const PILL_CAP_WIDTH = 2;
export const PILL_GAP_WIDTH = 1;

export interface PillRenderOptions {
  /** Non-empty icons from the active Nerd Font or fallback icon set. */
  icons?: readonly string[];
  surface?: `#${string}`;
  iconForeground?: `#${string}`;
}

function accentOf(content: string, fallbackAccent: string): string {
  return content.match(FOREGROUND_ANSI)?.[0] ?? fallbackAccent;
}

function rgb(hex: string): [number, number, number] {
  return [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];
}

function foreground(hex: string): string {
  const [r, g, b] = rgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function background(hex: string): string {
  const [r, g, b] = rgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
}

function foregroundAsBackground(ansi: string): string {
  return ansi.replace("[38;", "[48;").replace(/^\x1b\[(3|9)(\d)m$/, (_all, family, digit) => `\x1b[${family === "9" ? "10" : "4"}${digit}m`);
}

function leadingIcon(content: string, icons: readonly string[]): { icon: string; text: string } | null {
  const plain = content.replace(ANSI, "");
  const icon = [...new Set(icons.filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .find((candidate) => plain.startsWith(`${candidate} `));
  if (!icon) return null;

  const rawIconIndex = content.indexOf(icon);
  if (rawIconIndex < 0) return null;
  return { icon, text: content.slice(rawIconIndex + icon.length + 1) };
}

/**
 * Render pre-colored section content without changing its ordering or text.
 * Icon-bearing pills use a joined accent cell; fallback icons work identically.
 */
export function renderPills(
  parts: readonly string[],
  nerdFonts: boolean,
  fallbackAccent = "\x1b[38;5;244m",
  options: PillRenderOptions = {},
): string {
  const [leftCap, rightCap] = nerdFonts ? ["", ""] : ["[", "]"];
  const surface = options.surface ?? DEFAULT_SURFACE;
  const surfaceBackground = background(surface);
  const surfaceForeground = foreground(surface);
  const iconForeground = foreground(options.iconForeground ?? DEFAULT_ICON_FOREGROUND);
  const icons = options.icons ?? [];

  return parts.map((content) => {
    const accent = accentOf(content, fallbackAccent);
    const iconPart = leadingIcon(content, icons);
    const body = iconPart?.text ?? content;
    const backgroundSafeContent = body.replaceAll(RESET, `${RESET}${surfaceBackground}`);
    const left = iconPart
      ? `${accent}${leftCap}${foregroundAsBackground(accent)}${iconForeground}${iconPart.icon} ${surfaceBackground}${accent} `
      : `${accent}${leftCap}${surfaceBackground}${accent} `;
    return `${left}${backgroundSafeContent} ${RESET}${surfaceForeground}${rightCap}${RESET}`;
  }).join(" ");
}

/** Visible width consumed by section bodies, caps, padding, and one-cell gaps. */
export function getPillLayoutWidth(contentWidths: readonly number[]): number {
  if (contentWidths.length === 0) return 0;
  return contentWidths.reduce((sum, width) => sum + width + PILL_CONTENT_PADDING + PILL_CAP_WIDTH, 0)
    + (contentWidths.length - 1) * PILL_GAP_WIDTH;
}

function fittingPrefixLength(widths: readonly number[], availableWidth: number): number {
  let count = 0;
  for (let next = 1; next <= widths.length; next++) {
    if (getPillLayoutWidth(widths.slice(0, next)) > availableWidth) break;
    count = next;
  }
  return count;
}

export interface AnchoredPillSplit {
  topLeftCount: number;
  topRightStart: number;
  secondaryCount: number;
}

/**
 * Keep a suffix of right-hand pills (notably the final cost pill) anchored while
 * moving earlier content to the secondary row at section boundaries.
 */
export function splitAnchoredPillRows(
  leftWidths: readonly number[],
  rightWidths: readonly number[],
  secondaryWidths: readonly number[],
  availableWidth: number,
): AnchoredPillSplit {
  let topRightStart = rightWidths.length;
  while (topRightStart > 0
    && getPillLayoutWidth(rightWidths.slice(topRightStart - 1)) <= availableWidth) {
    topRightStart--;
  }

  const topRightWidth = getPillLayoutWidth(rightWidths.slice(topRightStart));
  const leftAvailable = Math.max(0, availableWidth - topRightWidth - (topRightWidth > 0 ? PILL_GAP_WIDTH : 0));
  const topLeftCount = fittingPrefixLength(leftWidths, leftAvailable);
  const overflowWidths = [
    ...leftWidths.slice(topLeftCount),
    ...rightWidths.slice(0, topRightStart),
    ...secondaryWidths,
  ];

  return {
    topLeftCount,
    topRightStart,
    secondaryCount: fittingPrefixLength(overflowWidths, availableWidth),
  };
}

/** Join independently rendered groups with enough blank cells to reach the right edge. */
export function joinAnchoredPillGroups(
  leftContent: string,
  leftWidth: number,
  rightContent: string,
  rightWidth: number,
  availableWidth: number,
): string {
  if (!rightContent) return leftContent;
  const gap = Math.max(0, availableWidth - leftWidth - rightWidth);
  return `${leftContent}${" ".repeat(gap)}${rightContent}`;
}

/** Split only at section boundaries and preserve order on narrow terminals. */
export function splitPillRows(
  contentWidths: readonly number[],
  availableWidth: number,
): { topCount: number; secondaryCount: number } {
  const topCount = fittingPrefixLength(contentWidths, availableWidth);
  const secondaryCount = fittingPrefixLength(contentWidths.slice(topCount), availableWidth);
  return { topCount, secondaryCount };
}
