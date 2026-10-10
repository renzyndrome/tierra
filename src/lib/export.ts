// Export utilities for Excel and PDF.
//
// xlsx / jspdf / jspdf-autotable are browser-only (they trigger file downloads) and
// heavy, so they are imported DYNAMICALLY inside the functions. This keeps them out of
// the SSR module graph — avoiding ERR_MODULE_NOT_FOUND when Nitro externalizes them for
// the server build — and code-splits them out of the initial client bundle (they load
// only when the user actually exports).

const datestamp = () => new Date().toISOString().split('T')[0]

export async function downloadExcel(filename: string, headers: string[], rows: string[][], sheetName = 'Data') {
  const XLSX = await import('xlsx')

  const data = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(data)

  // Auto-size columns
  const colWidths = headers.map((h, i) => {
    const maxLen = Math.max(h.length, ...rows.map(r => (r[i] ?? '').length))
    return { wch: Math.min(maxLen + 2, 40) }
  })
  ws['!cols'] = colWidths

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  XLSX.writeFile(wb, `${filename}-${datestamp()}.xlsx`)
}

export async function downloadPDF(filename: string, headers: string[], rows: string[][], title?: string) {
  const { default: jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' })

  if (title) {
    doc.setFontSize(16)
    doc.text(title, 14, 20)
  }

  autoTable(doc, {
    head: [headers],
    body: rows,
    startY: title ? 28 : 14,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [139, 21, 56] },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: 10, right: 10 },
  })

  doc.save(`${filename}-${datestamp()}.pdf`)
}
