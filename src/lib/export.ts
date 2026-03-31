// Export utilities for Excel and PDF

import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const datestamp = () => new Date().toISOString().split('T')[0]

export function downloadExcel(filename: string, headers: string[], rows: string[][], sheetName = 'Data') {
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

export function downloadPDF(filename: string, headers: string[], rows: string[][], title?: string) {
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
