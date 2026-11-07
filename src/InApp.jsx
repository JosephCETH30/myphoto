import { useEffect, useState } from 'react'

// Social apps open links in their own built-in browser, where downloads often fail or save low-quality copies.
const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent
const APPS = [
  [/Instagram/i, 'Instagram'], [/Barcelona|Threads/i, 'Threads'], [/FBAN|FBAV|FB_IAB|FBIOS|FB4A/i, 'Facebook'],
  [/TikTok|musical_ly|BytedanceWebview|trill_/i, 'TikTok'], [/\bLine\//i, 'LINE'], [/Twitter/i, 'X'],
  [/Snapchat/i, 'Snapchat'], [/LinkedInApp/i, 'LinkedIn'], [/Pinterest/i, 'Pinterest'],
  [/MicroMessenger/i, 'WeChat'], [/KAKAOTALK/i, 'KakaoTalk'],
]
const hit = APPS.find(([re]) => re.test(ua))
export const IN_APP = !!hit || /; wv\)/.test(ua) // "; wv)" = generic Android WebView
const APP_NAME = hit?.[1] || 'this app'
const IOS = /iPhone|iPad|iPod/i.test(ua)
const ANDROID = /Android/i.test(ua)
const BROWSER = IOS ? 'Safari' : ANDROID ? 'Chrome' : 'your browser'

// Android: intent opens Chrome directly (falls back to the page). iOS 17+: x-safari- opens Safari.
const openUrl = () => {
  const u = location.href
  if (ANDROID) return `intent://${u.replace(/^https?:\/\//, '')}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u)};end`
  if (IOS) return `x-safari-${u}`
  return u
}
const copyLink = async () => {
  try { await navigator.clipboard.writeText(location.href); return true } catch { /* blocked in some webviews */ }
  const t = Object.assign(document.createElement('textarea'), { value: location.href })
  document.body.append(t); t.select()
  const ok = document.execCommand('copy')
  t.remove()
  return ok
}

let open = () => {}
// onContinue: what to do if they choose to stay (e.g. go on to the download). null = just the notice.
export const openInAppSheet = (onContinue) => open(onContinue)

export function InAppSheet() {
  const [state, setState] = useState(null) // null | { onContinue }
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    open = (onContinue) => { setCopied(false); setState({ onContinue }) }
    if (IN_APP) { // once per visit on arrival
      let seen = false
      try { seen = !!sessionStorage.inAppSeen; sessionStorage.inAppSeen = '1' } catch { /* storage blocked */ }
      if (!seen) setState({ onContinue: null })
    }
    return () => { open = () => {} }
  }, [])

  if (!state) return null
  const stay = () => { const f = state.onContinue; setState(null); f?.() }
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-gut" role="dialog" aria-modal="true" aria-labelledby="inapp-title">
      <div className="absolute inset-0 bg-ink/85" onClick={() => setState(null)} />
      <div className="relative w-full rounded-t-3xl border-t border-paper/10 bg-[#0b0b0b] px-6 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:max-w-md sm:rounded-3xl sm:border">
        <span className="mx-auto mb-5 block h-1 w-10 rounded-full bg-paper/20 sm:hidden" />
        <h2 id="inapp-title" className="text-xl font-medium text-paper">Open in {BROWSER} to download</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-paper/65">
          You’re viewing this inside {APP_NAME}. Its built-in browser often blocks downloads or saves smaller copies. Open the page in {BROWSER} to get the full-resolution photos.
        </p>
        <a href={openUrl()} className="mt-6 flex h-12 items-center justify-center rounded-full bg-paper text-[15px] font-medium text-ink">Open in {BROWSER}</a>
        <button onClick={async () => setCopied(await copyLink())} className="mt-2 h-12 w-full rounded-full bg-paper/[.08] text-[15px] text-paper">
          {copied ? `Link copied · paste it in ${BROWSER}` : 'Copy link'}
        </button>
        <p className="mt-4 text-[13px] leading-relaxed text-paper/50">
          If nothing happens: tap {IOS ? '•••' : '⋮'} in the corner of {APP_NAME}, then choose “Open in {IOS ? 'browser' : 'Chrome'}”.
        </p>
        <button onClick={stay} className="mt-4 w-full text-[13px] text-paper/55 underline-offset-4 hover:text-paper hover:underline">
          {state.onContinue ? 'Try downloading here anyway' : 'Not now'}
        </button>
      </div>
    </div>
  )
}
