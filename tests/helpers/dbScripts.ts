import { exec } from 'node:child_process'

import path from 'node:path'

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'

export type DbScriptResult = { stdout: string; code: number }

// Ejecuta `pnpm db:seed` o `pnpm db:reset:manual-test` contra la BD aislada de
// E2E (misma URL y storage que usan los webServers de Playwright). Devuelve la
// salida y el código de salida; nunca lanza por un código distinto de 0.
export async function runDbScript(script: 'db:seed' | 'db:reset:manual-test', env: NodeJS.ProcessEnv): Promise<DbScriptResult> {
  return new Promise<DbScriptResult>((resolve) => {
    exec(`${pnpmCommand} ${script}`, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...env,
        // Contrato fijo P0-REM-01: el objeto env recibido no puede sobrescribir
        // el entorno desechable (NODE_ENV, confirmación canónica y storages bajo
        // test-results). DATABASE_URL queda gobernada por la guardia fail-closed.
        NODE_ENV: 'test',
        DOCUCORE_DESTRUCTIVE_TARGET: '127.0.0.1:5436/docucore',
        DOCUMENT_STORAGE_PATH: path.resolve(process.cwd(), 'test-results', 'e2e-documents'),
        FLOOR_PLAN_STORAGE_PATH: path.resolve(process.cwd(), 'test-results', 'e2e-floor-plans'),
      },
      timeout: 120_000,
    }, (error, stdout) => {
      const code = error ? ((error as { code?: number | string }).code === undefined ? 1 : Number((error as { code?: number | string }).code) || 1) : 0
      resolve({ stdout, code })
    })
  })
}
