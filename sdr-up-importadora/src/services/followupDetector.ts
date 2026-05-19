export type FollowupReason = 'socio' | 'pensar' | 'pagamento' | null

export function detectFollowupReason(userMessage: string): FollowupReason {
  if (
    /(vou|preciso|tenho que).{0,15}(falar|conversar|ver|consultar).{0,15}(sócio|socio|esposa|marido|pai|chefe|patrão|patrao|equipe|gerente|time|parceiro)/i.test(userMessage) ||
    /com (meu|minha) (sócio|socio|esposa|marido|chefe|patrão|patrao|equipe|gerente|time|parceiro)/i.test(userMessage)
  ) {
    return 'socio'
  }

  if (
    /vou pensar/i.test(userMessage) ||
    /preciso pensar/i.test(userMessage) ||
    /vou ver/i.test(userMessage) ||
    /vou decidir/i.test(userMessage) ||
    /depois (te|eu).{0,10}(falo|aviso|retorno|respondo)/i.test(userMessage) ||
    /te (chamo|aviso|falo) depois/i.test(userMessage) ||
    /qualquer coisa (te|eu).{0,10}(chamo|falo|aviso|retorno)/i.test(userMessage)
  ) {
    return 'pensar'
  }

  if (
    /vou ver.{0,15}(banco|financiamento|crédito|credito|emprestimo|empréstimo)/i.test(userMessage) ||
    /vou (simular|consultar).{0,15}(banco|financiamento)/i.test(userMessage) ||
    /preciso (organizar|esperar|aguardar).{0,15}(dinheiro|caixa|grana|pagamento)/i.test(userMessage)
  ) {
    return 'pagamento'
  }

  return null
}

export function followupMessage(name: string | null, reason: FollowupReason, attempt: number): string {
  const nome = name ?? 'tudo bem'

  if (attempt === 1) {
    if (reason === 'socio') {
      return `Oi ${nome}! Tudo bem? 👊 Conseguiu falar com seu sócio sobre a Miura X433?`
    }
    if (reason === 'pensar') {
      return `Oi ${nome}! Tudo bem? 👊 Pensou mais sobre a máquina? Posso te ajudar com alguma dúvida?`
    }
    if (reason === 'pagamento') {
      return `Oi ${nome}! Tudo bem? 👊 Conseguiu organizar essa parte do pagamento ou simular com seu banco?`
    }
    return `Oi ${nome}! Tudo bem? 👊 Ainda interessado na Miura X433?`
  }

  // attempt === 2 (segunda tentativa, 5 dias depois)
  if (reason === 'socio') {
    return `Oi ${nome}! 👊 Tudo bem? Lembrei aqui da gente — saiu alguma conclusão com seu sócio sobre a máquina?`
  }
  if (reason === 'pensar') {
    return `Oi ${nome}! 👊 Tudo bem? Voltei aqui pra ver se ainda faz sentido a gente conversar sobre a Miura.`
  }
  if (reason === 'pagamento') {
    return `Oi ${nome}! 👊 Tudo bem? Lembrei aqui — saiu alguma coisa sobre o financiamento da máquina?`
  }
  return `Oi ${nome}! 👊 Tudo bem? Lembrei aqui de você. Ainda interessado na Miura?`
}
