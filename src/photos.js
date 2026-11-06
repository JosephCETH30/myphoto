// Filenames come automatically from public/thanks-for-coming/ (see vite.config.js).
// Optional titles (used as alt text): { 'IMG_0001.jpg': 'Golden hour' }
import files from 'virtual:photos'

const titles = {}

export default files.map((src) => ({ src, title: titles[src] }))
