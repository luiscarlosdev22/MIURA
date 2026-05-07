import express from 'express'
import { requestLogger } from './middlewares/requestLogger'
import { errorHandler } from './middlewares/errorHandler'
import { healthCheck } from './controllers/webhookController'
import webhookRouter from './routes/webhook'
import leadsRouter from './routes/leads'

const app = express()

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(requestLogger)
app.set('trust proxy', 1)

app.get('/health', healthCheck)
app.use('/webhook', webhookRouter)
app.use('/api/leads', leadsRouter)

app.use((_req, res) => {
  res.status(404).json({ error: 'Rota nao encontrada' })
})

app.use(errorHandler)

export default app
