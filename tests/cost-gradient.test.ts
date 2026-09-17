import assert from "node:assert/strict";
import test from "node:test";
import { costGradientColor } from "../cost-gradient.ts";

test("maps total reported native cost through the configured gradient thresholds", () => {
  assert.equal(costGradientColor(0.99), "#73daca");
  assert.equal(costGradientColor(1), "#e0af68");
  assert.equal(costGradientColor(5), "#e0af68");
  assert.equal(costGradientColor(5.01), "#ff9e64");
  assert.equal(costGradientColor(15), "#ff9e64");
  assert.equal(costGradientColor(15.01), "#f7768e");
});
