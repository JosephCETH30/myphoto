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
