import sharp from 'sharp'

/**
 * Imágenes de prueba para los flujos E2E de subida de ficheros.
 *
 * Se generan con `sharp` —el mismo decodificador que usa el backend en
 * `server/lib/documentStorage.ts`— en lugar de embeber cadenas hex: así un
 * fixture inválido se detecta al construirlo, no como un HTTP 400 en mitad de
 * la suite. Los bytes hex manuales que había antes pasaban por válidos pero
 * sharp los rechazaba (`libpng read error` / `Corrupt JPEG data`).
 */
const TEST_IMAGE_SIZE = 8

/** PNG opaco con alfa: aceptado por el pipeline de miniaturización del servidor. */
export function createTestPngBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: TEST_IMAGE_SIZE,
      height: TEST_IMAGE_SIZE,
      channels: 4,
      background: { r: 200, g: 30, b: 30, alpha: 1 },
    },
  })
    .png()
    .toBuffer()
}

/** JPEG de 3 canales, distinto del PNG para que las miniaturas no se confundan. */
export function createTestJpegBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: TEST_IMAGE_SIZE,
      height: TEST_IMAGE_SIZE,
      channels: 3,
      background: { r: 30, g: 120, b: 200 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer()
}
