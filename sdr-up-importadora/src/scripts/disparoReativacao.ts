import { readFile } from 'fs/promises'
import { join } from 'path'
import { connectDatabase } from '../config/database'
import { sendTextMessage } from '../services/whatsapp'
import { findOrCreateLead } from '../models/lead'
import { saveMessage } from '../models/conversation'
import { logger } from '../config/logger'

const VARIACOES = [
  'Opa {nome}, tudo bem? 👊 Aqui é a Julia da XIIINA. Você tinha demonstrado interesse na retífica de disco Miura X433 um tempo atrás. Ainda tá procurando equipamento pra oficina, ou já resolveu?',
  'Oi {nome}! Aqui é a Julia da XIIINA 👊 Lembrei de você — tínhamos conversado sobre a retífica de disco Miura. Faz sentido a gente retomar?',
  '{nome}, tudo certo? 👊 Julia da XIIINA aqui. Aquela retífica de disco que você tinha perguntado ainda tá no seu radar?',
]

function escolheVariacao(nome: string): string {
  const idx = Math.floor(Math.random() * VARIACOES.length)
  return VARIACOES[idx].replace(/\{nome\}/g, nome)
}

function delayAleatorio(): number {
  // entre 30 e 90 segundos, em ms
  return (30 + Math.floor(Math.random() * 60)) * 1000
}

async function dispararReativacao(): Promise<void> {
  await connectDatabase()

  const listaPath = join(__dirname, 'leads-reativacao.json')
  const raw = await readFile(listaPath, 'utf-8')
  const leads: { nome: string; phone: string }[] = JSON.parse(raw)

  logger.info(`Iniciando disparo de reativação para ${leads.length} leads`)

  let enviados = 0
  for (let i = 0; i < leads.length; i++) {
    const { nome, phone } = leads[i]
    try {
      await findOrCreateLead(phone, nome)

      const mensagem = escolheVariacao(nome)
      await sendTextMessage(phone, mensagem)
      await saveMessage(phone, 'assistant', '[REATIVAÇÃO] ' + mensagem)

      enviados++
      logger.info(`Reativação enviada (${enviados}/${leads.length}) para ${nome} (${phone})`)

      if (i < leads.length - 1) {
        const ms = delayAleatorio()
        logger.info(`Aguardando ${Math.round(ms / 1000)}s antes do próximo envio...`)
        await new Promise((r) => setTimeout(r, ms))
      }
    } catch (err) {
      logger.error(`Erro ao enviar reativação para ${nome} (${phone})`, {
        error: (err as Error).message,
      })
    }
  }

  logger.info(`Disparo concluído. ${enviados}/${leads.length} enviados com sucesso.`)
  process.exit(0)
}

dispararReativacao().catch((err) => {
  logger.error('Erro fatal no disparo de reativação', { error: (err as Error).message })
  process.exit(1)
})
