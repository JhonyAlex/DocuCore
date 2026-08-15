import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assetsRouter from './routes/assets'
import documentsRouter from './routes/documents'
import locationsRouter from './routes/locations'
import metaRouter from './routes/meta'
import dynamicFieldsRouter from './routes/dynamicFields'
import assetTypesRouter from './routes/assetTypes'
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
import { sessionHandler } from './routes/meta'
import { errorHandler } from './middleware/error'
import { requireProjectScope } from './lib/projectScope'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})
app.get('/api/session', sessionHandler)
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
  ['/statuses', statusesRouter],
  ['/tasks', tasksRouter],
  ['/preventive-plans', preventivePlansRouter],
] as const) app.use(`/api/projects/:projectId${path}`, configurationScope, router)
app.use('/api/projects/:projectId', projectScope(), metaRouter)

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), 'dist')
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
