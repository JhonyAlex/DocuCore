import 'dotenv/config'
import { startServer } from './index'

async function runSmokeTests() {
  console.log('[Smoke Test] Starting DocuCore / Report Map Online smoke tests...')
  const server = await startServer(0)
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('Could not resolve server address')
  }
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    // 1. Health Probe
    const healthRes = await fetch(`${baseUrl}/api/health`)
    if (healthRes.status !== 200) throw new Error(`Health probe failed: ${healthRes.status}`)
    const healthJson = (await healthRes.json()) as { status?: string }
    if (healthJson.status !== 'ok') throw new Error(`Health status unexpected: ${JSON.stringify(healthJson)}`)
    console.log('  ✓ Liveness probe /api/health OK (200)')

    // 2. Readiness Probe
    const readyRes = await fetch(`${baseUrl}/api/ready`)
    if (readyRes.status !== 200) throw new Error(`Readiness probe failed: ${readyRes.status}`)
    const readyJson = (await readyRes.json()) as { status?: string; database?: string }
    if (readyJson.status !== 'ready' || readyJson.database !== 'connected') {
      throw new Error(`Readiness probe output unexpected: ${JSON.stringify(readyJson)}`)
    }
    console.log('  ✓ Readiness probe /api/ready OK (200, DB + Storage connected)')

    // 3. Public Landing / SPA Root
    const landingRes = await fetch(`${baseUrl}/`)
    if (landingRes.status !== 200 && landingRes.status !== 304) {
      throw new Error(`Landing page request failed: ${landingRes.status}`)
    }
    console.log('  ✓ Public landing route / OK (200)')

    // 4. Protected Session Endpoint (unauthenticated check)
    const sessionRes = await fetch(`${baseUrl}/api/auth/session`)
    if (sessionRes.status !== 401) {
      throw new Error(`Unauthenticated session probe returned ${sessionRes.status}, expected 401`)
    }
    console.log('  ✓ Protected session endpoint /api/auth/session rejects unauthenticated requests (401)')

    // 5. Protected API Resource Endpoint
    const projectsRes = await fetch(`${baseUrl}/api/projects`)
    if (projectsRes.status !== 401) {
      throw new Error(`Unauthenticated projects request returned ${projectsRes.status}, expected 401`)
    }
    console.log('  ✓ Protected projects endpoint /api/projects rejects unauthenticated requests (401)')

    console.log('[Smoke Test] ALL 5/5 SMOKE CHECKS PASSED SUCCESSFULLY.\n')
  } finally {
    server.close()
  }
}

runSmokeTests().catch((err) => {
  console.error('[Smoke Test] FAILED:', err)
  process.exit(1)
})
