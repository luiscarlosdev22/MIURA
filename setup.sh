#!/usr/bin/env bash
# =============================================================
# SDR UP Importadora -- Script de criacao completa do projeto
# Compativel com Git Bash no Windows
# Uso: bash setup-sdr-up.sh
# =============================================================

set -e

PROJECT="sdr-up-importadora"

echo ""
echo "=================================================="
echo "  SDR UP Importadora -- Criando projeto..."
echo "=================================================="
echo ""

mkdir -p "$PROJECT/src/routes"
mkdir -p "$PROJECT/src/controllers"
mkdir -p "$PROJECT/src/services"
mkdir -p "$PROJECT/src/models"
mkdir -p "$PROJECT/src/prompts"
mkdir -p "$PROJECT/src/config"
mkdir -p "$PROJECT/src/middlewares"
mkdir -p "$PROJECT/src/utils"

echo "[1/24] Estrutura de pastas criada"

cat > "$PROJECT/package.json" << 'ENDOFFILE'
{
  "name": "sdr-up-importadora",
  "version": "1.0.0",
  "description": "SDR IA WhatsApp -- UP Importadora LTDA",
  "main": "dist/server.js",
  "scripts": {
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "axios": "^1.7.2",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "openai": "^4.52.0",
    "pg": "^8.12.0",
    "winston": "^3.13.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/node": "^20.14.10",
    "@types/pg": "^8.11.6",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.5.3"
  }
}
ENDOFFILE
echo "[2/24] package.json"

cat > "$PROJECT/tsconfig.json" << 'ENDOFFILE'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
ENDOFFILE
echo "[3/24] tsconfig.json"

cat > "$PROJECT/railway.toml" << 'ENDOFFILE'
[build]
builder = "NIXPACKS"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 3
ENDOFFILE
echo "[4/24] railway.toml"

cat > "$PROJECT/.gitignore" << 'ENDOFFILE'
node_modules/
dist/
.env
*.log
.DS_Store
ENDOFFILE
echo "[5/24] .gitignore"

cat > "$PROJECT/.env.example" << 'ENDOFFILE'
PORT=3000
NODE_ENV=development
WHATSAPP_TOKEN=EAAxxxxxxxxxxxxx
WHATSAPP_PHONE_NUMBER_ID=1234567890
WHATSAPP_BUSINESS_ACCOUNT_ID=0987654321
WEBHOOK_VERIFY_TOKEN=up_importadora_webhook_2024
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxx
DATABASE_URL=postgresql://user:password@host:5432/railway
SELLER_WHATSAPP=5547999999999
ENDOFFILE
echo "[6/24] .env.example"

cat > "$PROJECT/src/config/env.ts" << 'ENDOFFILE'
import dotenv from 'dotenv'
dotenv.config()

function required(key: string): string {
  const value = process.env[key]
  if (!value) {
    throw new Error(`[Config] Variavel de ambiente obrigatoria nao definida: ${key}`)
  }
  return value
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const env = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',
  whatsapp: {
    token: required('WHATSAPP_TOKEN'),
    phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
    businessAccountId: optional('WHATSAPP_BUSINESS_ACCOUNT_ID', ''),
    verifyToken: required('WEBHOOK_VERIFY_TOKEN'),
  },
  openai: {
    apiKey: required('OPENAI_API_KEY'),
  },
  database: {
    url: required('DATABASE_URL'),
  },
  seller: {
    whatsapp: optional('SELLER_WHATSAPP', ''),
  },
}
ENDOFFILE
echo "[7/24] src/config/env.ts"

cat > "$PROJECT/src/config/logger.ts" << 'ENDOFFILE'
import winston from 'winston'
import { env } from './env'

const { combine, timestamp, colorize, printf, json } = winston.format

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ level, message, timestamp, ...meta }) => {
    const extras = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : ''
    return `${timestamp} [${level}] ${message}${extras}`
  })
)

const prodFormat = combine(timestamp(), json())

