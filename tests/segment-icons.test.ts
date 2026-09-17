import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { homedir } from "node:os";
import { join } from "node:path";
import { ASCII_ICONS, CODICON_ICONS, CODICON_FONT_ASSET, NERD_ICONS } from "../icons.ts";

const segmentsSource = readFileSync(new URL("../segments.ts", import.meta.url), "utf8");
const indexSource = readFileSync(new URL("../index.ts", import.meta.url), "utf8");
const settings = JSON.parse(readFileSync(new URL("../../../settings.json", import.meta.url), "utf8"));

test("thinking defines a Nerd Font brain with a safe ASCII fallback", () => {
  assert.equal(NERD_ICONS.thinking, "\u{F09D1}");
  assert.equal(ASCII_ICONS.thinking, "");
  assert.match(segmentsSource, /withIcon\(getIcons\(\)\.thinking, `think:\$\{label\}`\)/);
});

test("provider pills use verified Codicon provider logos without generic substitutions", () => {
  assert.deepEqual(CODICON_ICONS, { openai: "\uEC81", claude: "\uEC82" });
  assert.equal(NERD_ICONS.openai, CODICON_ICONS.openai);
  assert.equal(NERD_ICONS.claude, CODICON_ICONS.claude);
  assert.equal(ASCII_ICONS.openai, "");
  assert.equal(ASCII_ICONS.claude, "");
  const font = readFileSync(CODICON_FONT_ASSET);
  assert.ok(font.includes(Buffer.from("openai")) && font.includes(Buffer.from("claude")));
  assert.ok(existsSync(join(homedir(), "Library", "Fonts", "Codicons.ttf")) || process.platform !== "darwin");

  const providerItems = settings.powerline.customItems.filter((item: { id: string }) =>
    item.id === "codex-limit" || item.id === "claude-limit"
  );
  assert.ok(providerItems.every((item: { prefix?: string }) => item.prefix === undefined));
  assert.match(indexSource, /const providerIcons = getIcons\(\);/);
  assert.match(indexSource, /const icon = key === "provider-limit-codex" \? getIcons\(\)\.openai : getIcons\(\)\.claude;/);
  assert.match(indexSource, /ctx\.ui\.setStatus\(key, \[icon, value\]\.filter\(Boolean\)\.join\(" "\)\);/);
});

test("cost uses its existing semantic icon and total reported estimate", () => {
  assert.match(segmentsSource, /ctx\.usageStats\.cost \+ \(ctx\.usageStats\.subagentCost \?\? 0\)/);
  assert.match(segmentsSource, /withIcon\(icons\.cost, formatUsdCost\(/);
  assert.match(segmentsSource, /costGradientColor\(cost\)/);
  assert.match(segmentsSource, /withIcon\(icons\.cost, "\(sub\)"\)/);
  assert.match(segmentsSource, /`\$\{reportedCost\} \(sub\)`/);
});
