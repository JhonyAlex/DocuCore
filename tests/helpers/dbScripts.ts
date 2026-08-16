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
        DOCUMENT_STORAGE_PATH: path.resolve(process.cwd(), 'test-results', 'e2e-documents'),
        FLOOR_PLAN_STORAGE_PATH: path.resolve(process.cwd(), 'test-results', 'e2e-floor-plans'),
        ...env,
      },
      timeout: 120_000,
    }, (error, stdout) => {
      const code = error ? ((error as { code?: number | string }).code === undefined ? 1 : Number((error as { code?: number | string }).code) || 1) : 0
      resolve({ stdout, code })
    })
  })
}
