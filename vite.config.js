import { readdirSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const DIR = 'public/thanks-for-coming'
const isImage = (f) => /\.(jpe?g|png|webp|avif)$/i.test(f)
const listPhotos = () =>
  readdirSync(DIR).filter(isImage).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

// Virtual module "virtual:photos" = filenames in DIR, re-read when files are added/removed.
const photos = () => ({
  name: 'photos',
  resolveId: (id) => (id === 'virtual:photos' ? '\0photos' : null),
  load: (id) => (id === '\0photos' ? `export default ${JSON.stringify(listPhotos())}` : null),
  configureServer(server) {
    server.watcher.add(DIR)
    const reload = (f) => {
      if (!f.includes('thanks-for-coming') || !isImage(f)) return
      const mod = server.moduleGraph.getModuleById('\0photos')
      if (mod) server.moduleGraph.invalidateModule(mod)
      server.ws.send({ type: 'full-reload' })
    }
    server.watcher.on('add', reload).on('unlink', reload)
  },
})

export default defineConfig({ plugins: [react(), tailwindcss(), photos()] })
