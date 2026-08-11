import { exec, execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const execAsync = promisify(exec)
const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const dockerCommand = process.platform === 'win32' ? 'docker.exe' : 'docker'

const testDatabasePort = process.env.DOCUCORE_DB_PORT ?? '5435'
const composeArgs = ['--project-name', 'docucore-e2e', '--file', 'docker-compose.yml', '--file', 'tests/docker-compose.e2e.yml']

export const databaseUrl = process.env.DATABASE_URL ?? `postgresql://docucore:docucore@127.0.0.1:${testDatabasePort}/docucore?schema=public`

async function run(command: string, args: string[]): Promise<void> {
  const options = {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: databaseUrl, DB_HOST_PORT: testDatabasePort },
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
  try {
    await run(dockerCommand, ['compose', ...composeArgs, 'up', '-d', 'db'])
  } catch {
    // Container might already be running or port mapped externally
  }

  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    try {
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
