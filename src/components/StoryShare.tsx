// Save or share the prophetic word as a story image. Three designs are drawn
// once when this mounts, so the Share tap can open the phone's share sheet at
// once (Safari only allows it straight from the tap). Browsers cannot open the
// Instagram story editor directly; the share sheet lists Instagram, Facebook,
// Messenger and "Save Image". Without file sharing (most desktops): download.

import { useEffect, useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import {
  STORY_DESIGNS,
  renderStoryImage,
  storyFileName,
  type StoryContent,
  type StoryDesign,
} from '../lib/storyImage'

interface Rendered {
  file: File
  url: string
}

export function StoryShare({ content, logoSrc }: { content: StoryContent; logoSrc: string }) {
  const [images, setImages] = useState<Partial<Record<StoryDesign, Rendered>>>({})
  const [design, setDesign] = useState<StoryDesign>('night')
  const [failed, setFailed] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let active = true
    const urls: string[] = []
    ;(async () => {
      try {
        for (const { id } of STORY_DESIGNS) {
          const blob = await renderStoryImage(content, id, logoSrc)
          if (!active) return
          const file = new File([blob], storyFileName(content.reference, id), { type: 'image/jpeg' })
          const url = URL.createObjectURL(blob)
          urls.push(url)
          setImages((prev) => ({ ...prev, [id]: { file, url } }))
        }
      } catch {
        if (active) setFailed(true)
      }
    })()
    return () => {
      active = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
  }, [content, logoSrc])

  const current = images[design]
  const canShareFiles =
    current !== undefined &&
    typeof navigator !== 'undefined' &&
    typeof navigator.canShare === 'function' &&
    navigator.canShare({ files: [current.file] })

  const share = async () => {
    if (!current) return
    setNotice('')
    try {
      await navigator.share({ files: [current.file], title: 'Prophetic word' })
    } catch (err) {
      // Closing the share sheet is not an error.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setNotice('Share not available. Use Download.')
      }
    }
  }

  if (failed) return null

  return (
    <section aria-label="Story image" className="mt-12 rounded-2xl bg-white/[0.06] px-4 pb-5 pt-4 ring-1 ring-white/10">
      <h3 className="text-center text-sm font-semibold text-white">Story image</h3>
      <div className="mt-3 grid grid-cols-3 gap-3" role="radiogroup" aria-label="Story design">
        {STORY_DESIGNS.map(({ id, label }) => {
          const img = images[id]
          const selected = design === id
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setDesign(id)}
              className={`group rounded-xl p-1 transition-shadow ${selected ? 'ring-2 ring-[#F8B4B4]' : 'ring-1 ring-white/15'}`}
            >
              <span className="block aspect-[9/16] overflow-hidden rounded-lg bg-white/10">
                {img ? (
                  <img src={img.url} alt={`${label} design`} className="h-full w-full object-cover" />
                ) : (
                  <span className="block h-full w-full animate-pulse bg-white/10" />
                )}
              </span>
              <span className={`mt-1.5 block text-xs font-medium ${selected ? 'text-white' : 'text-white/60'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
      <div className="mt-4 flex gap-3">
        {canShareFiles && (
          <button
            type="button"
            onClick={share}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[#F8B4B4] text-base font-semibold text-[#3B0F1C] active:scale-[0.98] transition-transform"
          >
            <Share2 className="h-5 w-5" aria-hidden /> Share image
          </button>
        )}
        <a
          href={current?.url}
          download={current?.file.name}
          aria-disabled={!current}
          className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-xl text-base font-semibold active:scale-[0.98] transition-transform ${
            canShareFiles ? 'bg-white/10 text-white ring-1 ring-white/20' : 'bg-[#F8B4B4] text-[#3B0F1C]'
          } ${current ? '' : 'pointer-events-none opacity-50'}`}
        >
          <Download className="h-5 w-5" aria-hidden /> Download
        </a>
      </div>
      {notice && <p className="mt-2 text-center text-xs text-[#F8B4B4]">{notice}</p>}
    </section>
  )
}
