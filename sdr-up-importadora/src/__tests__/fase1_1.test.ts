/**
 * Fase 1.1 — Etapa de descoberta antes dos vídeos.
 * Testes unitários e de regressão das funções puras / da lógica de gate.
 * Executar: npx ts-node src/__tests__/fase1_1.test.ts
 *
 * Não toca em banco, WhatsApp ou OpenAI — valida apenas a lógica determinística.
 */
import {
  buildDiscoveryPresentation,
  DISCOVERY_QUESTION,
  VIDEOS_MIURA,
  detectUseType,
} from '../services/discovery'
import { isTechnicalRequest } from '../services/technicalRequestDetector'
import { isPriceRequest } from '../services/priceRequestDetector'
import { isSimulationRequest } from '../services/simulationRequestDetector'
import { detectFollowupReason } from '../services/followupDetector'

let pass = 0
let fail = 0
const failures: string[] = []

function check(label: string, got: unknown, expected: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(expected)
  if (ok) {
    pass++
    console.log(`  ✅ ${label}`)
  } else {
    fail++
    failures.push(`${label} — esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(got)}`)
    console.log(`  ❌ ${label} — esperado ${JSON.stringify(expected)}, obtido ${JSON.stringify(got)}`)
  }
}

console.log('\n=== 1.1 — detectUseType (tipo de operação na resposta de descoberta) ===')
check('"tenho uma oficina" → oficina', detectUseType('tenho uma oficina'), 'oficina')
check('"sou mecânico, mecânica de bairro" → oficina', detectUseType('é uma mecânica de bairro'), 'oficina')
check('"trabalho com auto center" → auto center', detectUseType('trabalho com auto center'), 'auto center')
check('"auto-center" (hífen) → auto center', detectUseType('é um auto-center'), 'auto center')
check('"tenho retífica" → retifica', detectUseType('tenho uma retífica'), 'retifica')
check('"retifica" (sem acento) → retifica', detectUseType('trabalho em retifica'), 'retifica')
check('"trabalho numa concessionária" → concessionaria', detectUseType('trabalho numa concessionária'), 'concessionaria')
check('"concessionaria" (sem acento) → concessionaria', detectUseType('é uma concessionaria'), 'concessionaria')
// Precedência: auto center / retífica antes de oficina
check('"auto center / oficina" → auto center (precedência)', detectUseType('tenho um auto center e oficina'), 'auto center')
check('neutro "sei lá ainda" → null', detectUseType('sei lá ainda'), null)

console.log('\n=== 1.1 — apresentação breve cobre 4 funções + benefício (sem preço/proposta/vídeo) ===')
const apres = buildDiscoveryPresentation()
check('apresentação tem 2 mensagens', apres.length, 2)
const apresTxt = apres.join(' ').toLowerCase()
check('cita "4 funções"', /4 fun[çc][õo]es/i.test(apres.join(' ')), true)
check('cita disco no próprio veículo', apresTxt.includes('próprio veículo') || apresTxt.includes('proprio veiculo'), true)
check('cita retífica fora do veículo (na máquina)', apresTxt.includes('máquina') || apresTxt.includes('maquina'), true)
check('cita tambor de freio', apresTxt.includes('tambor'), true)
check('cita volante de embreagem', apresTxt.includes('volante'), true)
check('cita benefício (parar de terceirizar)',
  apresTxt.includes('terceirizar'), true)
// NÃO pode conter links de vídeo (vídeos só vêm depois da resposta)
check('apresentação NÃO contém link de vídeo', /youtube\.com/i.test(apres.join(' ')), false)
// NÃO pode mencionar preço nem proposta nesta etapa
check('apresentação NÃO menciona preço', /pre[çc]o|valor|r\$|reais/i.test(apres.join(' ')), false)
check('apresentação NÃO menciona proposta', /proposta/i.test(apres.join(' ')), false)

console.log('\n=== 1.1 — pergunta de descoberta (oficina / auto center / concessionária) ===')
const qLower = DISCOVERY_QUESTION.toLowerCase()
check('pergunta cita oficina', qLower.includes('oficina'), true)
check('pergunta cita auto center', qLower.includes('auto center'), true)
check('pergunta cita concessionária', qLower.includes('concessionária') || qLower.includes('concessionaria'), true)
// "retífica" foi substituída por "concessionária" na pergunta de qualificação
check('pergunta NÃO cita retífica (substituída por concessionária)', /ret[ií]fica/i.test(DISCOVERY_QUESTION), false)

console.log('\n=== 1.1 — VIDEOS_MIURA agrupa os 4 vídeos ===')
check('contém vídeo 1 (no carro)', VIDEOS_MIURA.includes('DX-LsXkVvT8'), true)
check('contém vídeo 2 (na máquina)', VIDEOS_MIURA.includes('Vbr1BZAfo-Q'), true)
check('contém vídeo 3 (tambor)', VIDEOS_MIURA.includes('873I3ZQKkqc'), true)
check('contém vídeo 4 (volante)', VIDEOS_MIURA.includes('EwXbLf1fZEU'), true)

console.log('\n=== 1.1 — GATE da descoberta (réplica da guarda do leadProcessor) ===')
// A etapa de descoberta só roda quando NÃO há maturação, simulação nem pedido de preço.
function descobertaPodeRodar(msg: string, recent: string[] = []): boolean {
  const followupReason = detectFollowupReason(msg)
  return (
    !followupReason &&
    !isSimulationRequest(msg) &&
    !isPriceRequest(msg, recent)
  )
}
// (A) Primeiro pedido de informação → descoberta DEVE poder rodar e ser pedido técnico
check('"quais as funções da máquina?" → gate aberto', descobertaPodeRodar('quais as funções da máquina?'), true)
check('"quais as funções da máquina?" → é pedido técnico', isTechnicalRequest('quais as funções da máquina?'), true)
check('"me explica a miura" → gate aberto + técnico',
  descobertaPodeRodar('me explica a miura') && isTechnicalRequest('me explica a miura'), true)
// Preço NÃO entra na descoberta (segue fluxo de preço original)
check('"quanto custa?" → gate FECHADO (vai pro fluxo de preço)', descobertaPodeRodar('quanto custa?'), false)
check('"qual o valor?" → gate FECHADO', descobertaPodeRodar('qual o valor da máquina?'), false)
// Simulação NÃO entra na descoberta (hand-off automático original)
check('"faz em 6x?" → gate FECHADO (simulação)', descobertaPodeRodar('faz em 6x?'), false)
// Maturação NÃO entra na descoberta (follow-up/maturação original preservados)
check('"vou pensar" → gate FECHADO (maturação)', descobertaPodeRodar('vou pensar'), false)
check('"vou falar com meu sócio" → gate FECHADO (maturação)', descobertaPodeRodar('vou falar com meu sócio'), false)
// Resposta de descoberta ("tenho oficina") NÃO é técnico/preço/simulação → cai no ramo (B)
check('resposta "tenho oficina" → gate aberto', descobertaPodeRodar('tenho uma oficina'), true)
check('resposta "tenho oficina" → NÃO é pedido técnico (ramo B, não A)', isTechnicalRequest('tenho uma oficina'), false)

console.log(`\n=== RESULTADO: ${pass} passaram, ${fail} falharam ===`)
if (fail > 0) {
  console.log('\nFALHAS:')
  failures.forEach(f => console.log(' - ' + f))
  process.exit(1)
}
console.log('Todos os testes passaram ✅')
