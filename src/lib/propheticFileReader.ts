// Reads an uploaded prophetic-word file in the browser (nothing is uploaded):
// PDF via pdf.js, Excel/CSV via SheetJS, plain text as is. Both libraries are
// loaded only when a file is read, so they stay out of the SSR bundle and the
// rest of the app.

import { parsePropheticRows, parsePropheticText, pdfItemsToText, type ParsedWordList } from './propheticImport'

export const ACCEPTED_FILES = '.pdf,.xlsx,.xls,.csv,.txt'
const MAX_FILE_BYTES = 10 * 1024 * 1024

async function readPdf(file: File): Promise<string> {
  // The legacy build carries polyfills: the modern one needs very new browser
  // features (e.g. Uint8Array.toHex) that many phones and laptops lack.
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  try {
    const doc = await task.promise
    const pages: string[] = []
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      const items = content.items.flatMap((i) =>
        'str' in i
          ? [{ str: i.str, x: i.transform[4], y: i.transform[5], width: i.width, height: i.height }]
          : [],
      )
      pages.push(pdfItemsToText(items))
    }
    return pages.join('\n')
  } finally {
    await task.destroy()
  }
}

async function readSheet(file: File): Promise<unknown[][]> {
  const XLSX = await import('xlsx')
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  const sheet = book.Sheets[book.SheetNames[0]]
  if (!sheet) return []
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false })
}

/** Parses an uploaded file into a word list for the preview. */
export async function readPropheticFile(file: File): Promise<ParsedWordList> {
  if (file.size > MAX_FILE_BYTES) throw new Error('File over 10 MB. Use a smaller file or paste the text.')
  const name = file.name.toLowerCase()
  if (name.endsWith('.pdf')) {
    const text = await readPdf(file)
    if (!text.trim()) throw new Error('No text in this PDF (a scanned image). Paste the text instead.')
    return parsePropheticText(text)
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.csv')) {
    return parsePropheticRows(await readSheet(file))
  }
  if (name.endsWith('.txt')) return parsePropheticText(await file.text())
  throw new Error('File type not supported. Use PDF, Excel, CSV or text.')
}