export const logger = winston.createLogger({
  level: env.isDev ? 'debug' : 'info',
  format: env.isDev ? devFormat : prodFormat,
  transports: [new winston.transports.Console()],
})
ENDOFFILE
echo "[8/24] src/config/logger.ts"

cat > "$PROJECT/src/config/database.ts" << 'ENDOFFILE'
import { Pool } from 'pg'
import { env } from './env'
import { logger } from './logger'

export const db = new Pool({
  connectionString: env.database.url,
  ssl: env.isDev ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
})

export async function connectDatabase(): Promise<void> {
  try {
    const client = await db.connect()
    logger.info('PostgreSQL conectado com sucesso')
    client.release()
  } catch (error) {
    logger.error('Falha ao conectar PostgreSQL', { error })
    throw error
  }
}

export async function query<T = Record<string, unknown>>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await db.query(text, params)
  return result.rows as T[]
}
ENDOFFILE
echo "[9/24] src/config/database.ts"

cat > "$PROJECT/src/middlewares/requestLogger.ts" << 'ENDOFFILE'
import { Request, Response, NextFunction } from 'express'
import { logger } from '../config/logger'

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    const level = res.statusCode >= 400 ? 'warn' : 'debug'
    logger[level](`${req.method} ${req.path}`, {
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
    })
  })
  next()
}
ENDOFFILE
echo "[10/24] src/middlewares/requestLogger.ts"

cat > "$PROJECT/src/middlewares/errorHandler.ts" << 'ENDOFFILE'
import { Request, Response, NextFunction } from 'express'
import { logger } from '../config/logger'

export interface AppError extends Error {
  statusCode?: number
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const statusCode = err.statusCode ?? 500
  const message = err.message ?? 'Erro interno do servidor'
  logger.error('Erro nao tratado', { message, stack: err.stack, path: req.path, method: req.method })
  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  })
}
ENDOFFILE
echo "[11/24] src/middlewares/errorHandler.ts"

cat > "$PROJECT/src/prompts/sdr.ts" << 'ENDOFFILE'
export const SDR_SYSTEM_PROMPT = `Voce e Julia, consultora comercial da UP Importadora -- empresa especializada em equipamentos para oficinas mecanicas e auto centers no Brasil.

Seu objetivo e qualificar leads de forma natural, consultiva e objetiva, preparando-os para falar com um especialista de vendas.

## PRODUTO PRINCIPAL
Retifica de disco de freio automotiva.

Beneficios que voce conhece:
- Gera lucro extra direto para a oficina (cobra pelo servico sem terceirizar)
- Elimina a dependencia de terceiros para servicos de freio
- Retorno do investimento rapido (geralmente em 3 a 6 meses)
- Aumenta a quantidade de servicos por dia
- Diferencial competitivo frente a concorrencia
- Outros equipamentos para oficinas e auto centers tambem disponiveis

## FLUXO DE QUALIFICACAO
Faca UMA pergunta por mensagem, de forma natural. Siga esta ordem:

1. Saudar e perguntar nome
2. Perguntar cidade/estado
3. Perguntar se ja tem oficina em funcionamento ou esta comecando
4. Uso proprio ou revenda/distribuidora?
5. Quantos veiculos passam pela oficina por mes?
6. Ja tem algum prazo em mente para adquirir o equipamento?
7. Como prefere pagar? (a vista, financiado, parcelado)
8. A decisao de compra e sua ou precisa consultar alguem?

## CLASSIFICACAO INTERNA (nunca revele ao lead)
- QUENTE: quer comprar, pediu preco, tem urgencia, decide sozinho, prazo <= 30 dias
- MORNO: tem interesse mas sem prazo definido, precisa pensar, pesquisando
- FRIO: curioso, sem verba, sem oficina, sem perfil de comprador

## REGRAS OBRIGATORIAS
- Maximo de 1 pergunta por mensagem
- Mensagens curtas e diretas (maximo 3 linhas)
- Tom humano, profissional e brasileiro -- nunca pareca um robo
- Nunca invente especificacoes tecnicas nem precos
- Se o lead pedir preco: "Otimo! Vou te conectar com nosso especialista que vai passar todos os detalhes."
- Se o lead estiver QUENTE: "Perfeito, [nome]! Nosso especialista vai entrar em contato agora mesmo."
- No maximo 1 emoji por mensagem

## PRIMEIRA MENSAGEM
"Ola! Sou a Julia, da UP Importadora. Vi que voce tem interesse nos nossos equipamentos para oficina. Pode me dizer seu nome?"
`
ENDOFFILE
echo "[12/24] src/prompts/sdr.ts"

