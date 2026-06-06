import { buildHandoffBriefing, buildNewLeadNotification } from './handoffBriefing'
import { detectFollowupReason } from './followupDetector'
import { findOrCreateLead, updateLead, Lead } from '../models/lead'
import { saveMessage, getHistory } from '../models/conversation'
import { generateSDRResponse, classifyLead } from './ai'
import { sendTextMessage } from './whatsapp'
import { isTechnicalRequest } from './technicalRequestDetector'
import { isPriceRequest } from './priceRequestDetector'
import { isSimulationRequest } from './simulationRequestDetector'
import { containsHandoffSignal, stripHandoffSignal } from './handoffSignal'
import { PROPOSTA_MIURA, FECHO_PROPOSTA } from './proposta'
import {
  buildDiscoveryPresentation,
  DISCOVERY_QUESTION,
  VIDEOS_MIURA,
  detectUseType,
} from './discovery'
import { logger } from '../config/logger'
import { env } from '../config/env'

const FOLLOWUP_MARKERS = [
  'vou pedir pro comercial preparar',
  'vou encaminhar pra nossa equipe',
  'vou encaminhar para nossa equipe',
]

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

  // Busca histórico uma única vez — usado pelos detectores e pelo GPT
  const history = await getHistory(phone, 10)
  const recentMessages = history.map(m => m.content)
  const jaCumprimentou = history.some(m => m.role === 'assistant')

  // Pedido de simulação (parcelas/entrada/financiamento/juros) → hand-off automático.
  // Só dispara quando NÃO houve gatilho de acompanhamento (MATURANDO_DECISAO), para
  // que "vou ver com o banco" / "momento da empresa" sigam para follow-up, e apenas
  // PEDIDOS de condição ("faz em 6x?", "dá pra financiar?") gerem hand-off.
  if (!followupReason && isSimulationRequest(textoFinal)) {
    await saveMessage(phone, 'user', textoFinal)
    logger.info(`Pedido de simulação detectado de ${phone} — hand-off automático`)
    try {
      const msg = 'Vou simular essa condição certinha e nosso comercial te retorna com os valores 👊'
      await sendTextMessage(phone, msg)
      await saveMessage(phone, 'assistant', msg)
      await updateLead(phone, { status: 'QUENTE' })
      if (!lead.seller_notified && env.seller.whatsapp) {
        await notifySeller(phone, lead)
        await updateLead(phone, { seller_notified: true })
      }
      return
    } catch (err) {
      logger.error(`Erro no hand-off de simulação para ${phone}`, { error: (err as Error).message })
      // Falhou — segue o fluxo normal (GPT responde)
    }
  }

  // --- FASE 1.1 — Etapa de descoberta ANTES dos vídeos ---
  // Objetivo: não despejar vídeos/proposta no primeiro pedido de informação.
  //   (A) Lead pede informação → Julia apresenta a Miura brevemente (4 funções +
  //       público-alvo + benefício) e pergunta o tipo de operação. NÃO envia vídeos.
  //   (B) Lead responde → SÓ AGORA envia os vídeos e agenda a proposta automática (1h).
  // Só roda quando NÃO há maturação, simulação nem pedido de preço — esses seguem
  // seus fluxos originais (follow-up, proposta, hand-off e maturação não são alterados).
  if (
    !followupReason &&
    !isSimulationRequest(textoFinal) &&
    !isPriceRequest(textoFinal, recentMessages)
  ) {
    const videosJaEnviados = await jaEnviouVideos(phone)

    // (B) Descoberta já feita e vídeos ainda não enviados → este turno é a RESPOSTA.
    if (lead.discovery_asked && !videosJaEnviados) {
      await saveMessage(phone, 'user', textoFinal)
      try {
        logger.info(`Resposta de descoberta recebida de ${phone} — enviando vídeos`)

        const useType = detectUseType(textoFinal)
        if (useType) {
          await updateLead(phone, { use_type: useType, has_shop: true })
        }

        const intro = 'Show 👊 te mando uns vídeos curtos da Miura trabalhando:'
        await sendTextMessage(phone, intro)
        await saveMessage(phone, 'assistant', intro)
        await new Promise(resolve => setTimeout(resolve, 1500))

        await sendTextMessage(phone, VIDEOS_MIURA)
        await saveMessage(phone, 'assistant', VIDEOS_MIURA)
        await new Promise(resolve => setTimeout(resolve, 1500))

        const fecho = 'Qualquer dúvida ou pra falar de valores, é só me chamar 👊'
        await sendTextMessage(phone, fecho)
        await saveMessage(phone, 'assistant', fecho)

        // Agenda envio automático da proposta caso o lead não responda em 1h
        // (mesma mecânica do fluxo de preço — follow-up 'enviar_proposta').
        try {
          const emUmaHora = new Date(Date.now() + 60 * 60 * 1000)
          await updateLead(phone, {
            followup_at: emUmaHora,
            followup_reason: 'enviar_proposta',
            followup_count: 0,
          })
          logger.info(`Follow-up enviar_proposta agendado para ${phone}`, { at: emUmaHora.toISOString() })
        } catch (err) {
          logger.error(`Erro ao agendar follow-up enviar_proposta para ${phone}`, { error: (err as Error).message })
        }
        return
      } catch (err) {
        logger.error(`Erro ao enviar vídeos pós-descoberta para ${phone}`, { error: (err as Error).message })
        // Falhou — segue o fluxo normal (GPT responde)
      }
    }

    // (A) Primeiro pedido de informação (técnico) e descoberta ainda não iniciada →
    //     apresenta a Miura + faz a pergunta de descoberta. NÃO envia vídeos.
    if (isTechnicalRequest(textoFinal, recentMessages) && !lead.discovery_asked && !videosJaEnviados) {
      await saveMessage(phone, 'user', textoFinal)
      try {
        logger.info(`Pedido de informação detectado de ${phone} — iniciando descoberta (sem vídeos)`)

        if (!jaCumprimentou) {
          const nomeExibicao = lead.name ?? ''
          const cumprimento = nomeExibicao
            ? `Olá ${nomeExibicao}! Aqui é a Julia da XIIINA.COM 👊`
            : 'Olá! Aqui é a Julia da XIIINA.COM 👊'
          await sendTextMessage(phone, cumprimento)
          await saveMessage(phone, 'assistant', cumprimento)
          await new Promise(resolve => setTimeout(resolve, 1500))
        }

        for (const parte of buildDiscoveryPresentation()) {
          await sendTextMessage(phone, parte)
          await saveMessage(phone, 'assistant', parte)
          await new Promise(resolve => setTimeout(resolve, 1500))
        }

        await sendTextMessage(phone, DISCOVERY_QUESTION)
        await saveMessage(phone, 'assistant', DISCOVERY_QUESTION)

        await updateLead(phone, { discovery_asked: true })
        return
      } catch (err) {
        logger.error(`Erro na etapa de descoberta para ${phone}`, { error: (err as Error).message })
        // Falhou — segue o fluxo normal (GPT responde)
      }
    }
  }

  if (isPriceRequest(textoFinal, recentMessages)) {
    await saveMessage(phone, 'user', textoFinal)
    try {
      logger.info(`Pedido de preço detectado de ${phone}`)

      // Verifica se Julia JÁ MANDOU os vídeos antes (procura link do 1º vídeo no histórico)
      let jaMandouVideos = false
      try {
        const { db } = await import('../config/database')
        const res = await db.query(
          "SELECT COUNT(*) AS total FROM conversations WHERE phone=$1 AND role='assistant' AND content LIKE '%DX-LsXkVvT8%'",
          [phone]
        )
        jaMandouVideos = Number(res.rows[0]?.total ?? 0) > 0
      } catch (err) {
        logger.error(`Erro ao checar se já enviou vídeos para ${phone}`, { error: (err as Error).message })
      }

      const nomeExibicao = lead.name ?? 'tudo bem'

      if (!jaMandouVideos) {
        // 1ª VEZ pedindo valor: manda vídeos + fecho consultivo, SEM proposta, SEM follow-up
        logger.info(`Primeiro pedido de valor de ${phone} — enviando vídeos sem proposta`)

        // Cumprimento (só se ainda não cumprimentou)
        let jaCumprimentouAgora = false
        try {
          const { db } = await import('../config/database')
          const res = await db.query(
            "SELECT COUNT(*) AS total FROM conversations WHERE phone=$1 AND role='assistant'",
            [phone]
          )
          jaCumprimentouAgora = Number(res.rows[0]?.total ?? 0) > 0
        } catch (err) {
          logger.error(`Erro ao checar histórico de cumprimento para ${phone}`, { error: (err as Error).message })
        }

        if (!jaCumprimentouAgora) {
          const cumprimento = `Olá ${nomeExibicao}! Aqui é a Julia da XIIINA 👊`
          await sendTextMessage(phone, cumprimento)
          await saveMessage(phone, 'assistant', cumprimento)
          await new Promise(resolve => setTimeout(resolve, 1500))
        }

        // Anúncio em 2 mensagens com pausa curta
        const anuncio1 = 'A Miura X433 faz 4 funções, te mando um vídeo curto de cada uma 👊'
        await sendTextMessage(phone, anuncio1)
        await saveMessage(phone, 'assistant', anuncio1)
        await new Promise(resolve => setTimeout(resolve, 1500))

        const anuncio2 = 'São vídeos do YouTube, não baixam nada no seu celular.'
        await sendTextMessage(phone, anuncio2)
        await saveMessage(phone, 'assistant', anuncio2)
        await new Promise(resolve => setTimeout(resolve, 1500))

        // 4 vídeos agrupados
        const videos = '🔧 Fazendo no próprio carro: https://youtube.com/shorts/DX-LsXkVvT8\n\n⚙️ Retífica na máquina: https://youtube.com/shorts/Vbr1BZAfo-Q\n\n🛞 Tambor de freio: https://youtube.com/shorts/873I3ZQKkqc\n\n🔩 Volante de embreagem: https://youtube.com/shorts/EwXbLf1fZEU'
        await sendTextMessage(phone, videos)
        await saveMessage(phone, 'assistant', videos)
        await new Promise(resolve => setTimeout(resolve, 1500))

        // Fecho consultivo (convida o lead a dar o próximo passo)
        const fecho = 'Qualquer dúvida ou pra falar de valores, é só me chamar 👊'
        await sendTextMessage(phone, fecho)
        await saveMessage(phone, 'assistant', fecho)

        // Agenda envio automático da proposta caso o lead não responda em 1h
        try {
          const emUmaHora = new Date(Date.now() + 60 * 60 * 1000)
          await updateLead(phone, {
            followup_at: emUmaHora,
            followup_reason: 'enviar_proposta',
            followup_count: 0,
          })
          logger.info(`Follow-up enviar_proposta agendado para ${phone}`, { at: emUmaHora.toISOString() })
        } catch (err) {
          logger.error(`Erro ao agendar follow-up enviar_proposta para ${phone}`, { error: (err as Error).message })
        }

        return
      }

      // SEGUNDO pedido de valor (já tinha mandado vídeos antes): manda proposta + agenda follow-up
      logger.info(`Lead ${phone} pedindo valor pós-vídeos — enviando proposta`)

      await sendTextMessage(phone, PROPOSTA_MIURA)
      await saveMessage(phone, 'assistant', PROPOSTA_MIURA)

      await new Promise(resolve => setTimeout(resolve, 1500))

      await sendTextMessage(phone, FECHO_PROPOSTA)
      await saveMessage(phone, 'assistant', FECHO_PROPOSTA)

      // Agenda follow-up automático para o dia seguinte (só agora, depois da proposta)
      try {
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(9, 0, 0, 0)
        const { db } = await import('../config/database')
        await db.query(
          'UPDATE leads SET followup_at=$1, followup_reason=$2, followup_count=0 WHERE phone=$3',
          [tomorrow, 'proposta_enviada', phone]
        )
        logger.info(`Follow-up de proposta agendado para ${phone}`, { at: tomorrow.toISOString() })
      } catch (err) {
        logger.error(`Erro ao agendar follow-up de proposta para ${phone}`, { error: (err as Error).message })
      }

      return
    } catch (err) {
      logger.error(`Erro no fluxo controlado de preço para ${phone}`, { error: (err as Error).message })
      // Se falhar, deixa o fluxo normal seguir
    }
  }

  const reply = await generateSDRResponse(history, textoFinal, lead.name)

  await saveMessage(phone, 'user', textoFinal)

  // Detecta o sinal de hand-off na resposta BRUTA (token [[HANDOFF]] ou frase legada)
  // antes de remover o token.
  //
  // MATURANDO_DECISAO é estado PRIORITÁRIO: se este turno foi classificado como
  // acompanhamento (sócio/irmão/esposa/decisor, "vou analisar/pensar/verificar/ver
  // com alguém"), o lead NUNCA é promovido a QUENTE — mesmo que o GPT emita um sinal
  // de hand-off. O follow-up agendado é o desfecho autoritativo do turno.
  const handoff = containsHandoffSignal(reply) && !followupReason

  // Remove o token de controle [[HANDOFF]] — nunca pode chegar ao lead.
  const cleanReply = stripHandoffSignal(reply)

  const parts = cleanReply.split('[[SPLIT]]').map(p => p.trim()).filter(p => p.length > 0)
  const savedReply = parts.join('\n\n')
  await saveMessage(phone, 'assistant', savedReply)

  // Envia a resposta ANTES de qualquer hand-off para garantir que o lead recebe a despedida
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 1200 + Math.random() * 1300))
    }
    await sendTextMessage(phone, parts[i])
  }

  if (handoff) {
    logger.info(`Hand-off detectado na resposta da Julia para ${phone}`)
    await updateLead(phone, { status: 'QUENTE' })
    if (!lead.seller_notified && env.seller.whatsapp) {
      await notifySeller(phone, lead)
      await updateLead(phone, { seller_notified: true })
    }
    return
  }

  if (containsFollowupMarker(cleanReply)) {
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

// Verifica no histórico se os vídeos da Miura já foram enviados ao lead
// (procura o link do 1º vídeo nas mensagens da assistente).
async function jaEnviouVideos(phone: string): Promise<boolean> {
  try {
    const { db } = await import('../config/database')
    const res = await db.query(
      "SELECT COUNT(*) AS total FROM conversations WHERE phone=$1 AND role='assistant' AND content LIKE '%DX-LsXkVvT8%'",
      [phone]
    )
    return Number(res.rows[0]?.total ?? 0) > 0
  } catch (err) {
    logger.error(`Erro ao checar se já enviou vídeos para ${phone}`, { error: (err as Error).message })
    return false
  }
}

async function notifySeller(leadPhone: string, lead: Lead): Promise<void> {
  const briefingMsg = await buildHandoffBriefing(leadPhone, lead)
  await sendTextMessage(env.seller.whatsapp, briefingMsg)
  logger.info(`Vendedor notificado sobre lead quente: ${leadPhone}`)
}
