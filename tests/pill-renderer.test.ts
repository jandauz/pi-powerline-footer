import assert from "node:assert/strict";
import test from "node:test";
import {
  PILL_BACKGROUND_ANSI,
  PILL_BACKGROUND_FOREGROUND_ANSI,
  getPillLayoutWidth,
  joinAnchoredPillGroups,
  renderPills,
  splitAnchoredPillRows,
} from "../pill-renderer.ts";

const RESET = "\x1b[0m";
const GREEN = "\x1b[38;2;158;206;106m";
const BLUE = "\x1b[38;2;122;162;247m";
const stripAnsi = (value: string) => value.replace(/\x1b\[[0-9;]*m/g, "");

test("renders every section as an individually colored Nerd Font pill", () => {
  const rendered = renderPills([
    `${GREEN}model${RESET}`,
    `${BLUE}path${RESET}`,
  ], true);

  assert.equal(stripAnsi(rendered), " model   path ");
  assert.ok(rendered.includes(`${GREEN}${PILL_BACKGROUND_ANSI}`));
  assert.ok(rendered.includes(`${RESET}${PILL_BACKGROUND_FOREGROUND_ANSI}${RESET} `));
  assert.ok(rendered.indexOf("model") < rendered.indexOf("path"));
});

test("gives an icon no left padding, one right accent cell, then a surface spacer", () => {
  const rendered = renderPills([`${GREEN}ﰙ model${RESET}`], true, BLUE, {
    icons: ["ﰙ"],
    surface: "#303442",
    iconForeground: "#171922",
  });

  assert.equal(stripAnsi(rendered), "ﰙ  model ");
  const accentBackground = "\x1b[48;2;158;206;106m";
  const iconForeground = "\x1b[38;2;23;25;34m";
  assert.ok(rendered.includes(`${GREEN}${accentBackground}${iconForeground}ﰙ `));
  assert.ok(rendered.includes(`${iconForeground}ﰙ ${PILL_BACKGROUND_ANSI}${GREEN} model`));
  assert.ok(rendered.includes(`${PILL_BACKGROUND_ANSI}${GREEN} model`));
  assert.ok(rendered.includes(`\x1b[38;2;48;52;66m`));
});

test("provides a safe ASCII fallback without requiring a Nerd Font icon", () => {
  const rendered = renderPills([`${GREEN}model${RESET}`, `${BLUE}dir path${RESET}`], false, BLUE, {
    icons: ["dir"],
  });
  assert.equal(stripAnsi(rendered), "[ model ] [dir  path ]");
});

test("reports pill framing and inter-pill gaps for responsive layout", () => {
  assert.equal(getPillLayoutWidth([5, 4]), 5 + 4 + 4 + 4 + 1);
  assert.equal(getPillLayoutWidth([]), 0);
});

test("anchors the complete right group and its final cost pill on wide rows", () => {
  assert.deepEqual(splitAnchoredPillRows([5, 4], [3, 6], [], 40), {
    topLeftCount: 2,
    topRightStart: 0,
    secondaryCount: 0,
  });
  assert.equal(joinAnchoredPillGroups("left", 4, "cost", 4, 20), "left            cost");
});

test("keeps a fitting rightmost cost pill and safely overflows earlier pills on narrow rows", () => {
  const result = splitAnchoredPillRows([8, 7], [6, 5], [], 12);
  assert.deepEqual(result, {
    topLeftCount: 0,
    topRightStart: 1,
    secondaryCount: 1,
  });
  assert.ok(getPillLayoutWidth([5]) <= 12);
});
