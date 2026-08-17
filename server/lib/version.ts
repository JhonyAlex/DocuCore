import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export type VersionInfo = {
  appVersion: string | null
  gitSha: string | null
  buildTime: string | null
  nodeVersion: string
}

function readBuildVersion(): { appVersion?: string; gitSha?: string; buildTime?: string } {
  try {
    const file = path.resolve(process.cwd(), 'dist', 'version.json')
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'))
    }
  } catch {
    // Un fichero de versión ausente o corrupto no debe impedir el arranque.
  }
  return {}
}

function resolveGitSha(): string | null {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null
  } catch {
    return null
  }
}

let cached: VersionInfo | null = null

// La identidad del release no cambia en tiempo de ejecución, así que se
// resuelve una sola vez. Las variables de entorno tienen prioridad sobre el
// fichero generado en build; el SHA git local es el último recurso (desarrollo).
export function getVersionInfo(): VersionInfo {
  if (cached) return cached
  const build = readBuildVersion()
  cached = {
    appVersion: process.env.APP_VERSION || build.appVersion || null,
    gitSha: process.env.GIT_SHA || build.gitSha || resolveGitSha(),
    buildTime: build.buildTime || null,
    nodeVersion: process.version,
  }
  return cached
}
