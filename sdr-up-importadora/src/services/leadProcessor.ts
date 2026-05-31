import { buildHandoffBriefing, buildNewLeadNotification } from './handoffBriefing'
import { detectFollowupReason } from './followupDetector'
import { findOrCreateLead, updateLead, Lead } from '../models/lead'
import { saveMessage, getHistory } from '../models/conversation'
import { generateSDRResponse, classifyLead } from './ai'
import { sendTextMessage, sendAudio } from './whatsapp'
import { isTechnicalRequest } from './technicalRequestDetector'
import { isPriceRequest } from './priceRequestDetector'
import { logger } from '../config/logger'
import { env } from '../config/env'

const HANDOFF_REGEX = /\b(vou|passo|encaminho|encaminhar|repasso|repassar|passar|conectar|conectando|conecto)\b[^.!?]{0,80}\b(comercial|vendedor|equipe|nosso time|atendimento humano)\b/i

const FOLLOWUP_MARKERS = [
  'vou simular pra voce',
  'vou simular para voce',
  'vou pedir pro comercial preparar',
  'vou encaminhar pra nossa equipe',
  'vou encaminhar para nossa equipe',
]

function containsHandoffMarker(text: string): boolean {
  return HANDOFF_REGEX.test(text)
}

function containsFollowupMarker(text: string): boolean {
  const lower = text.toLowerCase()
  return FOLLOWUP_MARKERS.some(marker => lower.includes(marker))
}

function limparTemplateMeta(texto: string): string {
  let t = texto
  const padroes = [
    /an[úu]ncio do facebook/gi,
    /an[úu]ncio do instagram/gi,
    /mostrar detalhes/gi,
    /oi!?\s*como podemos ajudar\??/gi,
    /clique para conversar/gi,
    /enviado (do|pelo) (facebook|instagram)/gi,
  ]
  for (const p of padroes) {
    t = t.replace(p, '')
  }
  return t.replace(/\n{2,}/g, '\n').trim()
}