cat > "$PROJECT/src/services/whatsapp.ts" << 'ENDOFFILE'
import axios from 'axios'
import { env } from '../config/env'
import { logger } from '../config/logger'

const BASE_URL = `https://graph.facebook.com/v20.0/${env.whatsapp.phoneNumberId}`

const headers = {
  Authorization: `Bearer ${env.whatsapp.token}`,
  'Content-Type': 'application/json',
}

export async function sendTextMessage(to: string, text: string): Promise<void> {
  try {
    await axios.post(
      `${BASE_URL}/messages`,
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: { body: text, preview_url: false },
      },
      { headers }
    )
    logger.info(`Mensagem enviada para ${to}`)
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      logger.error('Erro ao enviar mensagem WhatsApp', {
        status: error.response?.status,
        data: error.response?.data,
        to,
      })
    }
    throw error
  }
}

export async function markAsRead(messageId: string): Promise<void> {
  try {
    await axios.post(
      `${BASE_URL}/messages`,
      { messaging_product: 'whatsapp', status: 'read', message_id: messageId },
      { headers }
    )
  } catch {
    // nao critico
  }
}
ENDOFFILE
echo "[13/24] src/services/whatsapp.ts"

cat > "$PROJECT/src/services/ai.ts" << 'ENDOFFILE'
import OpenAI from 'openai'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { SDR_SYSTEM_PROMPT } from '../prompts/sdr'

const openai = new OpenAI({ apiKey: env.openai.apiKey })

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function generateSDRResponse(
  history: ChatMessage[],
  newMessage: string
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SDR_SYSTEM_PROMPT },
    ...history.slice(-10),
    { role: 'user', content: newMessage },
  ]

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 200,
    temperature: 0.7,
  })

  const reply = completion.choices[0]?.message?.content
  if (!reply) throw new Error('GPT nao retornou resposta')

  logger.debug('GPT respondeu', {
    tokens: completion.usage?.total_tokens,
    cost: `~$${((completion.usage?.total_tokens ?? 0) * 0.0000006).toFixed(6)}`,
  })

  return reply.trim()
}

export async function classifyLead(history: ChatMessage[]): Promise<'QUENTE' | 'MORNO' | 'FRIO'> {
  if (history.length < 4) return 'FRIO'

  const conversationText = history
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'Lead' : 'SDR'}: ${m.content}`)
    .join('\n')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Analise a conversa e classifique o lead em apenas uma palavra:\nQUENTE (quer comprar, urgencia, pediu preco, decide sozinho)\nMORNO (interesse mas sem prazo, pesquisando)\nFRIO (curioso, sem verba, sem perfil)\n\nConversa:\n${conversationText}\n\nResponda APENAS: QUENTE, MORNO ou FRIO`,
      },
    ],
    max_tokens: 10,
    temperature: 0,
  })

  const result = completion.choices[0]?.message?.content?.trim().toUpperCase()
  if (result === 'QUENTE' || result === 'MORNO' || result === 'FRIO') return result
  return 'MORNO'
}
ENDOFFILE
echo "[14/24] src/services/ai.ts"

