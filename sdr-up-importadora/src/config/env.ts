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
    url: optional('DATABASE_URL', ''),
  },
  seller: {
    whatsapp: optional('SELLER_WHATSAPP', ''),
  },
}
