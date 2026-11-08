// Look presets. Values are the Adjust sliders plus the look engine in controls.js
// (per-color HSL, shadow/highlight grading, tone curve). Anything left out is 0.

// Reusable color recipes.
const TEAL_ORANGE = { hueOrange: -8, satOrange: 24, lumOrange: 8, hueYellow: -32, satYellow: -22, hueGreen: 58, satGreen: -48, lumGreen: -18, hueAqua: -10, satAqua: 34, hueBlue: -26, satBlue: 28, lumBlue: -18, shadowR: -24, shadowG: 4, shadowB: 36, highR: 28, highG: 8, highB: -26 }
const OLIVE = { hueGreen: -40, satGreen: -42, lumGreen: -22, hueYellow: -16, satYellow: -16, hueAqua: -22, satAqua: -32 }
const DEEP_SKY = { hueBlue: -22, satBlue: 34, lumBlue: -28, hueAqua: -8, satAqua: 26, lumAqua: -10 }
const SKIN = { hueOrange: -5, satOrange: 12, lumOrange: 16, lumRed: 8, satRed: 6 }
const WARM = { shadowR: 18, shadowG: 6, shadowB: -24, highR: 24, highG: 12, highB: -22 }
const COOL = { shadowR: -20, shadowG: 2, shadowB: 32, highR: -10, highG: 2, highB: 18 }
const MATTE = { curve: 14, lift: 70, roll: 42 }
const FILM = { curve: 34, lift: 42, roll: 28 }
const PUNCH = { curve: 72 }
const DESAT_GREEN = { satGreen: -60, lumGreen: -14, satYellow: -30, satAqua: -36 }

