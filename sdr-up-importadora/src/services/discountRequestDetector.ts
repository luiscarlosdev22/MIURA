/**
 * Detecta pedidos de DESCONTO ou NEGOCIAÇÃO na mensagem do lead.
 *
 * Cobre: pedido de desconto direto, tentativa de baixar valor, condição especial
 * do PIX e frete grátis. Quando casa, o leadProcessor encaminha para hand-off
 * automático — sem depender da frase de saída do GPT.
 *
 * IMPORTANTE: este detector roda apenas quando `detectFollowupReason` NÃO casou
 * e ANTES do bloco isPriceRequest, para interceptar negociações antes de reenviar
 * a proposta.
 */
const DISCOUNT_PATTERNS = [
  /desconto/i,
  /melhor\w*\s+(o\s+|esse\s+|nesse\s+)?(valor|pre[çc]o|condi)/i,
  /tem\s+como\s+(melhorar|baixar|abaixar|fazer\s+melhor)/i,
  /(abaixa|baixar|abaixar)\s+(o\s+)?(valor|pre[çc]o)/i,
  /(faz|sai|fica|consigo|fecha|d[áa])\s+por\s+/i,
  /[úu]ltimo\s+(valor|pre[çc]o)/i,
  /valor\s+especial/i,
  /condi[çc][ãa]o\s+(especial|do\s+pix|no\s+pix)/i,
  /(quanto|qual)\b.*\bpix\b/i,
  /frete\s+gr[áa]tis/i,
]

export function isDiscountRequest(userMessage: string): boolean {
  return DISCOUNT_PATTERNS.some(p => p.test(userMessage))
}
