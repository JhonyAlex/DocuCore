import { exec } from 'node:child_process'
import { promisify } from 'node:util'

import path from 'node:path'

const execAsync = promisify(exec)
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker'

// Único destino permitido para la suite E2E y para seed/reset (P0-REM-01):
// canónico y fijo, nunca derivado de DATABASE_URL/DOCUCORE_DB_PORT del entorno.
// Un valor heredado del shell o del .env no puede redirigir parte de la suite
// hacia 5435 (BD persistente de pruebas manuales) ni a otra base. La guardia
// fail-closed de los scripts es el respaldo, pero los helpers y Playwright no
// deben intentar ningún otro destino.
export const E2E_DB_PORT = '5436'
export const E2E_DATABASE_URL = 'postgresql://docucore:docucore@127.0.0.1:5436/docucore?schema=public'

// Alias histórico usado por las especificaciones API (mismo destino único).
export const databaseUrl = E2E_DATABASE_URL

const composeArgs = ['--project-name', 'docucore-e2e', '--file', 'docker-compose.yml', '--file', 'tests/docker-compose.e2e.yml']

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
      DATABASE_URL: E2E_DATABASE_URL,
      DB_HOST_PORT: E2E_DB_PORT,
      NODE_ENV: 'test',
      // Confirmación explícita y fija del único destino permitido (P0-REM-01):
      // no se calcula desde DATABASE_URL para no anular la doble confirmación.
      DOCUCORE_DESTRUCTIVE_TARGET: '127.0.0.1:5436/docucore',
      DOCUMENT_STORAGE_PATH: path.resolve(process.cwd(), 'test-results', 'e2e-documents'),
      FLOOR_PLAN_STORAGE_PATH: path.resolve(process.cwd(), 'test-results', 'e2e-floor-plans'),
    },
    timeout: 120_000,
  }

  const commandLine = [command, ...args].map((part) => `"${part.replace(/"/g, '\\"')}"`).join(' ')
  await execAsync(commandLine, options)
}

export async function ensureTestDatabase(): Promise<void> {
  if (!process.env.CI) {
    try {
      await run(dockerCommand, ['compose', ...composeArgs, 'up', '-d', 'db'])
    } catch {
      // Container might already be running or port mapped externally
    }
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
      try {
        await run(pnpmCommand, ['db:deploy'])
      } catch {
        // If already migrated or schema not empty, continue to seed
      }
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
