import type { SemanticColor } from "./types.ts";

export interface ModelIdentity {
  id: string;
  name?: string;
  provider?: string;
  providerId?: string;
  providerName?: string;
}

/** Resolve both Pi family aliases and Claude tier names from all active-model identifiers. */
export function getModelColorSemantic(model: ModelIdentity | undefined): SemanticColor {
  const identity = [model?.id, model?.name, model?.provider, model?.providerId, model?.providerName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\b(?:astra|fable)\b/.test(identity)) return "modelPurple";
  if (/\b(?:sol|opus)\b/.test(identity)) return "modelCoral";
  if (/\b(?:terra|sonnet)\b/.test(identity)) return "modelMint";
  if (/\b(?:luna|haiku)\b/.test(identity)) return "modelBlue";
  return "modelNeutral";
}
