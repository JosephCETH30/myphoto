# View counts (saved, not active)

Live total views per photo. Removed from the site for now, kept here to switch back on later.
Nothing in this folder is built or deployed.

## What's here

| File | Goes back to | What it does |
|---|---|---|
| `src/views.js` | `src/views.js` | Fetches counts (`GET /api/views`, every 10s while the tab is visible), sends a view (`POST /api/views`), once per photo per visit |
| `src/Views.jsx` | `src/Views.jsx` | The eye-icon badge with the total |
| `netlify/functions/views.mjs` | `netlify/functions/views.mjs` | Server: stores counts in Netlify Blobs, ETag-safe increments, only accepts photos listed in `/photos.json` |
| `netlify.toml` | project root | Tells Netlify to build and deploy the function |

## Turn it back on (Netlify)

1. Move the files back to the paths above.
2. `npm i @netlify/blobs@11.1.6 --save-exact`
3. `vite.config.js`, inside the `photos()` plugin object, add:
   ```js
   generateBundle() {
     this.emitFile({ type: 'asset', fileName: 'photos.json', source: JSON.stringify(listPhotos()) })
   },
   ```
4. `src/Carousel.jsx`
   ```js
   import Views from './Views.jsx'
   import { countView } from './views.js'
   // inside Carousel(): a slide counts after 1.5s on screen
   useEffect(() => {
     if (!n) return
     const t = setTimeout(() => countView(photos[i].src), 1500)
     return () => clearTimeout(t)
   }, [i, photos, n])
   // bottom bar, replace the counter span with:
   <span className="flex items-center gap-4"><span aria-live="polite">{pad(i + 1)} / {pad(n)}</span><Views id={p.src} /></span>
   ```
5. `src/Gallery.jsx`
   ```js
   import Views from './Views.jsx'
   // first child of each <figure>:
   <Views id={p.src} className="pointer-events-none absolute bottom-2 left-2 z-10 rounded-full bg-ink/70 px-2.5 py-1 text-[12px] text-paper" />
   ```
6. `src/Lightbox.jsx`
   ```js
   import Views from './Views.jsx'
   import { countView } from './views.js'
   // inside Lightbox(): opening a photo counts as a view
   useEffect(() => {
     const t2 = setTimeout(() => countView(p.src), 800)
     return () => clearTimeout(t2)
   }, [p.src])
   // sidebar counter becomes:
   <span className="flex flex-col items-center gap-1 text-[13px] text-paper/60 tabular-nums max-lg:flex-row max-lg:gap-3">{index + 1} / {n}<Views id={p.src} className="text-xs text-paper/45" /></span>
   ```
7. Deploy with functions: `npx netlify-cli deploy --build --prod` (drag-and-drop skips functions).

## Notes before turning it on

- Polling every 10s per visitor uses many function calls on a free plan. Consider 30–60s, or switch to Firebase Firestore
  (real-time push, no server, works with drag-and-drop deploys).
- The local Blobs emulator doesn't return ETags, so atomic increments were verified with an ETag-correct test store,
  not against real Netlify Blobs. After deploying: open one photo from two phones, the count should go up by 2.
- No per-IP rate limit: someone clearing their browser data repeatedly can add views.
