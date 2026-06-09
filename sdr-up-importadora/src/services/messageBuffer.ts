import { processIncomingMessage } from './leadProcessor'
import { logger } from '../config/logger'

const DEBOUNCE_MS = 7000

interface PendingBuffer {
  parts: string[]
  name?: string
  timer: NodeJS.Timeout
}

const buffers = new Map<string, PendingBuffer>()

export function enqueueIncomingMessage(phone: string, text: string, name?: string): void {
  const existing = buffers.get(phone)
  if (existing) {
    existing.parts.push(text)
    if (name) existing.name = name
    clearTimeout(existing.timer)
    existing.timer = scheduleFlush(phone)
    return
  }
  buffers.set(phone, { parts: [text], name, timer: scheduleFlush(phone) })
}

function scheduleFlush(phone: string): NodeJS.Timeout {
  return setTimeout(() => {
    const buf = buffers.get(phone)
    if (!buf) return
    buffers.delete(phone)
    const combined = buf.parts.join('\n').trim()
    if (!combined) return
    logger.info(`Processando ${buf.parts.length} mensagem(ns) agrupada(s) de ${phone}`)
    processIncomingMessage(phone, combined, buf.name).catch(err => {
      logger.error(`Erro ao processar mensagem agrupada de ${phone}`, { error: (err as Error).message })
    })
  }, DEBOUNCE_MS)
}
