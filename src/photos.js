// Filenames come automatically from public/thanks-for-coming/ (see vite.config.js).
// Add a title and description per file; they show under the photo when it's opened.
// Photos without an entry get a title made from the filename.
import files from 'virtual:photos'

const info = {
  'inka_photo_upload_web.jpg': { title: '', description: '' },
  'mri_ujungperon_person_photo_upload_web.jpg': { title: '', description: '' },
}

// "mri_ujungperon_person_photo_upload_web.jpg" → "Mri ujungperon person"
const fromName = (f) => {
  const s = f.replace(/\.\w+$/, '').replace(/[_-]+(photo|upload|web)(?=[_-]|$)/gi, '').replace(/[_-]+/g, ' ').trim()
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export default files.map((src) => ({
  src,
  title: info[src]?.title || fromName(src),
  description: info[src]?.description || '',
}))
