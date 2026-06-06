/**
 * Mecanismo DETERMINÍSTICO de hand-off (Fase 0 — Hand-off Robusto).
 *
 * Antes, o hand-off dependia de o GPT escrever uma frase literal ("vou passar
 * pro nosso comercial"). Com temperature 0.7 o modelo parafraseava e o hand-off
 * se perdia silenciosamente (Bug #1). Agora o prompt instrui o modelo a anexar o
 * token de controle [[HANDOFF]] ao final de qualquer despedida/encaminhamento.
 *
 * - `containsHandoffSignal`: detecta o token (sinal primário, determinístico) OU
 *   a frase canônica legada (fallback, para não regredir conversas em andamento).
 * - `stripHandoffSignal`: remove o token ANTES de enviar a mensagem ao lead — o
 *   marcador nunca pode aparecer para o cliente.
 */
export const HANDOFF_TOKEN = '[[HANDOFF]]'

// Fallback legado: frases canônicas Opção A/B e variações com "comercial/vendedor/equipe".
const HANDOFF_REGEX =
  /\b(vou|passo|encaminho|encaminhar|repasso|repassar|passar|conectar|conectando|conecto)\b[^.!?]{0,80}\b(comercial|vendedor|equipe|nosso time|atendimento humano)\b/i

export function containsHandoffSignal(text: string): boolean {
  return text.includes(HANDOFF_TOKEN) || HANDOFF_REGEX.test(text)
}

export function stripHandoffSignal(text: string): string {
  return text
    .split(HANDOFF_TOKEN)
    .join('')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+\n/g, '\n')
    .trim()
}
