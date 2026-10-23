// Story-size image (1080 x 1920) of the prophetic word a guest received after
// a QR check-in, for saving or sharing to a social story. Drawn on a canvas in
// the browser: no upload, no server. Three designs share one layout grid that
// keeps text inside the story safe area (Instagram covers ~250px top and
// bottom with its own controls).

export type StoryDesign = 'night' | 'card' | 'light'

export const STORY_DESIGNS: { id: StoryDesign; label: string }[] = [
  { id: 'night', label: 'Night' },
  { id: 'card', label: 'Card' },
  { id: 'light', label: 'Light' },
]

export interface StoryContent {
  text: string
  reference: string
  translation: string | null
  serviceName: string
}

const W = 1080
const H = 1920
const SITE = 'questlaguna.org'
const SERIF = "'Source Serif 4 Variable', ui-serif, Georgia, serif"
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Ubuntu, sans-serif"

const PALETTE = {
  night: { ink: '#FFF4F2', accent: '#F8B4B4', muted: 'rgba(255,255,255,0.62)', rule: 'rgba(248,180,180,0.38)' },
  card: { ink: '#2A1015', accent: '#8B1538', muted: 'rgba(107,15,43,0.72)', rule: 'rgba(139,21,56,0.32)' },
  light: { ink: '#3B0F1C', accent: '#8B1538', muted: 'rgba(107,15,43,0.70)', rule: 'rgba(139,21,56,0.30)' },
} as const

/**
 * Greedy word wrap: the fewest lines where each fits `maxWidth` per `measure`.
 * A single word wider than the line still gets its own line.
 */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && measure(next) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Line height of the word text, as a multiple of its font size. */
export const LINE_HEIGHT = 1.3

/**
 * Largest font size (stepping down from `max`) whose wrapped text fits within
 * `maxLines` lines and `maxHeight` pixels. Returns the size and its lines.
 */
