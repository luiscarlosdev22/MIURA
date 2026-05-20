export function isTechnicalRequest(userMessage: string): boolean {
  const patterns = [
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

  return patterns.some(p => p.test(userMessage))
}
