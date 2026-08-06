import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import itemsRouter from './routes/items'
import metaRouter from './routes/meta'
import { errorHandler } from './middleware/error'

const app = express()

app.use(cors())
app.use(express.json())

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' })
})
app.use('/api/items', itemsRouter)
app.use('/api', metaRouter)

app.use(errorHandler)

const PORT = process.env.PORT ?? 3001

app.listen(PORT, () => {
  console.log(`DocuCore API listening on port ${PORT}`)
})

export default app
