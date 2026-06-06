/**
 * Detecta pedidos de SIMULAÇÃO COMERCIAL na mensagem do lead.
 *
 * Cobre os quatro temas autorizados na Fase 0 (Plano de Estabilização v1.0,
 * item Simulação): parcelas, entrada, financiamento e juros. Quando casa, o
 * leadProcessor encaminha o lead direto para hand-off automático (decisão do
 * comercial humano) — sem depender da frase de saída do GPT.
 *
 * IMPORTANTE: este detector roda apenas quando `detectFollowupReason` NÃO casou.
 * Assim, frases de MATURANDO_DECISAO ("vou ver com o banco", "momento da
 * empresa") continuam indo para o fluxo de acompanhamento (follow-up), enquanto
 * PERGUNTAS/PEDIDOS sobre condição ("faz em 6x?", "dá pra financiar?", "quanto
 * de entrada?", "tem como sem juros?") geram hand-off.
 */
const SIMULATION_PATTERNS = [
  /\b\d{1,2}\s*x\b/i,            // parcelas: 6x, 10x, 12 x
  /parcel/i,                    // parcela, parcelar, parcelamento, parcelado
  /dividir\s+em/i,              // "dividir em 6"
  /\bentrada\b/i,               // entrada / de entrada
  /financi/i,                   // financiar, financiamento, financia, financiado
  /\bjuros?\b/i,                // juro, juros
  /sem\s+juros/i,               // sem juros
]

export function isSimulationRequest(userMessage: string): boolean {
  return SIMULATION_PATTERNS.some(p => p.test(userMessage))
}
