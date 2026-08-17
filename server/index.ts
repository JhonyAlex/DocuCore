import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import assetsRouter from './routes/assets'
import documentsRouter from './routes/documents'
import locationsRouter from './routes/locations'
import metaRouter from './routes/meta'
import dynamicFieldsRouter from './routes/dynamicFields'
import assetTypesRouter from './routes/assetTypes'
import documentTypesRouter from './routes/documentTypes'
import statusesRouter from './routes/statuses'
import tasksRouter from './routes/tasks'
import preventivePlansRouter from './routes/preventivePlans'
import floorPlansRouter from './routes/floorPlans'
import calendarRouter from './routes/calendar'
import dashboardRouter from './routes/dashboard'
import searchRouter from './routes/search'
import historyRouter from './routes/history'
import notificationsRouter from './routes/notifications'
import projectsRouter from './routes/projects'
import authRouter from './routes/auth'
import usersRouter from './routes/users'
import billingRouter from './routes/billing'
import adminRouter from './routes/admin'
import { errorHandler } from './middleware/error'
import { requireProjectScope } from './lib/projectScope'
import { optionalAuth, requireAuth } from './lib/auth'
import { validateBillingConfiguration } from './lib/billing'
import { validateEmailConfiguration } from './lib/email'
import prisma from './lib/prisma'

const app = express()

app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : false)
const allowedOrigins = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean)
app.use(cors({
  // Same-origin is the default deployment. Cross-origin credentialed requests
  // must opt in to an explicit allow-list; reflecting arbitrary origins would
  // undermine the cookie session boundary.
  origin: allowedOrigins?.length ? (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)) : false,
  credentials: Boolean(allowedOrigins?.length),
}))

// Request tracking and structured logging
app.use((req, res, next) => {
  const reqId = randomBytes(6).toString('hex')
  req.headers['x-request-id'] = req.headers['x-request-id'] || reqId
  res.setHeader('X-Request-Id', req.headers['x-request-id'] as string)
  const start = Date.now()

  res.on('finish', () => {
    if (process.env.NODE_ENV !== 'test' && !req.url.startsWith('/api/health')) {
      const duration = Date.now() - start
      console.log(`[HTTP] ${req.method} ${req.url} ${res.statusCode} ${duration}ms (req: ${req.headers['x-request-id']})`)
    }
  })
  next()
})

app.use(express.json({
  limit: '15mb',
  verify: (req, _res, buf) => {
    (req as unknown as { rawBody: Buffer }).rawBody = buf
  },
}))
app.use(optionalAuth)

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/ready', async (_req, res) => {
  const isProduction = process.env.NODE_ENV === 'production'
  const errors: string[] = []

  // 1. Database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    errors.push('Database unavailable')
  }

  // 2. Storage paths check
  const docStorage = process.env.DOCUMENT_STORAGE_PATH || path.join(process.cwd(), 'storage/documents')
  const planStorage = process.env.FLOOR_PLAN_STORAGE_PATH || path.join(process.cwd(), 'storage/floor-plans')
  try {
    fs.mkdirSync(docStorage, { recursive: true })
    fs.accessSync(docStorage, fs.constants.R_OK | fs.constants.W_OK)
  } catch {
    errors.push('Documents storage directory inaccessible')
  }
  try {
    fs.mkdirSync(planStorage, { recursive: true })
    fs.accessSync(planStorage, fs.constants.R_OK | fs.constants.W_OK)
  } catch {
    errors.push('Floor plans storage directory inaccessible')
  }

  // 3. Billing & Email config validation
  const billingCheck = validateBillingConfiguration()
  if (!billingCheck.valid) {
    errors.push(billingCheck.error || 'Invalid billing configuration')
  }

  const emailCheck = validateEmailConfiguration()
  if (!emailCheck.valid) {
    errors.push(emailCheck.error || 'Invalid email configuration')
  }

  // 4. Session secret validation in production
  if (isProduction) {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      errors.push('SESSION_SECRET is required and must be at least 32 characters in production')
    }
  }

  if (errors.length > 0) {
    return res.status(503).json({
      status: 'unready',
      errors,
      timestamp: new Date().toISOString(),
    })
  }

  res.json({
    status: 'ready',
    database: 'connected',
    storage: 'ok',
    billing: 'configured',
    email: 'configured',
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/auth', authRouter)
app.use('/api/billing', billingRouter)
app.use('/api', requireAuth)
app.use('/api/admin', adminRouter)
app.use('/api/users', usersRouter)
app.use('/api/projects', projectsRouter)

const readOnlyMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
function projectScope(capability?: 'OPERATE' | 'MANAGE_CONFIGURATION') {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const write = !readOnlyMethods.has(req.method)
    requireProjectScope({ write, capability: write ? capability : undefined })(req, res, next)
  }
}

// Every operational API is below the explicit project URL boundary. The
// mount policy resolves scope once per request, blocks viewers centrally, and
// reserves structural configuration mutations for project managers.
const operationalScope = projectScope('OPERATE')
const configurationScope = projectScope('MANAGE_CONFIGURATION')
for (const [path, router] of [
  ['/assets', assetsRouter],
  ['/documents', documentsRouter],
  ['/locations', locationsRouter],
  ['/floor-plans', floorPlansRouter],
  ['/calendar', calendarRouter],
  ['/dashboard', dashboardRouter],
  ['/search', searchRouter],
  ['/history', historyRouter],
  ['/notifications', notificationsRouter],
] as const) app.use(`/api/projects/:projectId${path}`, operationalScope, router)
for (const [path, router] of [
  ['/dynamic-fields', dynamicFieldsRouter],
  ['/asset-types', assetTypesRouter],
  ['/document-types', documentTypesRouter],
  ['/statuses', statusesRouter],
  ['/tasks', tasksRouter],
  ['/preventive-plans', preventivePlansRouter],
] as const) app.use(`/api/projects/:projectId${path}`, configurationScope, router)
app.use('/api/projects/:projectId', projectScope(), metaRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

const distPath = path.resolve(process.cwd(), 'dist')
if (process.env.NODE_ENV === 'production' || fs.existsSync(path.join(distPath, 'index.html'))) {
  app.use(express.static(distPath))
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
}

app.use(errorHandler)

export function startServer(port: number | string = process.env.PORT ?? 3001) {
  return app.listen(port, () => {
    console.log(`DocuCore API listening on port ${port}`)
  })
}

const isEntrypoint = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])

if (isEntrypoint) {
  startServer()
}

export default app
