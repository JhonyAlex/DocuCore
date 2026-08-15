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
import { errorHandler } from './middleware/error'
import { requireProjectScope } from './lib/projectScope'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})
app.use('/api/projects', projectsRouter)

// Every operational API is below the explicit project URL boundary. The
// middleware resolves existence and membership once, and turns archived
// projects read-only before a resource router can perform a write.
const projectRouter = express.Router({ mergeParams: true })
projectRouter.use((req, res, next) => requireProjectScope({ write: !['GET', 'HEAD', 'OPTIONS'].includes(req.method) })(req, res, next))
projectRouter.use('/assets', assetsRouter)
projectRouter.use('/documents', documentsRouter)
projectRouter.use('/locations', locationsRouter)
projectRouter.use('/dynamic-fields', dynamicFieldsRouter)
projectRouter.use('/asset-types', assetTypesRouter)
projectRouter.use('/statuses', statusesRouter)
projectRouter.use('/tasks', tasksRouter)
projectRouter.use('/preventive-plans', preventivePlansRouter)
projectRouter.use('/floor-plans', floorPlansRouter)
projectRouter.use('/calendar', calendarRouter)
projectRouter.use('/dashboard', dashboardRouter)
projectRouter.use('/search', searchRouter)
projectRouter.use('/history', historyRouter)
projectRouter.use('/notifications', notificationsRouter)
projectRouter.use('/', metaRouter)
app.use('/api/projects/:projectId', projectRouter)
app.use('/api', metaRouter)

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
