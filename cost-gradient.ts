import type { ColorValue } from "./types.ts";

/** Color for the total native reported estimate, including subagent cost. */
export function costGradientColor(cost: number): ColorValue {
  if (cost < 1) return "#73daca";
  if (cost <= 5) return "#e0af68";
  if (cost <= 15) return "#ff9e64";
  return "#f7768e";
}
