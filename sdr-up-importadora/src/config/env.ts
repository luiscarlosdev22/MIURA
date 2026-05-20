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

const provider = optional('WHATSAPP_PROVIDER', 'evolution')

if (provider !== 'meta' && provider !== 'evolution') {
  throw new Error(
    `[Config] WHATSAPP_PROVIDER invalido: "${provider}". Use "meta" ou "evolution".`
  )
}

function requiredForMeta(key: string): string {
  return provider === 'meta' ? required(key) : optional(key, '')
}

function requiredForEvolution(key: string): string {
  return provider === 'evolution' ? required(key) : optional(key, '')
}

export const env = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  isDev: optional('NODE_ENV', 'development') === 'development',
  whatsappProvider: provider as 'meta' | 'evolution',
  whatsapp: {
    token: requiredForMeta('WHATSAPP_TOKEN'),
    phoneNumberId: requiredForMeta('WHATSAPP_PHONE_NUMBER_ID'),
    businessAccountId: requiredForMeta('WHATSAPP_BUSINESS_ACCOUNT_ID'),
    verifyToken: required('WEBHOOK_VERIFY_TOKEN'),
  },
  evolution: {
    url: requiredForEvolution('EVOLUTION_URL'),
    apiKey: requiredForEvolution('EVOLUTION_API_KEY'),
    instance: requiredForEvolution('EVOLUTION_INSTANCE'),
  },
  openai: {
    apiKey: required('OPENAI_API_KEY'),
  },
  database: {
    url: optional('DATABASE_URL', ''),
  },
  seller: {
    whatsapp: optional('SELLER_WHATSAPP', ''),
  },
  allowedNumbers: optional('ALLOWED_NUMBERS', '')
    .split(',')
    .map(n => n.trim())
    .filter(Boolean),
  audio: {
    pitchTecnico: optional('AUDIO_PITCH_TECNICO', '/Users/xiiina.com/julia-audios/pitch_tecnico.ogg'),
  },
}
