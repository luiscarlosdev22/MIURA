import { getHistory } from '../models/conversation'
import { Lead } from '../models/lead'

interface BriefingData {
  modalidade: string | null
  cpf_cnpj: string | null
  razao_social: string | null
}

function extractCpfCnpj(text: string): string | null {
  const cleanText = text.replace(/[^\d]/g, '')
  if (cleanText.length === 11) return `CPF ${cleanText}`
  if (cleanText.length === 14) return `CNPJ ${cleanText}`
  return null
}

function detectBriefingData(messages: Array<{ role: string; content: string }>): BriefingData {
  let modalidade: string | null = null
  let cpf_cnpj: string | null = null
  let razao_social: string | null = null

  for (const msg of messages) {
    if (msg.role !== 'user') continue
    const lower = msg.content.toLowerCase()

    if (!modalidade) {
      if (lower.includes('boleto')) modalidade = 'Boleto (entrada + parcelas)'
      else if (lower.includes('pix') || lower.includes('à vista') || lower.includes('a vista')) modalidade = 'PIX à vista'
      else if (lower.includes('cartão') || lower.includes('cartao')) modalidade = 'Cartão de crédito'
    }

    if (!cpf_cnpj) {
      const found = extractCpfCnpj(msg.content)
      if (found) cpf_cnpj = found
    }

    if (cpf_cnpj && !razao_social) {
      const content = msg.content.trim()
      const isCpfCnpj = /^\d{11,14}$/.test(content.replace(/[^\d]/g, ''))
      if (!isCpfCnpj && content.length > 2 && content.length < 80) {
        razao_social = content
      }
    }
  }

  return { modalidade, cpf_cnpj, razao_social }
}

export async function buildHandoffBriefing(phone: string, lead: Lead): Promise<string> {
  const history = await getHistory(phone, 20)

  const briefing = detectBriefingData(history)

  const nome = lead.name ?? 'Lead'
  const now = new Date()
  const horaBr = now.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  let mensagem = `🔥 LEAD QUENTE — ${nome}\n`
  mensagem += `📞 ${phone}\n\n`

  if (briefing.modalidade) {
    mensagem += `💰 Modalidade: ${briefing.modalidade}\n`
  }
  if (briefing.cpf_cnpj) {
    mensagem += `📋 Dados: ${briefing.cpf_cnpj}`
    if (briefing.razao_social) {
      mensagem += ` — ${briefing.razao_social}`
    }
    mensagem += `\n`
  }
  mensagem += `\n`

  const lastMessages = history.slice(-10)
  if (lastMessages.length > 0) {
    mensagem += `📋 Últimas mensagens:\n`
    for (const msg of lastMessages) {
      const role = msg.role === 'user' ? 'lead' : 'julia'
      let content = msg.content
      if (content.length > 120) {
        content = content.substring(0, 117) + '...'
      }
      content = content.replace(/\n+/g, ' ').trim()
      mensagem += `[${role}] ${content}\n`
    }
    mensagem += `\n`
  }

  mensagem += `🕒 ${horaBr}`

  return mensagem
}

export function buildNewLeadNotification(phone: string, name: string | null, firstMessage: string): string {
  const nome = name ?? 'Lead sem nome'
  const now = new Date()
  const horaBr = now.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })

  let preview = firstMessage.trim()
  if (preview.length > 80) preview = preview.substring(0, 77) + '...'

  return `🆕 NOVO LEAD — ${nome}\n📞 ${phone}\n💬 "${preview}"\n🕒 ${horaBr}`
}
