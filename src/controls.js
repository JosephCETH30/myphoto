// Adjustment sliders. min defaults to -100, max is 100. Kept separate so the viewer UI doesn't pull in Three.js.
export const GROUPS = ['Light', 'Color', 'Detail', 'Effects']
export const CONTROLS = [
  ['exposure', 'Exposure', 'Light'], ['brightness', 'Brightness', 'Light'], ['contrast', 'Contrast', 'Light'],
  ['highlights', 'Highlights', 'Light'], ['shadows', 'Shadows', 'Light'], ['whites', 'Whites', 'Light'], ['blacks', 'Blacks', 'Light'],
  ['temperature', 'Temperature', 'Color'], ['tint', 'Tint', 'Color'], ['saturation', 'Saturation', 'Color'],
  ['vibrance', 'Vibrance', 'Color'], ['hue', 'Hue', 'Color'],
  ['clarity', 'Clarity', 'Detail'], ['sharpness', 'Sharpness', 'Detail'], ['dehaze', 'Dehaze', 'Detail'],
  ['vignette', 'Vignette', 'Effects'], ['fade', 'Fade', 'Effects', 0], ['grain', 'Grain', 'Effects', 0],
]
export const ZERO = Object.fromEntries(CONTROLS.map(([k]) => [k, 0]))

// Local (masked) adjustments: [key, label, group]. The shader packs them as 3 vec4s (see Editor.jsx).
export const MASK_GROUPS = ['Light', 'Color', 'Detail']
export const MASK_CONTROLS = [
  ['exposure', 'Exposure', 'Light'], ['contrast', 'Contrast', 'Light'], ['highlights', 'Highlights', 'Light'],
  ['shadows', 'Shadows', 'Light'], ['whites', 'Whites', 'Light'], ['blacks', 'Blacks', 'Light'],
  ['temperature', 'Temperature', 'Color'], ['tint', 'Tint', 'Color'], ['saturation', 'Saturation', 'Color'],
  ['clarity', 'Clarity', 'Detail'], ['dehaze', 'Dehaze', 'Detail'], ['sharpness', 'Sharpness', 'Detail'],
]
export const MASK_ZERO = Object.fromEntries(MASK_CONTROLS.map(([k]) => [k, 0]))
export const MAX_MASKS = 4
// Shader mask kinds: 1 radial, 2 linear, 3 painted canvas (brush / AI object), 4 whole photo (refined by a range).
export const MASK_TYPE = { radial: 1, linear: 2, brush: 3, object: 3, color: 4, luminance: 4 }
export const RANGE_MODE = { none: 0, luminance: 1, color: 2 }
// Same YIQ chroma the shader uses for color-range masks.
export const toIQ = ([r, g, b]) => [0.596 * r - 0.274 * g - 0.322 * b, 0.211 * r - 0.523 * g + 0.312 * b]
