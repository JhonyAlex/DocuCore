import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import assetsRouter from './routes/assets'
import documentsRouter from './routes/documents'
import locationsRouter from './routes/locations'
import metaRouter from './routes/meta'
import { errorHandler } from './middleware/error'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})
app.use('/api/assets', assetsRouter)
app.use('/api/documents', documentsRouter)
app.use('/api/locations', locationsRouter)
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
