import { createElement, type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

interface EmbeddedBrowserPaneProps {
  floating?: boolean
  onClose: () => void
  onToggleFloating?: () => void
}

interface FloatingBrowserWindowProps {
  onClose: () => void
  onDock: () => void
}

interface FloatingBrowserBounds {
  height: number
  width: number
  x: number
  y: number
}

const DEFAULT_URL = 'https://www.google.com'
const FLOATING_BOUNDS_KEY = 'hermes:embedded-browser:floating-bounds'
const DEFAULT_FLOATING_BOUNDS: FloatingBrowserBounds = { height: 560, width: 780, x: 360, y: 96 }
const MIN_FLOATING_HEIGHT = 280
const MIN_FLOATING_WIDTH = 420

type WebviewElement = HTMLElement & {
  canGoBack?: () => boolean
  canGoForward?: () => boolean
  getURL?: () => string
  goBack?: () => void
  goForward?: () => void
  loadURL?: (url: string) => void
  reload?: () => void
  executeJavaScript?: (code: string) => Promise<unknown>
}

function normalizeBrowserUrl(value: string) {
  const raw = value.trim()

  if (!raw) return DEFAULT_URL
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(raw)) return `https://${raw}`

  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`
}

function clampFloatingBounds(bounds: FloatingBrowserBounds): FloatingBrowserBounds {
  const maxWidth = Math.max(MIN_FLOATING_WIDTH, window.innerWidth - 24)
  const maxHeight = Math.max(MIN_FLOATING_HEIGHT, window.innerHeight - 24)
  const width = Math.min(Math.max(bounds.width, MIN_FLOATING_WIDTH), maxWidth)
  const height = Math.min(Math.max(bounds.height, MIN_FLOATING_HEIGHT), maxHeight)

  return {
    height,
    width,
    x: Math.min(Math.max(bounds.x, 8), Math.max(8, window.innerWidth - width - 8)),
    y: Math.min(Math.max(bounds.y, 42), Math.max(42, window.innerHeight - height - 8))
  }
}

function readFloatingBounds(): FloatingBrowserBounds {
  try {
    const parsed = JSON.parse(localStorage.getItem(FLOATING_BOUNDS_KEY) || '')

    if (
      parsed &&
      Number.isFinite(parsed.x) &&
      Number.isFinite(parsed.y) &&
      Number.isFinite(parsed.width) &&
      Number.isFinite(parsed.height)
    ) {
      return clampFloatingBounds(parsed)
    }
  } catch {
    // Ignore malformed localStorage and fall back to defaults.
  }

  return clampFloatingBounds(DEFAULT_FLOATING_BOUNDS)
}

function persistFloatingBounds(bounds: FloatingBrowserBounds) {
  try {
    localStorage.setItem(FLOATING_BOUNDS_KEY, JSON.stringify(bounds))
  } catch {
    // Non-critical; the browser still works if localStorage is unavailable.
  }
}

const TOGGLE_CINEMA_SCRIPT = String.raw`(() => {
  const styleId = 'hermes-bounded-cinema-style'
  const existing = document.getElementById(styleId)

  if (existing) {
    existing.remove()
    document.documentElement.classList.remove('hermes-bounded-cinema')
    document.body?.classList.remove('hermes-bounded-cinema')
    return false
  }

  const style = document.createElement('style')
  style.id = styleId
  style.textContent = \`
    html.hermes-bounded-cinema,
    body.hermes-bounded-cinema {
      background: #000 !important;
      height: 100vh !important;
      margin: 0 !important;
      overflow: hidden !important;
    }

    body.hermes-bounded-cinema ytd-app,
    body.hermes-bounded-cinema #page-manager,
    body.hermes-bounded-cinema ytd-watch-flexy,
    body.hermes-bounded-cinema #columns,
    body.hermes-bounded-cinema #primary,
    body.hermes-bounded-cinema #primary-inner,
    body.hermes-bounded-cinema #player,
    body.hermes-bounded-cinema #player-container,
    body.hermes-bounded-cinema #movie_player,
    body.hermes-bounded-cinema .html5-video-player,
    body.hermes-bounded-cinema .html5-video-container,
    body.hermes-bounded-cinema video {
      height: 100vh !important;
      inset: 0 !important;
      margin: 0 !important;
      max-height: none !important;
      max-width: none !important;
      padding: 0 !important;
      position: fixed !important;
      transform: none !important;
      width: 100vw !important;
      z-index: 2147483647 !important;
    }

    body.hermes-bounded-cinema video {
      object-fit: contain !important;
      background: #000 !important;
    }

    body.hermes-bounded-cinema ytd-masthead,
    body.hermes-bounded-cinema #masthead-container,
    body.hermes-bounded-cinema #secondary,
    body.hermes-bounded-cinema #comments,
    body.hermes-bounded-cinema #below,
    body.hermes-bounded-cinema #chat,
    body.hermes-bounded-cinema ytd-watch-metadata,
    body.hermes-bounded-cinema ytd-merch-shelf-renderer,
    body.hermes-bounded-cinema ytd-playlist-panel-renderer {
      display: none !important;
    }
  \`
  document.documentElement.classList.add('hermes-bounded-cinema')
  document.body?.classList.add('hermes-bounded-cinema')
  document.head.appendChild(style)
  return true
})()`

export function EmbeddedBrowserPane({ floating = false, onClose, onToggleFloating }: EmbeddedBrowserPaneProps) {
  const webviewRef = useRef<WebviewElement | null>(null)
  const [url, setUrl] = useState(DEFAULT_URL)
  const [toolbarHidden, setToolbarHidden] = useState(false)
  const [cinemaModeActive, setCinemaModeActive] = useState(false)

  const navigate = () => {
    const next = normalizeBrowserUrl(url)
    setUrl(next)
    webviewRef.current?.loadURL?.(next)
  }

  const syncUrl = () => {
    const current = webviewRef.current?.getURL?.()
    if (current) setUrl(current)
  }

  const handleNavigate = () => {
    setCinemaModeActive(false)
    syncUrl()
  }

  const copyUrl = async () => {
    const current = webviewRef.current?.getURL?.() || url
    setUrl(current)

    try {
      await navigator.clipboard.writeText(current)
    } catch {
      // Clipboard can be unavailable in sandboxed renderer contexts; selecting
      // the text still gives the user a manual fallback.
    }
  }

  const toggleCinemaMode = async () => {
    try {
      const active = await webviewRef.current?.executeJavaScript?.(TOGGLE_CINEMA_SCRIPT)
      setCinemaModeActive(Boolean(active))
      setToolbarHidden(Boolean(active))
    } catch {
      setCinemaModeActive(false)
    }
  }

  const webview = createElement('webview', {
    allowpopups: 'true',
    className: 'min-h-0 flex-1 bg-white',
    onDidNavigate: handleNavigate,
    onDidNavigateInPage: syncUrl,
    partition: 'persist:hermes-browser-popout',
    ref: (node: WebviewElement | null) => {
      webviewRef.current = node
    },
    src: DEFAULT_URL
  })

  return (
    <section
      className={cn(
        'group/browser relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-(--ui-editor-surface-background)',
        floating
          ? 'rounded-xl border border-(--ui-stroke-secondary) shadow-2xl'
          : 'border-l border-(--ui-stroke-secondary) pt-(--titlebar-height)'
      )}
    >
      <div
        className={cn(
          'z-10 flex h-8 shrink-0 items-center gap-1 rounded-lg border border-(--ui-stroke-secondary) bg-(--ui-editor-surface-background)/85 px-1.5 shadow-sm backdrop-blur transition-all duration-150',
          toolbarHidden ? 'pointer-events-none -translate-y-1 opacity-0' : 'opacity-[0.14] hover:opacity-100 focus-within:opacity-100',
          floating
            ? 'absolute left-2 right-2 top-2 cursor-move select-none [app-region:no-drag]'
            : 'mx-2 mb-1 mt-1 cursor-move select-none [app-region:no-drag]'
        )}
        data-browser-drag-handle="true"
      >
        <Button
          aria-label="Back"
          onClick={() => {
            if (webviewRef.current?.canGoBack?.()) webviewRef.current.goBack?.()
          }}
          size="icon-xs"
          title="Back"
          variant="ghost"
        >
          <Codicon name="arrow-left" size="0.875rem" />
        </Button>
        <Button
          aria-label="Forward"
          onClick={() => {
            if (webviewRef.current?.canGoForward?.()) webviewRef.current.goForward?.()
          }}
          size="icon-xs"
          title="Forward"
          variant="ghost"
        >
          <Codicon name="arrow-right" size="0.875rem" />
        </Button>
        <Button
          aria-label="Reload"
          onClick={() => webviewRef.current?.reload?.()}
          size="icon-xs"
          title="Reload"
          variant="ghost"
        >
          <Codicon name="refresh" size="0.875rem" />
        </Button>
        <input
          aria-label="Browser URL or search"
          className={cn(
            'h-6 min-w-0 flex-1 rounded-md border border-(--ui-stroke-secondary)/70 bg-background/70 px-2 text-[0.68rem] text-foreground/80 outline-none transition-all',
            'placeholder:text-foreground/35 hover:bg-background focus:border-(--ui-stroke-primary) focus:bg-background focus:text-foreground focus:ring-1 focus:ring-(--ui-stroke-primary)'
          )}
          onChange={event => setUrl(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') navigate()
          }}
          onPointerDown={event => event.stopPropagation()}
          spellCheck={false}
          value={url}
        />
        <Button aria-label="Go" onClick={navigate} onPointerDown={event => event.stopPropagation()} size="xs" title="Go" variant="secondary">
          Go
        </Button>
        <Button aria-label="Copy URL" onClick={() => void copyUrl()} onPointerDown={event => event.stopPropagation()} size="icon-xs" title="Copy URL" variant="ghost">
          <Codicon name="copy" size="0.875rem" />
        </Button>
        {onToggleFloating && (
          <Button
            aria-label={floating ? 'Dock browser' : 'Float browser'}
            onClick={onToggleFloating}
            onPointerDown={event => event.stopPropagation()}
            size="icon-xs"
            title={floating ? 'Dock browser' : 'Float browser'}
            variant="ghost"
          >
            <Codicon name={floating ? 'layout-sidebar-right' : 'multiple-windows'} size="0.875rem" />
          </Button>
        )}
        <Button
          aria-label={cinemaModeActive ? 'Exit bounded cinema mode' : 'Enter bounded cinema mode'}
          onClick={() => void toggleCinemaMode()}
          onPointerDown={event => event.stopPropagation()}
          size="icon-xs"
          title={cinemaModeActive ? 'Exit bounded cinema mode' : 'Fit video to this floating window'}
          variant={cinemaModeActive ? 'secondary' : 'ghost'}
        >
          <Codicon name="screen-full" size="0.875rem" />
        </Button>
        <Button
          aria-label="Hide browser controls"
          onClick={() => setToolbarHidden(true)}
          onPointerDown={event => event.stopPropagation()}
          size="icon-xs"
          title="Hide controls for picture-in-picture mode"
          variant="ghost"
        >
          <span className="text-[0.7rem] leading-none">▴</span>
        </Button>
        <Button aria-label="Close browser" onClick={onClose} onPointerDown={event => event.stopPropagation()} size="icon-xs" title="Close browser" variant="ghost">
          <Codicon name="close" size="0.875rem" />
        </Button>
      </div>
      {toolbarHidden && (
        <button
          aria-label="Show browser controls"
          className={cn(
            'absolute left-1/2 top-2 z-20 h-5 -translate-x-1/2 rounded-full border border-(--ui-stroke-secondary) bg-(--ui-editor-surface-background)/75 px-2 text-[0.65rem] text-foreground/60 opacity-20 shadow-sm backdrop-blur transition-opacity hover:text-foreground hover:opacity-100 focus:opacity-100',
            !floating && 'top-[calc(var(--titlebar-height)+0.5rem)]'
          )}
          onClick={() => setToolbarHidden(false)}
          title="Show browser controls"
          type="button"
        >
          controls
        </button>
      )}
      {webview}
    </section>
  )
}

export function FloatingBrowserWindow({ onClose, onDock }: FloatingBrowserWindowProps) {
  const [bounds, setBounds] = useState<FloatingBrowserBounds>(() => readFloatingBounds())
  const dragRef = useRef<
    | {
        bounds: FloatingBrowserBounds
        pointerId: number
        startX: number
        startY: number
        type: 'drag' | 'resize'
      }
    | null
  >(null)

  useEffect(() => {
    persistFloatingBounds(bounds)
  }, [bounds])

  useEffect(() => {
    const onResize = () => setBounds(current => clampFloatingBounds(current))
    window.addEventListener('resize', onResize)

    return () => window.removeEventListener('resize', onResize)
  }, [])

  const startPointerAction = (event: ReactPointerEvent<HTMLElement>, type: 'drag' | 'resize') => {
    if (event.button !== 0) return

    const target = event.target as HTMLElement
    if (type === 'drag' && !target.closest('[data-browser-drag-handle="true"]')) return
    if (target.closest('button,input')) return

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      bounds,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      type
    }
  }

  const updatePointerAction = (event: ReactPointerEvent<HTMLElement>) => {
    const action = dragRef.current
    if (!action || action.pointerId !== event.pointerId) return

    const dx = event.clientX - action.startX
    const dy = event.clientY - action.startY

    setBounds(
      clampFloatingBounds(
        action.type === 'drag'
          ? { ...action.bounds, x: action.bounds.x + dx, y: action.bounds.y + dy }
          : { ...action.bounds, height: action.bounds.height + dy, width: action.bounds.width + dx }
      )
    )
  }

  const endPointerAction = (event: ReactPointerEvent<HTMLElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null
    }
  }

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      <div
        className="pointer-events-auto absolute"
        onPointerDown={event => startPointerAction(event, 'drag')}
        onPointerMove={updatePointerAction}
        onPointerUp={endPointerAction}
        style={{ height: bounds.height, left: bounds.x, top: bounds.y, width: bounds.width }}
      >
        <EmbeddedBrowserPane floating onClose={onClose} onToggleFloating={onDock} />
        <div
          aria-label="Resize browser"
          className="absolute bottom-1 right-1 h-4 w-4 cursor-nwse-resize rounded-sm border-b-2 border-r-2 border-white/25 opacity-20 transition-opacity hover:border-white/60 hover:opacity-100"
          onPointerDown={event => startPointerAction(event, 'resize')}
          onPointerMove={updatePointerAction}
          onPointerUp={endPointerAction}
          role="separator"
        />
      </div>
    </div>
  )
}
