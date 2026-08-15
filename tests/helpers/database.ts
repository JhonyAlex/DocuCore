import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker'

const testDatabasePort = process.env.DOCUCORE_DB_PORT ?? '5436'
const composeArgs = ['--project-name', 'docucore-e2e', '--file', 'docker-compose.yml', '--file', 'tests/docker-compose.e2e.yml']

export const databaseUrl = process.env.DATABASE_URL ?? `postgresql://docucore:docucore@127.0.0.1:${testDatabasePort}/docucore?schema=public`

/** Builds canonical project-scoped API URLs for legacy-focused API specifications. */
export function projectApiPath(path: string, init?: RequestInit): string {
  if (!path.startsWith('/api/') || path.startsWith('/api/projects/') || path === '/api/health' || path === '/api/session' || path === '/api/projects') return path
  const url = new URL(path, 'http://docucore.test')
  let projectId = Number(url.searchParams.get('projectId')) || 0
  const mayCreateScopedResource = (init?.method ?? 'GET').toUpperCase() === 'POST'
  if (!projectId && mayCreateScopedResource && typeof init?.body === 'string') {
    try { projectId = Number((JSON.parse(init.body) as { projectId?: unknown }).projectId) || 0 } catch { /* not JSON */ }
  }
  if (!projectId && mayCreateScopedResource && init?.body instanceof FormData) projectId = Number(init.body.get('projectId')) || 0
  const operationalPath = url.pathname.slice('/api'.length)
  return `/api/projects/${projectId || 1}${operationalPath}${url.search}`
}

async function run(command: string, args: string[]): Promise<void> {
  const options = {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      DB_HOST_PORT: testDatabasePort,
      DOCUMENT_STORAGE_PATH: process.env.DOCUMENT_STORAGE_PATH ?? `${process.cwd()}/test-results/e2e-documents`,
      FLOOR_PLAN_STORAGE_PATH: process.env.FLOOR_PLAN_STORAGE_PATH ?? `${process.cwd()}/test-results/e2e-floor-plans`,
    },
    timeout: 120_000,
  }

  const commandLine = [command, ...args].map((part) => `"${part.replace(/"/g, '\\"')}"`).join(' ')
  await execAsync(commandLine, options)
}

export async function ensureTestDatabase(): Promise<void> {
  try {
    await run(dockerCommand, ['compose', ...composeArgs, 'up', '-d', 'db'])
  } catch {
    // Container might already be running or port mapped externally
  }

  // Un volumen E2E nuevo no tiene esquema: aplicar las migraciones antes del
  // seed para que la suite no dependa de una base previa en el equipo local.
  try {
    await run(pnpmCommand, ['db:deploy'])
  } catch {
    // El bucle posterior reintenta mientras PostgreSQL termina de arrancar.
  }

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      await run(pnpmCommand, ['db:deploy'])
      await run(pnpmCommand, ['db:seed'])
      return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
  }

  throw new Error('PostgreSQL did not become ready within 60 seconds.')
}

export async function resetTestDatabase(): Promise<void> {
  await run(pnpmCommand, ['db:seed'])
}
