/**
 * FASE 1.1 — Etapa de descoberta antes dos vídeos.
 *
 * Problema corrigido: quando o lead pedia "informações da Miura", a Julia
 * despejava vídeos + proposta de imediato, antecipando preço antes de construir
 * valor.
 *
 * Novo fluxo:
 *   1) Lead pede informação.
 *   2) Julia apresenta a Miura brevemente (4 funções + público-alvo + benefício).
 *   3) Julia pergunta o tipo de operação.
 *   4) SÓ DEPOIS da resposta → envia os vídeos.
 *   5) Proposta só quando o lead pedir valor OU 1h após os vídeos sem resposta
 *      (mecânica de follow-up já existente — não alterada aqui).
 *
 * Este módulo contém apenas conteúdo estático + uma função pura (detectUseType),
 * de forma que possa ser testado sem banco/WhatsApp/OpenAI.
 */

// Pergunta de descoberta — feita ANTES de enviar qualquer vídeo.
export const DISCOVERY_QUESTION =
  'Você trabalha com oficina, auto center ou concessionária?'

/**
 * Apresentação breve da Miura: 4 funções + benefício principal.
 * Retorna as mensagens já separadas (estilo WhatsApp), enviadas com um pequeno
 * delay entre si. NÃO menciona preço, proposta nem envia vídeos.
 */
export function buildDiscoveryPresentation(): string[] {
  return [
    // 4 funções
    'A Miura X433 é uma máquina profissional que realiza 4 funções:\n\n' +
      '🔧 Retífica de disco no próprio veículo\n' +
      '⚙️ Retífica de disco fora do veículo (na máquina)\n' +
      '🛞 Retífica de tambor de freio\n' +
      '🔩 Retífica de volante de embreagem (em alguns modelos)',
    // benefício principal
    'Muitas oficinas que já adquiriram a Miura deixaram de terceirizar seus serviços de retífica, ' +
      'ganhando mais agilidade na entrega, mais qualidade nos serviços, aumentando o faturamento ' +
      'e a satisfação dos seus clientes.',
  ]
}

// Os 4 vídeos da Miura, agrupados em UMA única mensagem (mesmo formato do fluxo de preço).
export const VIDEOS_MIURA =
  '🔧 Fazendo no próprio carro: https://youtube.com/shorts/DX-LsXkVvT8\n\n' +
  '⚙️ Retífica na máquina: https://youtube.com/shorts/Vbr1BZAfo-Q\n\n' +
  '🛞 Tambor de freio: https://youtube.com/shorts/873I3ZQKkqc\n\n' +
  '🔩 Volante de embreagem: https://youtube.com/shorts/EwXbLf1fZEU'

// Detecção do tipo de operação a partir da resposta de descoberta.
// Ordem importa: "auto center" e "retífica" são checados antes de "oficina/mecânica".
const USE_TYPE_PATTERNS: Array<{ type: string; re: RegExp }> = [
  { type: 'auto center', re: /auto\s*[- ]?\s*center/i },
  { type: 'concessionaria', re: /concession[áa]ria/i },
  { type: 'retifica', re: /ret[ií]fica/i },
  { type: 'oficina', re: /oficina|mec[âa]nic[ao]/i },
]

/**
 * Tenta identificar o tipo de operação do lead na resposta de descoberta.
 * Retorna 'auto center' | 'concessionaria' | 'retifica' | 'oficina' ou null.
 */
export function detectUseType(text: string): string | null {
  for (const { type, re } of USE_TYPE_PATTERNS) {
    if (re.test(text)) return type
  }
  return null
}
