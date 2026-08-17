import { describe, expect, it } from "vitest"
import { startServer } from "../../server/index"

describe("SAAS-06 Health & Readiness API", () => {
  it("serves /api/health and /api/ready probes correctly", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const healthRes = await fetch(`${baseUrl}/api/health`)
      expect(healthRes.status).toBe(200)
      const healthData = await healthRes.json()
      expect(healthData).toEqual({ status: "ok" })

      const readyRes = await fetch(`${baseUrl}/api/ready`)
      expect(readyRes.status).toBe(200)
      const readyData = await readyRes.json()
      expect(readyData.status).toBe("ready")
      expect(readyData.database).toBe("connected")
      expect(readyData.storage).toBe("ok")
    } finally {
      server.close()
    }
  })

  it("serves /api/version and /api/migrations for release identification", async () => {
    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const versionRes = await fetch(`${baseUrl}/api/version`)
      expect(versionRes.status).toBe(200)
      const versionData = await versionRes.json()
      expect(typeof versionData.nodeVersion).toBe("string")
      expect(versionData).toHaveProperty("appVersion")
      expect(versionData).toHaveProperty("gitSha")
      expect(versionData).toHaveProperty("buildTime")

      const migRes = await fetch(`${baseUrl}/api/migrations`)
      expect(migRes.status).toBe(200)
      const migData = await migRes.json()
      expect(typeof migData.applied).toBe("number")
      expect(migData.failed).toBe(0)
      expect(Array.isArray(migData.failedNames)).toBe(true)
    } finally {
      server.close()
    }
  })

  it("returns 503 from /api/ready when production configuration is incomplete", async () => {
    const originalEnv = { ...process.env }
    process.env.NODE_ENV = "production"
    process.env.BILLING_PROVIDER = "stripe"
    delete process.env.STRIPE_SECRET_KEY
    delete process.env.SESSION_SECRET

    const server = await startServer(0)
    const address = server.address()
    if (!address || typeof address === "string") throw new Error("Invalid test server address")
    const baseUrl = `http://127.0.0.1:${address.port}`

    try {
      const readyRes = await fetch(`${baseUrl}/api/ready`)
      expect(readyRes.status).toBe(503)
      const readyData = await readyRes.json()
      expect(readyData.status).toBe("unready")
      expect(Array.isArray(readyData.errors)).toBe(true)
      expect(readyData.errors.some((e: string) => e.includes("Stripe") || e.includes("SESSION_SECRET"))).toBe(true)
    } finally {
      process.env = { ...originalEnv }
      server.close()
    }
  })
})
