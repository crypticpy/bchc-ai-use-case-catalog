/** Bundled font names and compatibility aliases shared by both setup wizards. */

export const BUNDLED_FONT_NAMES = Object.freeze({
  serif: 'PHCT Serif',
  sans: 'PHCT Sans',
  inter: 'Inter',
});

const LEGACY_BUNDLED_NAMES = Object.freeze({
  'Source Serif 4': BUNDLED_FONT_NAMES.serif,
  'Source Sans 3': BUNDLED_FONT_NAMES.sans,
});

/**
 * Keep deployment-owned theme files written before the derivative fonts were
 * renamed working without continuing to present an upstream Reserved Font Name.
 * Every other family name is a deployment choice and passes through unchanged.
 */
export function normalizeBundledFontName(value) {
  const name = String(value ?? '');
  return LEGACY_BUNDLED_NAMES[name] ?? name;
}
