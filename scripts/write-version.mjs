/* global process, console */
// Escribe `dist/version.json` con la identidad del build para que la API
// publique inequívocamente qué commit y versión corren en producción.
// Fuente de verdad (en orden de prioridad): variables de entorno del build,
// después el SHA del repositorio git local, y por último la versión del
// `package.json`.
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch {
    return null
  }
}

const pkg = JSON.parse(readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'))

const info = {
  appVersion: process.env.APP_VERSION || pkg.version,
  gitSha: process.env.GIT_SHA || gitSha(),
  buildTime: new Date().toISOString(),
}

const dist = path.resolve(process.cwd(), 'dist')
mkdirSync(dist, { recursive: true })
writeFileSync(path.join(dist, 'version.json'), `${JSON.stringify(info, null, 2)}\n`)
console.log(`[write-version] dist/version.json <- ${JSON.stringify(info)}`)
