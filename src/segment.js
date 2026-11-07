// "Object" masks: tap an object, MediaPipe's interactive segmenter (runs in the browser) returns its mask.
// Loaded only when someone first uses it: ~13MB wasm (jsDelivr) + ~6MB model (Google). Photos never leave the device.
const VERSION = '1.1.1' // keep in sync with package.json
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`
const MODEL = 'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite'

let ready = null
const load = () => {
  ready ??= (async () => {
    const { FilesetResolver, InteractiveSegmenterLegacy } = await import('@mediapipe/tasks-vision')
    const files = await FilesetResolver.forVisionTasks(WASM)
    const make = (delegate) => InteractiveSegmenterLegacy.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    })
    try { return await make('GPU') } catch { return await make('CPU') } // GPU delegate can fail (old phones, headless)
  })().catch((e) => { ready = null; throw e })
  return ready
}

// image: canvas/img; x, y: tap point in 0..1. Resolves { w, h, data: Float32Array of 0..1 confidences }.
export async function segmentAt(image, x, y) {
  const seg = await load()
  return new Promise((resolve, reject) => {
    try {
      seg.segment(image, { keypoint: { x, y } }, (result) => {
        const m = result.confidenceMasks?.[0]
        if (!m) return reject(new Error('no mask'))
        resolve({ w: m.width, h: m.height, data: m.getAsFloat32Array().slice() }) // copy: data dies with the callback
        result.close?.()
      })
    } catch (e) { reject(e) }
  })
}
