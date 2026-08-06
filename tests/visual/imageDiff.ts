import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

export const VISUAL_THRESHOLD_PERCENT = 0.5

export type ImageDiffResult = {
  mismatchPixels: number
  mismatchPercent: number
  appPath: string
  referencePath: string
  diffPath: string
}

export async function compareImages(name: string, appPath: string, referencePath: string): Promise<ImageDiffResult> {
  const [appBuffer, referenceBuffer] = await Promise.all([readFile(appPath), readFile(referencePath)])
  const app = PNG.sync.read(appBuffer)
  const reference = PNG.sync.read(referenceBuffer)

  if (app.width !== reference.width || app.height !== reference.height) {
    throw new Error(`Image dimensions differ for ${name}: app ${app.width}x${app.height}, reference ${reference.width}x${reference.height}.`)
  }

  const diff = new PNG({ width: app.width, height: app.height })
  const mismatchPixels = pixelmatch(app.data, reference.data, diff.data, app.width, app.height, {
    threshold: 0.1,
    includeAA: false,
  })
  const diffPath = path.join(path.dirname(appPath), `${name}.diff.png`)
  await writeFile(diffPath, PNG.sync.write(diff))

  return {
    mismatchPixels,
    mismatchPercent: (mismatchPixels / (app.width * app.height)) * 100,
    appPath,
    referencePath,
    diffPath,
  }
}

export async function visualOutputPath(name: string, suffix: 'app' | 'reference'): Promise<string> {
  const outputDirectory = path.resolve(process.cwd(), 'test-results/visual')
  await mkdir(outputDirectory, { recursive: true })
  return path.join(outputDirectory, `${name}.${suffix}.png`)
}