export async function processIncomingMessage(
  phone: string,
  text: string,
  name?: string | null
): Promise<void> {
  if (!phone.startsWith('55') || phone.length < 12 || phone.length > 13) {
    logger.info(`Mensagem ignorada (nao parece numero brasileiro): ${phone}`)
    return
  }

  const lead = await findOrCreateLead(phone, name ?? undefined)

  // Notifica vendedor quando lead é recém-criado (criado nos últimos 5 segundos)
  const isNewLead = lead.created_at && (Date.now() - new Date(lead.created_at).getTime()) < 5000
  if (isNewLead && env.seller.whatsapp) {
    try {
      const notif = buildNewLeadNotification(phone, lead.name, text)
      await sendTextMessage(env.seller.whatsapp, notif)
      logger.info(`Vendedor notificado sobre novo lead: ${phone}`)
    } catch (err) {
      logger.error(`Erro ao notificar novo lead ${phone}`, { error: (err as Error).message })
    }
  }

  if (lead.seller_notified) {
    await saveMessage(phone, 'user', text)
    logger.info(`Lead ${phone} ja esta com humano. SDR silenciado.`)
    return
  }

  logger.info(`Mensagem recebida de ${phone}`, { text: text.slice(0, 50) })

  if (text === '[MIDIA_NAO_TEXTO]') {
    await saveMessage(phone, 'user', '[lead enviou audio/imagem]')
    const reply =
      'Oi! Recebi sua mensagem mas consigo te responder mais rapido por texto. Pode me escrever o que voce quer saber?'
    await saveMessage(phone, 'assistant', reply)
    await sendTextMessage(phone, reply)
    return
  }

  // Remove cabeçalho automático que o Meta injeta em leads de anúncio
  const textoLimpo = limparTemplateMeta(text)
  const textoFinal = textoLimpo.length > 0 ? textoLimpo : 'oi'

  // Detecta se a mensagem do usuário indica que ele vai sumir temporariamente
  const followupReason = detectFollowupReason(textoFinal)
  if (followupReason && !lead.seller_notified) {
    const followupAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    await updateLead(phone, {
      followup_at: followupAt,
      followup_reason: followupReason,
      followup_count: 0,
    })
    logger.info(`Follow-up agendado para ${phone}`, { reason: followupReason, at: followupAt })
  }

  // Se o lead voltou a falar e tinha follow-up pendente, cancela
  if (lead.followup_at && !followupReason) {
    await updateLead(phone, {
      followup_at: null,
      followup_reason: null,
    })
    logger.info(`Follow-up cancelado para ${phone} (lead voltou a conversar)`)
  }

  // Pedido técnico → envia áudio pré-gravado, sem chamar GPT
  if (isTechnicalRequest(textoFinal)) {
    await saveMessage(phone, 'user', textoFinal)
    try {
      logger.info(`Pedido técnico detectado de ${phone}, enviando áudio`)
      await sendAudio(phone, env.audio.pitchTecnico)
      await new Promise(resolve => setTimeout(resolve, 1500))
      const followupText = 'Aí está rapidinho 👊 Te mando também a máquina trabalhando:'
      await sendTextMessage(phone, followupText)

      await new Promise(resolve => setTimeout(resolve, 1500))
      await sendTextMessage(phone, '🔧 Fazendo no próprio carro: https://youtube.com/shorts/DX-LsXkVvT8\n\n⚙️ Retífica na máquina: https://youtube.com/shorts/Vbr1BZAfo-Q')

      await new Promise(resolve => setTimeout(resolve, 1500))
      await sendTextMessage(phone, 'Ela também faz tambor de freio e volante de embreagem. Quer que eu te mande esses também?')

      await saveMessage(phone, 'assistant', '[ÁUDIO_PITCH + VÍDEOS ENVIADOS] ' + followupText)
      return
    } catch (err) {
      logger.error(`Erro ao enviar áudio técnico para ${phone}`, { error: (err as Error).message })
      // Falhou — continua fluxo normal (Julia responde por texto)
    }
  }

  // Pedido de preço → fluxo controlado com pausa de 30s antes da proposta
  if (isPriceRequest(textoFinal)) {
    await saveMessage(phone, 'user', textoFinal)
    try {
      logger.info(`Pedido de preço detectado de ${phone}, enviando fluxo controlado`)

      const nomeExibicao = lead.name ?? 'tudo bem'

      // 1. Cumprimento
      const cumprimento = `Olá ${nomeExibicao}! Aqui é a Julia da XIIINA 👊`
      await sendTextMessage(phone, cumprimento)
      await saveMessage(phone, 'assistant', cumprimento)

      await new Promise(resolve => setTimeout(resolve, 1500))

      // 2. Anúncio dos vídeos
      const anuncio = 'Te mando os vídeos da Miura trabalhando primeiro 👊'
      await sendTextMessage(phone, anuncio)
      await saveMessage(phone, 'assistant', anuncio)

      await new Promise(resolve => setTimeout(resolve, 1500))

      // 3. 4 vídeos agrupados em uma única mensagem
      const videos = '🔧 Fazendo no próprio carro: https://youtube.com/shorts/DX-LsXkVvT8\n\n⚙️ Retífica na máquina: https://youtube.com/shorts/Vbr1BZAfo-Q\n\n🛞 Tambor de freio: https://youtube.com/shorts/873I3ZQKkqc\n\n🔩 Volante de embreagem: https://youtube.com/shorts/EwXbLf1fZEU'
      await sendTextMessage(phone, videos)
      await saveMessage(phone, 'assistant', videos)

      // 4. Pausa de 30s para o lead ver os vídeos
      logger.info(`Aguardando 30s antes de enviar proposta para ${phone}`)
      await new Promise(resolve => setTimeout(resolve, 30000))

      // 5. Proposta formatada completa
      const proposta = `📋 *Proposta Comercial – Retífica de Disco Miura X433*

*Equipamento:* Retífica de Disco Miura X433

━━━━━━━━━━━━━━━

💰 *Condições de Pagamento*

✅ *Valor à Vista*
R$ 27.900,00
🔥 Condição especial no PIX

━━━━━━━━━━━━━━━

💳 *Cartão de Crédito*
Em até 18x de R$ 1.869 (com as taxas da operadora)

━━━━━━━━━━━━━━━

🧾 *Boleto*
Entrada de R$ 10.000 + saldo em 12x de R$ 1.658

━━━━━━━━━━━━━━━

✅ *Incluso*
- Treinamento completo
- Suporte técnico
- Garantia de 3 anos
- Equipamento profissional linha Miura

━━━━━━━━━━━━━━━

🚀 Somos referência no Brasil em retífica de disco automotiva.`

      await sendTextMessage(phone, proposta)
      await saveMessage(phone, 'assistant', proposta)

      await new Promise(resolve => setTimeout(resolve, 1500))

      // 6. Fecho
      const fecho = 'Qualquer dúvida me chama 👊'
      await sendTextMessage(phone, fecho)
      await saveMessage(phone, 'assistant', fecho)

      // 7. Agenda follow-up para o dia seguinte às 9h
      try {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(9, 0, 0, 0)
        await updateLead(phone, {
          followup_at: tomorrow,
          followup_reason: 'proposta_enviada',
          followup_count: 0,
        })
        logger.info(`Follow-up de proposta agendado para ${phone}`, { at: tomorrow.toISOString() })
      } catch (err) {
        logger.error(`Erro ao agendar follow-up de proposta para ${phone}`, { error: (err as Error).message })
      }

      return
    } catch (err) {
      logger.error(`Erro no fluxo controlado de preço para ${phone}`, { error: (err as Error).message })
      // Falhou — continua fluxo normal (GPT responde)
    }
  }

  const history = await getHistory(phone, 10)
  const reply = await generateSDRResponse(history, textoFinal, lead.name)

  await saveMessage(phone, 'user', textoFinal)

  const parts = reply.split('[[SPLIT]]').map(p => p.trim()).filter(p => p.length > 0)
  const savedReply = parts.join('\n\n')
  await saveMessage(phone, 'assistant', savedReply)

  // Envia a resposta ANTES de qualquer hand-off para garantir que o lead recebe a despedida
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 1300))
    }
    await sendTextMessage(phone, parts[i])
  }

  if (containsHandoffMarker(reply)) {
    logger.info(`Hand-off detectado na resposta da Julia para ${phone}`)
    await updateLead(phone, { status: 'QUENTE' })
    if (!lead.seller_notified && env.seller.whatsapp) {
      await notifySeller(phone, lead)
      await updateLead(phone, { seller_notified: true })
    }
    return
  }

  if (containsFollowupMarker(reply)) {
    const followupAt = new Date(Date.now() + 24 * 60 * 60 * 1000)
    logger.info(`Follow-up agendado para ${phone} em ${followupAt.toISOString()}`)
    await updateLead(phone, { awaiting_followup_at: followupAt })
    return
  }

  // Classificação de fundo (MORNO/FRIO apenas) — não notifica vendedor
  const userMessages = history.filter(m => m.role === 'user').length + 1
  if (userMessages % 4 === 0 || userMessages === 6) {
    const updatedHistory = [...history, { role: 'user' as const, content: textoFinal }]
    const classification = await classifyLead(updatedHistory)
    logger.info(`Lead ${phone} classificado como: ${classification}`)
    if (classification !== 'QUENTE') {
      await updateLead(phone, { status: classification })
    }
  }
}

async function notifySeller(leadPhone: string, lead: Lead): Promise<void> {
  const briefingMsg = await buildHandoffBriefing(leadPhone, lead)
  await sendTextMessage(env.seller.whatsapp, briefingMsg)
  logger.info(`Vendedor notificado sobre lead quente: ${leadPhone}`)
}
