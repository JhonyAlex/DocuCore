function escapePdfText(value: string): string {
  return value.replace(/([\\()])/g, '\\$1')
}

/** Creates a small valid single-page PDF for the canonical development seed. */
export function createSeedPdfBuffer(title: string, targetSizeBytes?: number): Buffer {
  const content = `BT\n/F1 16 Tf\n36 740 Td\n(${escapePdfText(title)}) Tj\nET\n`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ]
  let body = '%PDF-1.4\n'
  const offsets = [0]
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body))
    body += `${index + 1} 0 obj\n${object}\nendobj\n`
  }
  const xrefOffset = Buffer.byteLength(body)
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`
  const pdf = Buffer.from(body)
  if (targetSizeBytes === undefined) return pdf
  if (targetSizeBytes < pdf.length) throw new Error('Seed PDF target size is smaller than the PDF structure')
  return Buffer.concat([pdf, Buffer.alloc(targetSizeBytes - pdf.length, 0x20)])
}
