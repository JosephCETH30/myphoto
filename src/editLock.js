// Password gate for the editor. Only a salted PBKDF2 hash ships ("salt:hash" hex, from .env.local).
// shortcut: client-side gate, a developer can bypass it in DevTools; real enforcement needs a server serving the editor code.
const [SALT, EXPECTED] = (import.meta.env.VITE_EDIT_PASS_HASH || '').split(':')
const ITERATIONS = 310000
const KEY = 'editUnlocked'

export const isEditUnlocked = () => { try { return sessionStorage.getItem(KEY) === '1' } catch { return false } }

export async function unlockEdit(password) {
  if (!EXPECTED) { console.error('VITE_EDIT_PASS_HASH is not set: editing stays locked'); return false }
  const salt = Uint8Array.from(SALT.match(/../g), (h) => parseInt(h, 16))
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256)
  const hex = [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('')
  if (hex !== EXPECTED) return false
  try { sessionStorage.setItem(KEY, '1') } catch { /* private mode: unlocked until the viewer closes */ }
  return true
}