const CATALOG = {
  Natural: {
    'Clean': { ...SKIN, exposure: 8, curve: 46, highlights: -20, shadows: 22, vibrance: 34, clarity: 16, sharpness: 18, satBlue: 18 },
    'Soft Light': { exposure: 12, curve: -22, lift: 16, highlights: -26, shadows: 30, vibrance: 14, clarity: -10 },
    'True Tone': { curve: 58, whites: 12, blacks: -12, vibrance: 22, sharpness: 14, satBlue: 16 },
    'Daylight': { exposure: 10, temperature: 16, curve: 22, shadows: 18, vibrance: 26, satGreen: 14, satBlue: 14 },
    'Crisp': { curve: 52, whites: 14, blacks: -16, clarity: 28, sharpness: 28, vibrance: 16 },
    'Airy': { exposure: 22, curve: -16, lift: 24, highlights: -20, shadows: 34, saturation: -8, lumBlue: 18, lumGreen: 14 },
    'Balanced': { highlights: -46, shadows: 46, curve: 30, whites: 10, blacks: -12, vibrance: 22 },
    'Fresh': { exposure: 10, curve: 30, temperature: -12, vibrance: 34, hueGreen: 12, satGreen: 22, satAqua: 22 },
  },
  Portrait: {
    'Skin Glow': { ...SKIN, exposure: 14, curve: 12, lift: 14, highlights: -18, shadows: 24, temperature: 12, clarity: -22, ...{ shadowR: 10, shadowB: -6 } },
    'Soft Skin': { ...SKIN, ...DESAT_GREEN, exposure: 8, lift: 26, roll: 12, clarity: -34, temperature: 8, tint: 8 },
    'Warm Studio': { ...SKIN, ...WARM, curve: 44, highlights: -18, vignette: -26, satBlue: -30 },
    'Editorial': { ...COOL, ...DESAT_GREEN, curve: 60, blacks: -20, satOrange: -14, saturation: -14, clarity: 14, vignette: -18 },
    'Peach': { ...SKIN, ...FILM, exposure: 12, temperature: 26, tint: 18, satGreen: -34, hueGreen: -18, shadowR: 16, shadowB: -6 },
    'Rosy': { ...SKIN, exposure: 10, tint: 28, temperature: 8, lift: 20, clarity: -14, hueOrange: -14, hueRed: -8, shadowR: 14, shadowB: 12, highR: 14, highB: 6 },
    'Matte Portrait': { ...SKIN, ...MATTE, ...DESAT_GREEN, temperature: 10, saturation: -12 },
    'Bright Face': { ...SKIN, exposure: 26, curve: 16, highlights: -32, shadows: 36, lumOrange: 28, clarity: -12, vibrance: 12 },
  },
  Street: {
    'Gritty': { ...DESAT_GREEN, curve: 78, blacks: -24, clarity: 46, sharpness: 34, saturation: -30, grain: 26, shadowB: 14, shadowR: -6 },
    'City Cool': { ...COOL, ...TEAL_ORANGE, temperature: -14, curve: 44, clarity: 18, saturation: -8, vignette: -24 },
    'Concrete': { ...COOL, curve: 46, saturation: -56, clarity: 30, blacks: -12, satOrange: 30, satRed: 34 },
    'Documentary': { ...FILM, ...OLIVE, highlights: -24, shadows: 14, saturation: -22, clarity: 24, grain: 20, shadowB: 12 },
    'Rush Hour': { ...WARM, ...PUNCH, exposure: 8, vibrance: 34, clarity: 20, dehaze: 16, satRed: 26, satOrange: 20, vignette: -18 },
    'Asphalt': { ...COOL, curve: 70, blacks: -28, temperature: -14, saturation: -38, vignette: -32, lumBlue: -24 },
    'Sidewalk': { ...FILM, ...WARM, ...OLIVE, temperature: 20, lift: 58, saturation: -30, grain: 26, vignette: -16 },
    'Hard Light': { curve: 100, contrast: 18, whites: 18, blacks: -30, clarity: 26, saturation: -12, shadowB: 18, highR: 12 },
  },
  Cinematic: {
    'Teal & Orange': { ...TEAL_ORANGE, curve: 46, blacks: -14, vibrance: 14, vignette: -22 },
    'Blockbuster': { ...TEAL_ORANGE, curve: 70, highlights: -30, blacks: -22, temperature: -14, dehaze: 18, vignette: -34, shadowB: 52 },
    'Noir Color': { ...COOL, exposure: -22, curve: 80, saturation: -46, blacks: -24, vignette: -46, satRed: 60 },
    'Desert': { ...WARM, ...OLIVE, ...FILM, exposure: 6, temperature: 62, tint: 8, saturation: -14, hueBlue: -36, satBlue: -46, grain: 12 },
    'Arctic': { ...COOL, curve: 36, temperature: -46, tint: 8, saturation: -24, lift: 22, satOrange: -40, lumBlue: 16 },
    'Indie': { ...MATTE, ...OLIVE, ...WARM, tint: 10, saturation: -18, grain: 22, shadowB: 14 },
    'Thriller': { ...COOL, exposure: -26, curve: 62, temperature: -24, tint: -22, saturation: -30, vignette: -50, hueOrange: 18, shadowG: 22 },
    'Anamorphic': { ...TEAL_ORANGE, curve: 54, highlights: -40, tint: 12, vignette: -38, grain: 10, lift: 14, satBlue: 50 },
  },
  Film: {
    'Warm 400': { ...FILM, ...WARM, ...SKIN, exposure: 12, temperature: 20, hueGreen: -20, satGreen: -24, grain: 32 },
    'Fine 160': { ...FILM, ...SKIN, ...DESAT_GREEN, exposure: 8, temperature: 22, tint: 12, shadows: 18, shadowB: 12, grain: 20 },
    'Slide 100': { ...PUNCH, ...DEEP_SKY, blacks: -18, saturation: 30, vibrance: 22, satRed: 26, hueGreen: 14, grain: 12 },
    'Green Tint': { ...FILM, shadowG: 34, shadowR: -14, shadowB: -4, highG: 16, highR: -8, tint: -30, saturation: -14, hueGreen: 24, grain: 34 },
    'Cross Process': { curve: 74, shadowR: -26, shadowG: 16, shadowB: 44, highR: 12, highG: 28, highB: -44, tint: -24, saturation: 28, hueBlue: 26, hueOrange: 12 },
    'Expired': { ...MATTE, exposure: 16, temperature: 32, tint: 26, saturation: -26, grain: 52, shadowR: 28, shadowB: 26, hueGreen: -30, vignette: -20 },
    'Push 800': { curve: 84, lift: 18, blacks: -14, clarity: 14, saturation: -22, grain: 70, shadowB: 18, highR: 12 },
    'Cine 500': { ...COOL, ...FILM, ...SKIN, highlights: -36, tint: 16, satGreen: -36, hueGreen: 26, grain: 24 },
  },
  'Golden Hour': {
    'Sunset': { ...WARM, ...DEEP_SKY, exposure: 8, curve: 42, temperature: 52, tint: 14, vibrance: 34, highlights: -28, hueBlue: 30, satOrange: 34 },
    'Honey': { ...WARM, ...OLIVE, ...FILM, temperature: 40, saturation: -8, vibrance: 16, satOrange: 28 },
    'Amber': { ...WARM, curve: 56, temperature: 60, tint: -4, saturation: -14, vignette: -26, hueYellow: -24, hueGreen: -46 },
    'Late Sun': { ...WARM, ...SKIN, exposure: 12, highlights: -38, shadows: 26, temperature: 36, vibrance: 26, curve: 30 },
    'Glow': { ...WARM, exposure: 24, curve: -14, lift: 26, temperature: 30, tint: 12, clarity: -40, roll: 16 },
    'Dusty Gold': { ...MATTE, ...WARM, ...OLIVE, temperature: 46, saturation: -28, grain: 18 },
    'Sunrise': { exposure: 18, temperature: 20, tint: 26, highlights: -22, vibrance: 22, curve: 22, shadowB: 28, shadowR: 12, highR: 26, highG: 12, highB: -18 },
    'Burnt': { ...WARM, exposure: -10, curve: 84, temperature: 66, saturation: 10, blacks: -20, vignette: -34, hueYellow: -30, satRed: 30 },
  },
  Landscape: {
    'Vista': { ...DEEP_SKY, curve: 46, highlights: -46, shadows: 34, vibrance: 34, clarity: 28, dehaze: 22, satGreen: 26 },
    'Deep Sky': { ...DEEP_SKY, exposure: -10, curve: 40, highlights: -56, temperature: -18, vibrance: 34, dehaze: 34, lumBlue: -60, satBlue: 64 },
    'Forest': { ...OLIVE, exposure: -12, curve: 66, shadows: 12, clarity: 30, temperature: 18, satGreen: -8, lumGreen: -46, shadowG: 24, shadowB: 16, vignette: -22 },
    'Mountain': { ...COOL, ...DEEP_SKY, curve: 62, highlights: -34, temperature: -20, clarity: 40, dehaze: 32, sharpness: 24 },
    'Ocean': { ...COOL, curve: 36, temperature: -34, vibrance: 34, dehaze: 18, hueAqua: 16, satAqua: 60, satBlue: 50, lumAqua: 12 },
    'Autumn': { ...WARM, curve: 44, temperature: 30, vibrance: 34, clarity: 14, hueGreen: -70, hueYellow: -34, satYellow: 30, satOrange: 40, satRed: 26 },
    'Morning Mist': { ...COOL, ...MATTE, exposure: 18, dehaze: -40, temperature: -12, saturation: -18, clarity: -18 },
    'Epic': { ...DEEP_SKY, ...WARM, curve: 80, highlights: -52, shadows: 44, clarity: 46, dehaze: 36, vibrance: 26, vignette: -32 },
  },
  Moody: {
    'Dark Forest': { ...OLIVE, exposure: -30, curve: 54, tint: -18, saturation: -28, shadows: -14, vignette: -44, shadowG: 22, shadowB: 16, shadowR: -14, lumGreen: -44 },
    'Rainy Day': { ...COOL, ...DESAT_GREEN, exposure: -22, curve: 40, lift: 26, temperature: -32, saturation: -32 },
    'Low Key': { exposure: -44, curve: 80, blacks: -28, highlights: -14, vignette: -56, saturation: -14 },
    'Melancholy': { ...COOL, ...MATTE, exposure: -18, temperature: -22, tint: 14, saturation: -42, shadowR: 6 },
    'Ink': { ...COOL, exposure: -22, curve: 90, blacks: -36, saturation: -42, clarity: 22, shadowB: 54 },
    'Storm': { ...COOL, ...DEEP_SKY, exposure: -26, curve: 66, temperature: -38, clarity: 36, dehaze: 28, saturation: -28, vignette: -34 },
    'Velvet': { exposure: -22, curve: 52, tint: 30, temperature: 8, saturation: -14, vignette: -38, shadowR: 28, shadowB: 34, shadowG: -14, highR: 14, hueRed: -14 },
    'Smoke': { ...MATTE, ...COOL, exposure: -14, dehaze: -36, saturation: -50 },
  },
  Vintage: {
    '1970': { ...MATTE, ...WARM, ...OLIVE, temperature: 38, tint: 14, saturation: -18, grain: 36, vignette: -28 },
    '1985': { curve: 58, tint: 26, temperature: -10, lift: 20, saturation: 18, grain: 28, shadowR: 12, shadowB: 44, highR: 30, highB: 8, hueBlue: 24, satRed: 26 },
    'Polaroid': { ...MATTE, exposure: 18, temperature: 16, tint: -16, saturation: -14, shadowG: 22, shadowB: 28, shadowR: -8, highR: 20, highG: 12, highB: -18 },
    'Sepia Wash': { ...MATTE, temperature: 34, saturation: -86, grain: 24, shadowR: 30, shadowG: 8, shadowB: -32, highR: 34, highG: 18, highB: -32 },
    'Faded Print': { ...MATTE, curve: -8, lift: 96, roll: 60, saturation: -34, shadowB: 12 },
    'Old Postcard': { ...FILM, ...WARM, ...DESAT_GREEN, temperature: 28, tint: 10, saturation: -38, vignette: -44, grain: 42 },
    'Retro Teal': { ...MATTE, ...TEAL_ORANGE, temperature: -18, saturation: -14, grain: 28 },
    'Antique': { ...FILM, ...WARM, exposure: -8, temperature: 44, saturation: -66, vignette: -56, grain: 50 },
  },
  Pastel: {
    'Cotton': { ...MATTE, exposure: 30, curve: -18, saturation: -22, lumGreen: 22, lumBlue: 24 },
    'Mint': { ...MATTE, exposure: 24, temperature: -16, tint: -28, saturation: -14, hueGreen: 30, hueYellow: 20, shadowG: 26, highG: 14, highR: -10 },
    'Blush': { ...MATTE, exposure: 26, tint: 34, temperature: 10, saturation: -12, shadowR: 24, shadowB: 12, highR: 16, highB: 8, hueOrange: -16 },
    'Lavender': { ...MATTE, exposure: 22, temperature: -14, tint: 36, saturation: -14, hueBlue: 32, shadowR: 14, shadowB: 34, highR: 8, highB: 18 },
    'Cream': { ...MATTE, ...WARM, exposure: 26, temperature: 22, saturation: -26, lumOrange: 18 },
    'Sky Wash': { ...MATTE, exposure: 28, temperature: -26, saturation: -8, lumBlue: 36, satBlue: 24, hueBlue: -16 },
    'Dreamy': { exposure: 34, curve: -30, lift: 40, clarity: -60, tint: 12, roll: 16, highR: 18, highB: 12 },
    'Milk': { exposure: 40, curve: -38, lift: 100, roll: 34, saturation: -34 },
  },
  Night: {
    'Neon': { curve: 70, blacks: -22, tint: 20, saturation: 36, vibrance: 34, clarity: 16, shadowR: 16, shadowB: 54, shadowG: -10, hueBlue: 26, satMagenta: 50, satPurple: 50, satAqua: 44 },
    'City Lights': { ...TEAL_ORANGE, exposure: 18, highlights: -40, shadows: 34, vibrance: 28, dehaze: 18, satOrange: 44 },
    'Midnight Blue': { ...COOL, exposure: -18, curve: 48, temperature: -58, saturation: -10, vignette: -34, shadowB: 60, hueOrange: 22 },
    'Cyber': { curve: 76, temperature: -36, tint: 42, saturation: 26, blacks: -24, hueOrange: -36, hueRed: -24, hueAqua: 20, satAqua: 50, shadowB: 50, shadowR: 24, highB: 22, highR: 18 },
    'Tungsten': { ...WARM, exposure: 12, curve: 40, temperature: 54, shadows: 24, vibrance: 14, grain: 24 },
    'After Dark': { ...COOL, exposure: -24, curve: 74, blacks: -32, highlights: -24, vibrance: 22, vignette: -42, satOrange: 34 },
    'Street Lamp': { ...FILM, ...WARM, temperature: 42, tint: -14, shadows: 18, saturation: -16, grain: 34, shadowG: 14, hueGreen: -24 },
    'Glow Night': { ...TEAL_ORANGE, exposure: 24, shadows: 46, highlights: -46, clarity: -24, vibrance: 28, lift: 16 },
  },
  'Black & White': {
    'Classic': { saturation: -100, curve: 46, clarity: 12 },
    'High Contrast': { saturation: -100, curve: 100, contrast: 18, whites: 22, blacks: -34, clarity: 26 },
    'Soft Gray': { saturation: -100, curve: -24, lift: 40, roll: 22, shadows: 26 },
    'Silver': { saturation: -100, exposure: 12, curve: 60, highlights: -26, clarity: 34, sharpness: 26, shadowB: 12, highB: 8 },
    'Noir': { saturation: -100, exposure: -30, curve: 100, blacks: -38, vignette: -60, lumOrange: -30 },
    'Red Filter': { saturation: -100, curve: 62, lumRed: 60, lumOrange: 60, lumYellow: 30, lumBlue: -90, lumAqua: -80, lumGreen: -50 },
    'Grain 3200': { saturation: -100, curve: 74, blacks: -18, grain: 100 },
    'Selenium': { saturation: -100, curve: 56, clarity: 18, shadowR: 6, shadowB: 16, shadowG: -6 },
  },
}

export const PRESET_CATEGORIES = Object.entries(CATALOG).map(([name, items]) => ({
  name,
  items: Object.entries(items).map(([label, vals]) => ({ id: `${name}/${label}`, label, vals })),
}))
export const PRESET_COUNT = PRESET_CATEGORIES.reduce((n, c) => n + c.items.length, 0)
