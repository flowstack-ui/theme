import type { ThemeDefinition } from "./types.js";

/**
 * Supplies literal inference and a stable authoring entry point without
 * changing, cloning, resolving, or validating the definition at runtime.
 */
export function defineTheme<const Definition extends ThemeDefinition>(
  definition: Definition,
): Definition {
  return definition;
}