cat > "$PROJECT/src/services/leadProcessor.ts" << 'ENDOFFILE'
import { findOrCreateLead, updateLead } from '../models/lead'
import { saveMessage, getHistory } from '../models/conversation'
import { generateSDRResponse, classifyLead } from './ai'
import { sendTextMessage } from './whatsapp'
import { logger } from '../config/logger'
import { env } from '../config/env'

export async function processIncomingMessage(phone: string, text: string): Promise<void> {
  const lead = await findOrCreateLead(phone)
  logger.info(`Mensagem recebida de ${phone}`, { text: text.slice(0, 50) })

  const history = await getHistory(phone, 10)
  const reply = await generateSDRResponse(history, text)

  await saveMessage(phone, 'user', text)
  await saveMessage(phone, 'assistant', reply)

  const userMessages = history.filter(m => m.role === 'user').length + 1
  if (userMessages % 4 === 0 || userMessages === 6) {
    const updatedHistory = [...history, { role: 'user' as const, content: text }]
    const classification = await classifyLead(updatedHistory)

    logger.info(`Lead ${phone} classificado como: ${classification}`)
    await updateLead(phone, { status: classification })

    if (classification === 'QUENTE' && !lead.seller_notified && env.seller.whatsapp) {
      await notifySeller(phone, lead.name)
      await updateLead(phone, { seller_notified: true })
    }
  }

  await sendTextMessage(phone, reply)
}

async function notifySeller(leadPhone: string, leadName: string | null): Promise<void> {
  const name = leadName ?? 'Sem nome'
  const message =
    `LEAD QUENTE DETECTADO!\n\n` +
    `Nome: ${name}\n` +
    `Telefone: ${leadPhone}\n\n` +
    `Esse lead demonstrou interesse real de compra.\n` +
    `Entre em contato agora!`

  await sendTextMessage(env.seller.whatsapp, message)
  logger.info(`Vendedor notificado sobre lead quente: ${leadPhone}`)
}
ENDOFFILE
echo "[15/24] src/services/leadProcessor.ts"

cat > "$PROJECT/src/models/lead.ts" << 'ENDOFFILE'
import { query } from '../config/database'
import { logger } from '../config/logger'

export type LeadStatus = 'NOVO' | 'QUENTE' | 'MORNO' | 'FRIO' | 'CONVERTIDO' | 'DESCARTADO'

export interface Lead {
  id: number
  phone: string
  name: string | null
  city: string | null
  status: LeadStatus
  has_shop: boolean | null
  use_type: string | null
  monthly_cars: number | null
  buy_deadline: string | null
  payment_type: string | null
  decides_alone: boolean | null
  source: string
  seller_notified: boolean
  created_at: Date
  updated_at: Date
}

