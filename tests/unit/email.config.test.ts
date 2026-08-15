import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { validateEmailConfiguration } from "../../server/lib/email"

describe("Email & SMTP Fail-Closed Policy", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("requires EMAIL_MODE to be smtp in production", () => {
    process.env.NODE_ENV = "production"
    process.env.EMAIL_MODE = "console"

    const validation = validateEmailConfiguration()
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain("EMAIL_MODE must be \"smtp\" in production")
  })

  it("fails closed when SMTP configuration is incomplete", () => {
    process.env.NODE_ENV = "production"
    process.env.EMAIL_MODE = "smtp"
    delete process.env.SMTP_HOST
    delete process.env.SMTP_USER
    delete process.env.SMTP_PASSWORD
    delete process.env.EMAIL_FROM

    const validation = validateEmailConfiguration()
    expect(validation.valid).toBe(false)
    expect(validation.error).toContain("SMTP_HOST")
    expect(validation.error).toContain("SMTP_USER")
    expect(validation.error).toContain("SMTP_PASSWORD")
    expect(validation.error).toContain("EMAIL_FROM")
  })

  it("succeeds when all SMTP credentials are provided in production", () => {
    process.env.NODE_ENV = "production"
    process.env.EMAIL_MODE = "smtp"
    process.env.SMTP_HOST = "smtp.sendgrid.net"
    process.env.SMTP_PORT = "587"
    process.env.SMTP_USER = "apikey"
    process.env.SMTP_PASSWORD = "SG.secret_key_mock_12345"
    process.env.EMAIL_FROM = "soporte@report-map.online"

    const validation = validateEmailConfiguration()
    expect(validation.valid).toBe(true)
  })

  it("allows test or console mode in non-production environments", () => {
    process.env.NODE_ENV = "test"
    process.env.EMAIL_MODE = "test"

    const validation = validateEmailConfiguration()
    expect(validation.valid).toBe(true)
  })
})
