import { createElement, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

interface EmbeddedBrowserPaneProps {
  onClose: () => void
}

const DEFAULT_URL = 'https://www.google.com'

type WebviewElement = HTMLElement & {
  canGoBack?: () => boolean
  canGoForward?: () => boolean
  getURL?: () => string
  goBack?: () => void
  goForward?: () => void
  loadURL?: (url: string) => void
  reload?: () => void
}

function normalizeBrowserUrl(value: string) {
  const raw = value.trim()

  if (!raw) return DEFAULT_URL
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(raw)) return `https://${raw}`

  return `https://www.google.com/search?q=${encodeURIComponent(raw)}`
}

export function EmbeddedBrowserPane({ onClose }: EmbeddedBrowserPaneProps) {
  const webviewRef = useRef<WebviewElement | null>(null)
  const [url, setUrl] = useState(DEFAULT_URL)

  const navigate = () => {
    const next = normalizeBrowserUrl(url)
    setUrl(next)
    webviewRef.current?.loadURL?.(next)
  }

  const syncUrl = () => {
    const current = webviewRef.current?.getURL?.()
    if (current) setUrl(current)
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

  const webview = createElement('webview', {
    allowpopups: 'true',
    className: 'min-h-0 flex-1 bg-white',
    onDidNavigate: syncUrl,
    onDidNavigateInPage: syncUrl,
    partition: 'persist:hermes-browser-popout',
    ref: (node: WebviewElement | null) => {
      webviewRef.current = node
    },
    src: DEFAULT_URL
  })

  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-l border-(--ui-stroke-secondary) bg-(--ui-editor-surface-background) pt-(--titlebar-height)">
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-(--ui-stroke-secondary) px-2">
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
            'h-7 min-w-0 flex-1 rounded-md border border-(--ui-stroke-secondary) bg-background px-2 text-xs text-foreground outline-none',
            'focus:border-(--ui-stroke-primary) focus:ring-1 focus:ring-(--ui-stroke-primary)'
          )}
          onChange={event => setUrl(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') navigate()
          }}
          spellCheck={false}
          value={url}
        />
        <Button aria-label="Go" onClick={navigate} size="xs" title="Go" variant="secondary">
          Go
        </Button>
        <Button aria-label="Copy URL" onClick={() => void copyUrl()} size="icon-xs" title="Copy URL" variant="ghost">
          <Codicon name="copy" size="0.875rem" />
        </Button>
        <Button aria-label="Close browser" onClick={onClose} size="icon-xs" title="Close browser" variant="ghost">
          <Codicon name="close" size="0.875rem" />
        </Button>
      </div>
      {webview}
    </section>
  )
}
