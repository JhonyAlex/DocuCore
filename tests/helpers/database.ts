import { exec, execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker'

export const databaseUrl = process.env.DATABASE_URL ?? `postgresql://docucore:docucore@127.0.0.1:${process.env.DOCUCORE_DB_PORT ?? '5435'}/docucore?schema=public`

async function run(command: string, args: string[]): Promise<void> {
  const options = {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl },
    timeout: 120_000,
  }

  if (process.platform === 'win32') {
    const commandLine = [command, ...args].map((part) => `"${part.replace(/"/g, '\\"')}"`).join(' ')
    await execAsync(commandLine, options)
    return
  }

  await execFileAsync(command, args, {
    ...options,
  })
}

export async function ensureTestDatabase(): Promise<void> {
  await run(dockerCommand, ['compose', 'up', '-d', 'db'])

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
      await run(dockerCommand, ['compose', 'exec', '-T', 'db', 'pg_isready', '-U', 'docucore', '-d', 'docucore'])
      await run(pnpmCommand, ['db:deploy'])
      await resetTestDatabase()
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
