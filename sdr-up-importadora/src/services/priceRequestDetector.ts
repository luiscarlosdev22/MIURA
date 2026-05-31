export function isPriceRequest(userMessage: string): boolean {
  const patterns = [
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

  return patterns.some((p) => p.test(userMessage))
}