export function fitText(
  text: string,
  maxWidth: number,
  maxLines: number,
  measureAt: (size: number, s: string) => number,
  max = 80,
  min = 44,
  maxHeight = Infinity,
): { size: number; lines: string[] } {
  for (let size = max; size >= min; size -= 2) {
    const lines = wrapLines(text, maxWidth, (s) => measureAt(size, s))
    if (lines.length <= maxLines && lines.length * Math.round(size * LINE_HEIGHT) <= maxHeight) return { size, lines }
  }
  return { size: min, lines: wrapLines(text, maxWidth, (s) => measureAt(min, s)) }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

function background(ctx: CanvasRenderingContext2D, design: StoryDesign) {
  if (design === 'light') {
    ctx.fillStyle = '#FBF6EE'
    ctx.fillRect(0, 0, W, H)
    const glow = ctx.createRadialGradient(W / 2, H * 0.42, 60, W / 2, H * 0.42, H * 0.7)
    glow.addColorStop(0, 'rgba(248,180,180,0.28)')
    glow.addColorStop(1, 'rgba(248,180,180,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(139,21,56,0.28)'
    ctx.lineWidth = 3
    ctx.strokeRect(48, 48, W - 96, H - 96)
    return
  }
  const g = ctx.createLinearGradient(0, 0, W, H)
  g.addColorStop(0, '#1A0A0E')
  g.addColorStop(0.5, '#2D1218')
  g.addColorStop(1, '#6B0F2B')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const glow = ctx.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H * 0.45, H * 0.6)
  glow.addColorStop(0, 'rgba(139,21,56,0.35)')
  glow.addColorStop(1, 'rgba(139,21,56,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, W, H)
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: HTMLImageElement | null, design: StoryDesign) {
  const size = 132
  const x = (W - size) / 2
  const y = 290
  if (logo) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(W / 2, y + size / 2, size / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(logo, x, y, size, size)
    ctx.restore()
  }
  ctx.fillStyle = design === 'light' ? '#8B1538' : '#F8B4B4'
  ctx.font = `600 30px ${SANS}`
  ctx.textAlign = 'center'
  ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '6px'
  ctx.fillText('QUEST LAGUNA', W / 2, y + size + 62)
  ;(ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '0px'
}

function drawFooter(ctx: CanvasRenderingContext2D, design: StoryDesign) {
  ctx.textAlign = 'center'
  ctx.fillStyle = design === 'light' ? '#8B1538' : '#F8B4B4'
  ctx.font = `600 34px ${SANS}`
  ctx.fillText(SITE, W / 2, 1640)
}

/** Draws the story image and returns it as a JPEG blob. Browser only. */
export async function renderStoryImage(content: StoryContent, design: StoryDesign, logoSrc: string): Promise<Blob> {
  await Promise.all([
    document.fonts.load(`400 72px 'Source Serif 4 Variable'`, content.text),
    document.fonts.load(`400 160px 'Source Serif 4 Variable'`, '“'),
  ]).catch(() => undefined)
  const logo = await loadImage(logoSrc)

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image not available on this browser.')
  const p = PALETTE[design]

  background(ctx, design)
  drawLogo(ctx, logo, design)

  // Word block, centered between the logo (ends ~520) and the footer (~1640).
  const boxWidth = design === 'card' ? 760 : 860
  const measureAt = (size: number, s: string) => {
    ctx.font = `400 ${size}px ${SERIF}`
    return ctx.measureText(s).width
  }
  // Text height budget: the caption must stay clear of the footer (1640), and
  // the card is taller than its text.
  const maxHeight = design === 'card' ? 600 : 680
  const { size, lines } = fitText(content.text, boxWidth, 8, measureAt, design === 'card' ? 68 : 78, 40, maxHeight)
  const lineHeight = Math.round(size * LINE_HEIGHT)
  const textHeight = lines.length * lineHeight
  const captionHeight = 150
  // Room above the text: the quote mark, or the card's top padding.
  const leadIn = design === 'card' ? 40 : 110
  const blockHeight = leadIn + textHeight + captionHeight
  const top = Math.max(600, Math.round(560 + (1080 - blockHeight) / 2))

  if (design === 'card') {
    const cardX = 110
    const cardY = top - 80
    const cardW = W - 220
    const cardH = blockHeight + 170
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,0.5)'
    ctx.shadowBlur = 60
    ctx.shadowOffsetY = 28
    ctx.fillStyle = '#FBF6EE'
    ctx.beginPath()
    ctx.roundRect(cardX, cardY, cardW, cardH, 44)
    ctx.fill()
    ctx.restore()
    ctx.strokeStyle = 'rgba(139,21,56,0.22)'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.roundRect(cardX + 22, cardY + 22, cardW - 44, cardH - 44, 30)
    ctx.stroke()
  } else {
    ctx.fillStyle = design === 'light' ? 'rgba(139,21,56,0.30)' : 'rgba(248,180,180,0.45)'
    ctx.font = `400 170px ${SERIF}`
    ctx.textAlign = 'center'
    ctx.fillText('“', W / 2, top + 110)
  }

  ctx.fillStyle = p.ink
  ctx.font = `400 ${size}px ${SERIF}`
  ctx.textAlign = 'center'
  let y = top + leadIn + lineHeight * 0.85
  for (const line of lines) {
    ctx.fillText(line, W / 2, y)
    y += lineHeight
  }

  // Caption: rule, reference, rule; then the service.
  const capY = y + 40
  ctx.font = `700 38px ${SANS}`
  ctx.fillStyle = p.accent
  // A list without a passage reference: "Prophetic word" takes its place.
  const label = content.reference || 'Prophetic word'
  const ref = content.translation ? `${label} ${content.translation}` : label
  ctx.fillText(ref, W / 2, capY)
  const refWidth = ctx.measureText(ref).width
  ctx.strokeStyle = p.rule
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(W / 2 - refWidth / 2 - 90, capY - 12)
  ctx.lineTo(W / 2 - refWidth / 2 - 26, capY - 12)
  ctx.moveTo(W / 2 + refWidth / 2 + 26, capY - 12)
  ctx.lineTo(W / 2 + refWidth / 2 + 90, capY - 12)
  ctx.stroke()
  ctx.font = `500 30px ${SANS}`
  ctx.fillStyle = p.muted
  ctx.fillText(content.reference ? `Prophetic word · ${content.serviceName}` : content.serviceName, W / 2, capY + 54)

  drawFooter(ctx, design)

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image not created.'))), 'image/jpeg', 0.92),
  )
}

export function storyFileName(reference: string, design: StoryDesign): string {
  const slug = reference.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'word'
  return `prophetic-word-${slug}-${design}.jpg`
}
