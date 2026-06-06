const PRICE_PATTERNS = [
  /quanto\s+custa/i,
  /qual\s+(o\s+)?valor/i,
  /qual\s+(o\s+)?pre[çc]o/i,
  /pre[çc]o/i,
  /valores?/i,
  /condi[çc][õo]es\s+(de\s+)?pagamento/i,
  /me\s+manda\s+(uma\s+)?proposta/i,
  /tem\s+como\s+mandar\s+as?\s+condi[çc][õo]es/i,
  /me\s+passa\s+por\s+escrito/i,
  /or[çc]amento/i,
  /quanto\s+(sai|fica|t[áa])/i,
  /\bvalor\b/i,
]

// Produtos Spring sem estoque — se mencionados, NÃO dispara fluxo Miura
const SPRING_KEYWORDS = [
  /simulador\s+de\s+folga/i,
  /simulador/i,
  /encolhedor\s+de\s+molas/i,
  /encolhedor/i,
  /gdi/i,
  /bico\s+(injetor|gdi)/i,
  /armario\s+(americano|spring)?/i,
  /armário/i,
]

export function mentionsSpring(text: string): boolean {
  return SPRING_KEYWORDS.some((p) => p.test(text))
}

/**
 * Verifica se a mensagem é pedido de preço E o contexto é Miura (não Spring).
 *
 * Recebe a mensagem atual + opcionalmente o histórico recente (últimas mensagens).
 * Se a mensagem OU qualquer das últimas mensagens menciona produto Spring,
 * NÃO considera pedido de preço Miura.
 */
export function isPriceRequest(
  userMessage: string,
  recentMessages: string[] = []
): boolean {
  // Se mensagem atual menciona Spring → não dispara Miura
  if (mentionsSpring(userMessage)) {
    return false
  }

  // Se contexto recente (últimas 5 mensagens) menciona Spring → não dispara Miura
  const recent = recentMessages.slice(-5).join(' ')
  if (mentionsSpring(recent)) {
    return false
  }

  // Passou pelos filtros: verifica se é mesmo pedido de preço
  return PRICE_PATTERNS.some((p) => p.test(userMessage))
}