export async function runMigrations(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS leads (
      id               SERIAL PRIMARY KEY,
      phone            VARCHAR(20) UNIQUE NOT NULL,
      name             VARCHAR(100),
      city             VARCHAR(100),
      status           VARCHAR(20) NOT NULL DEFAULT 'NOVO',
      has_shop         BOOLEAN,
      use_type         VARCHAR(20),
      monthly_cars     INTEGER,
      buy_deadline     VARCHAR(50),
      payment_type     VARCHAR(50),
      decides_alone    BOOLEAN,
      source           VARCHAR(50) NOT NULL DEFAULT 'whatsapp',
      seller_notified  BOOLEAN NOT NULL DEFAULT FALSE,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id         SERIAL PRIMARY KEY,
      phone      VARCHAR(20) NOT NULL,
      role       VARCHAR(10) NOT NULL,
      content    TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await query(`
    CREATE INDEX IF NOT EXISTS idx_conversations_phone
    ON conversations(phone, created_at DESC)
  `)
  logger.info('Migrations executadas com sucesso')
}

export async function findOrCreateLead(phone: string): Promise<Lead> {
  const rows = await query<Lead>('SELECT * FROM leads WHERE phone = $1', [phone])
  if (rows.length > 0) return rows[0]
  const created = await query<Lead>(
    'INSERT INTO leads (phone) VALUES ($1) RETURNING *',
    [phone]
  )
  logger.info(`Novo lead criado: ${phone}`)
  return created[0]
}

export async function updateLead(
  phone: string,
  data: Partial<Omit<Lead, 'id' | 'phone' | 'created_at' | 'updated_at'>>
): Promise<void> {
  const fields = Object.keys(data)
  if (fields.length === 0) return
  const setClause = fields.map((f, i) => `${f} = $${i + 2}`).join(', ')
  const values = Object.values(data)
  await query(
    `UPDATE leads SET ${setClause}, updated_at = NOW() WHERE phone = $1`,
    [phone, ...values]
  )
}

export async function getAllLeads(): Promise<Lead[]> {
  return query<Lead>('SELECT * FROM leads ORDER BY created_at DESC')
}
ENDOFFILE
echo "[16/24] src/models/lead.ts"

cat > "$PROJECT/src/models/conversation.ts" << 'ENDOFFILE'
import { query } from '../config/database'
import { ChatMessage } from '../services/ai'

export async function saveMessage(
  phone: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  await query(
    'INSERT INTO conversations (phone, role, content) VALUES ($1, $2, $3)',
    [phone, role, content]
  )
}

export async function getHistory(phone: string, limit = 10): Promise<ChatMessage[]> {
  const rows = await query<{ role: string; content: string }>(
    `SELECT role, content FROM conversations
     WHERE phone = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [phone, limit]
  )
  return rows.reverse() as ChatMessage[]
}

export async function countMessages(phone: string): Promise<number> {
  const rows = await query<{ count: string }>(
    'SELECT COUNT(*) as count FROM conversations WHERE phone = $1',
    [phone]
  )
  return parseInt(rows[0]?.count ?? '0', 10)
}
ENDOFFILE
echo "[17/24] src/models/conversation.ts"

cat > "$PROJECT/src/controllers/webhookController.ts" << 'ENDOFFILE'
import { Request, Response } from 'express'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { processIncomingMessage } from '../services/leadProcessor'
import { markAsRead } from '../services/whatsapp'

export async function verifyWebhook(req: Request, res: Response): Promise<void> {
  const mode = req.query['hub.mode'] as string
  const token = req.query['hub.verify_token'] as string
  const challenge = req.query['hub.challenge'] as string

  if (mode === 'subscribe' && token === env.whatsapp.verifyToken) {
    logger.info('Webhook verificado pela Meta com sucesso')
    res.status(200).send(challenge)
    return
  }

  logger.warn('Tentativa de verificacao com token invalido', { token })
  res.sendStatus(403)
}

export async function receiveWebhook(req: Request, res: Response): Promise<void> {
  res.sendStatus(200)

  const body = req.body
  if (body?.object !== 'whatsapp_business_account') return

  const entry = body.entry?.[0]
  const change = entry?.changes?.[0]
  const value = change?.value

  if (!value?.messages || value.messages.length === 0) return

  const message = value.messages[0]
  const contactName = value.contacts?.[0]?.profile?.name ?? null

  if (message.type !== 'text') {
    logger.debug(`Tipo de mensagem nao suportado: ${message.type}`)
    return
  }

  const phone = message.from
  const text = message.text.body
  const messageId = message.id

  logger.info(`Nova mensagem de ${phone}`, {
    name: contactName,
    preview: text.slice(0, 60),
  })

  await markAsRead(messageId)

  processIncomingMessage(phone, text).catch(err => {
    logger.error(`Erro ao processar mensagem de ${phone}`, { error: err.message })
  })
}

export function healthCheck(_req: Request, res: Response): void {
  res.json({
    status: 'ok',
    service: 'SDR UP Importadora',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  })
}
ENDOFFILE
echo "[18/24] src/controllers/webhookController.ts"

cat > "$PROJECT/src/controllers/leadsController.ts" << 'ENDOFFILE'
import { Request, Response } from 'express'
import { getAllLeads } from '../models/lead'
import { getHistory } from '../models/conversation'
import { logger } from '../config/logger'

export async function listLeads(_req: Request, res: Response): Promise<void> {
  try {
    const leads = await getAllLeads()
    res.json({ total: leads.length, leads })
  } catch (err) {
    logger.error('Erro ao listar leads', { error: err })
    res.status(500).json({ error: 'Erro ao buscar leads' })
  }
}

export async function getLeadHistory(req: Request, res: Response): Promise<void> {
  try {
    const { phone } = req.params
    const history = await getHistory(phone, 50)
    res.json({ phone, messages: history.length, history })
  } catch (err) {
    logger.error('Erro ao buscar historico', { error: err })
    res.status(500).json({ error: 'Erro ao buscar historico' })
  }
}
ENDOFFILE
echo "[19/24] src/controllers/leadsController.ts"

cat > "$PROJECT/src/routes/webhook.ts" << 'ENDOFFILE'
import { Router } from 'express'
import { verifyWebhook, receiveWebhook } from '../controllers/webhookController'

const router = Router()
router.get('/', verifyWebhook)
router.post('/', receiveWebhook)
export default router
ENDOFFILE
echo "[20/24] src/routes/webhook.ts"

cat > "$PROJECT/src/routes/leads.ts" << 'ENDOFFILE'
import { Router } from 'express'
import { listLeads, getLeadHistory } from '../controllers/leadsController'

const router = Router()
router.get('/', listLeads)
router.get('/:phone/history', getLeadHistory)
export default router
ENDOFFILE
echo "[21/24] src/routes/leads.ts"

cat > "$PROJECT/src/utils/phone.ts" << 'ENDOFFILE'
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '')
}

export function formatPhone(phone: string): string {
  const n = normalizePhone(phone)
  if (n.length === 13) {
    return `+${n.slice(0, 2)} ${n.slice(2, 4)} ${n.slice(4, 9)}-${n.slice(9)}`
  }
  return `+${n}`
}
ENDOFFILE
echo "[22/24] src/utils/phone.ts"

cat > "$PROJECT/src/app.ts" << 'ENDOFFILE'
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
ENDOFFILE
echo "[23/24] src/app.ts"

cat > "$PROJECT/src/server.ts" << 'ENDOFFILE'
import app from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { connectDatabase } from './config/database'
import { runMigrations } from './models/lead'

async function start(): Promise<void> {
  try {
    await connectDatabase()
    await runMigrations()

    const server = app.listen(env.port, () => {
      logger.info(`SDR UP Importadora rodando`, {
        port: env.port,
        env: env.nodeEnv,
        webhook: `http://localhost:${env.port}/webhook`,
        health: `http://localhost:${env.port}/health`,
      })
    })

    process.on('SIGTERM', () => {
      logger.info('SIGTERM recebido. Encerrando graciosamente...')
      server.close(() => {
        logger.info('Servidor encerrado.')
        process.exit(0)
      })
    })
  } catch (error) {
    logger.error('Falha ao iniciar servidor', { error })
    process.exit(1)
  }
}

start()
ENDOFFILE
echo "[24/24] src/server.ts"

echo ""
echo "=================================================="
echo "  Projeto criado com sucesso!"
echo "  $(find $PROJECT -type f | wc -l) arquivos em ./$PROJECT"
echo "=================================================="
echo ""
echo "  Proximos passos:"
echo ""
echo "  1. cd $PROJECT"
echo "  2. npm install"
echo "  3. cp .env.example .env"
echo "     (abra o .env no VS Code e preencha as credenciais)"
echo "  4. npm run dev"
echo ""
echo "  Deve aparecer:"
echo "  [info] PostgreSQL conectado com sucesso"
echo "  [info] Migrations executadas com sucesso"
echo "  [info] SDR UP Importadora rodando { port: 3000 }"
echo ""
echo "  Teste: curl http://localhost:3000/health"
echo "=================================================="