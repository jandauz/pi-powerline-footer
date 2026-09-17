import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PRESETS } from "../presets.ts";
import { getDefaultColors } from "../theme.ts";
import { getModelColorSemantic } from "../model-colors.ts";
import { BUILTIN_STATUS_LINE_SEGMENT_IDS } from "../types.ts";

test("default layout keeps only model, thinking, and cwd on the left", () => {
  assert.deepEqual(PRESETS.default.leftSegments, ["model", "thinking", "path"]);
  assert.deepEqual(PRESETS.default.rightSegments, [
    "shell_mode", "git", "queue", "context_pct", "cache_read", "cost", "extension_statuses",
  ]);
  assert.deepEqual(PRESETS.default.secondarySegments, []);
});

test("active local settings hide duplicate metrics and leave native cost at the right edge", () => {
  const settings = JSON.parse(readFileSync(new URL("../../../settings.json", import.meta.url), "utf8"));
  assert.deepEqual(settings.powerline.layout.left, ["model", "thinking", "path"]);
  assert.deepEqual(settings.powerline.layout.right, [
    "shell_mode", "git", "queue", "custom:concierge-workflow", "extension_statuses",
    "custom:codex-limit", "custom:claude-limit", "cost",
  ]);
  assert.deepEqual(
    settings.powerline.customItems
      .filter((item: { id: string }) => item.id.endsWith("-limit"))
      .map((item: { id: string; color: string; hideWhenMissing: boolean }) => ({ id: item.id, color: item.color, hideWhenMissing: item.hideWhenMissing })),
    [
      { id: "codex-limit", color: "#10a37f", hideWhenMissing: false },
      { id: "claude-limit", color: "#d97757", hideWhenMissing: false },
    ],
  );
  assert.equal(settings.powerline.layout.right.at(-1), "cost");
  for (const hidden of ["context_pct", "cache_read", "custom:session-cost"]) {
    assert.ok(!settings.powerline.layout.right.includes(hidden));
  }
  const sessionCost = settings.powerline.customItems.find((item: { id: string }) => item.id === "session-cost");
  assert.equal(sessionCost.excludeFromExtensionStatuses, true);
  assert.equal(settings.powerline.cost.subscriptionDisplay, "both");
});

test("removed token total and session segments are unavailable in every built-in layout", () => {
  assert.ok(!BUILTIN_STATUS_LINE_SEGMENT_IDS.includes("token_total" as never));
  assert.ok(!BUILTIN_STATUS_LINE_SEGMENT_IDS.includes("session" as never));
  for (const preset of Object.values(PRESETS)) {
    const segments = [...preset.leftSegments, ...preset.rightSegments, ...(preset.secondarySegments ?? [])];
    assert.ok(!segments.includes("token_total" as never));
    assert.ok(!segments.includes("session" as never));
  }
});

test("model family matching uses provider, id, and display name robustly", () => {
  assert.equal(getModelColorSemantic({ id: "astra-2" }), "modelPurple");
  assert.equal(getModelColorSemantic({ id: "claude-3-opus", provider: "anthropic" }), "modelCoral");
  assert.equal(getModelColorSemantic({ id: "custom", name: "Claude 3.7 Sonnet" }), "modelMint");
  assert.equal(getModelColorSemantic({ id: "haiku", providerName: "Luna Gateway" }), "modelBlue");
  assert.equal(getModelColorSemantic({ id: "unrecognized" }), "modelNeutral");
});

test("custom model and thinking accents are explicit hex defaults", () => {
  const colors = getDefaultColors();
  assert.equal(colors.modelPurple, "#c792ea");
  assert.equal(colors.modelCoral, "#ff6b81");
  assert.equal(colors.modelMint, "#65d6a6");
  assert.equal(colors.modelBlue, "#66b9ff");
  assert.match(colors.modelNeutral, /^#[0-9a-f]{6}$/i);
  for (const key of ["thinking", "thinkingMinimal", "thinkingLow", "thinkingMedium"] as const) {
    assert.match(colors[key], /^#[0-9a-f]{6}$/i);
  }
});
