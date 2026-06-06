import { mentionsSpring } from './priceRequestDetector'

const TECHNICAL_PATTERNS = [
  /info.{0,5}t[eé]cnica/i,
  /detalhes.{0,10}m[aá]quina/i,
  /como.{0,5}funciona/i,
  /como.{0,5}ela.{0,5}funciona/i,
  /o que.{0,5}ela.{0,5}faz/i,
  /como.{0,5}trabalha/i,
  /me explica.{0,15}m[aá]quina/i,
  /me explica.{0,15}miura/i,
  /quais.{0,5}fun[çc][õo]es/i,
  /especifica[çc][õo]es/i,
  /caracter[ií]sticas/i,
  /\bo que (faz|tem)\b/i,
]

/**
 * Verifica se a mensagem é pedido técnico E o contexto é Miura (não Spring).
 *
 * Espelha a guarda anti-Spring do priceRequestDetector: se a mensagem atual OU
 * qualquer das últimas mensagens menciona um produto Spring (encolhedor, gdi,
 * simulador, etc.), NÃO dispara o áudio/vídeos técnicos da Miura — respeitando a
 * ordem fixa da Arquitetura 7.1 (Spring é checado antes do técnico).
 */
export function isTechnicalRequest(
  userMessage: string,
  recentMessages: string[] = []
): boolean {
  // Se mensagem atual menciona Spring → não dispara fluxo técnico Miura
  if (mentionsSpring(userMessage)) {
    return false
  }

  // Se contexto recente (últimas 5 mensagens) menciona Spring → não dispara Miura
  const recent = recentMessages.slice(-5).join(' ')
  if (mentionsSpring(recent)) {
    return false
  }

  return TECHNICAL_PATTERNS.some(p => p.test(userMessage))
}
