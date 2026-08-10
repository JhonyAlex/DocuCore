// PDF mínimo válido (página en blanco) para las subidas de documentos en E2E.
// La vista previa incrustada carga los PDFs en un iframe del visor nativo de
// Chromium (PDFium): los bytes arbitrarios harían fallar la carga y podrían
// emitir errores de consola; un PDF estructuralmente válido renderiza limpio.
export function minimalPdf(): Buffer {
  const header = '%PDF-1.4\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>',
  ]
  let offset = Buffer.byteLength(header, 'ascii')
  const offsets: number[] = []
  const body: string[] = []
  objects.forEach((content, index) => {
    offsets.push(offset)
    const entry = `${index + 1} 0 obj\n${content}\nendobj\n`
    body.push(entry)
    offset += Buffer.byteLength(entry, 'ascii')
  })
  const xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((value) => `${String(value).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF`
  return Buffer.from(header + body.join('') + xref, 'ascii')
}
