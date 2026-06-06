/**
 * Fase 0 — Estabilização Julia SDR
 * Testes unitários e de regressão das funções puras alteradas.
 * Executar: npx ts-node src/__tests__/fase0.test.ts
 *
 * Não toca em banco, WhatsApp ou OpenAI — valida apenas a lógica determinística.
 */
import { detectFollowupReason } from '../services/followupDetector'
import { isSimulationRequest } from '../services/simulationRequestDetector'
import { isTechnicalRequest } from '../services/technicalRequestDetector'
import { isPriceRequest } from '../services/priceRequestDetector'
import { containsHandoffSignal, stripHandoffSignal, HANDOFF_TOKEN } from '../services/handoffSignal'

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

console.log('\n=== D4/D5/D6 — gatilhos MATURANDO_DECISAO (detectFollowupReason) ===')
// D4 — "vou analisar" → pensar
check('D4 "vou analisar isso" → pensar', detectFollowupReason('vou analisar isso com calma'), 'pensar')
check('D4 "preciso analisar" → pensar', detectFollowupReason('preciso analisar melhor'), 'pensar')
// D5 — "vou falar com meu irmão" → socio
check('D5 "vou falar com meu irmão" → socio', detectFollowupReason('vou falar com meu irmão antes'), 'socio')
check('D5 "ver com minha irmã" → socio', detectFollowupReason('preciso ver com minha irmã'), 'socio')
// D6 — "momento da empresa" → pagamento
check('D6 "momento da empresa" → pagamento', detectFollowupReason('é um momento da empresa difícil'), 'pagamento')
check('D6 "momento do negócio" → pagamento', detectFollowupReason('não é o momento do negócio agora'), 'pagamento')

console.log('\n=== Fase 0.1 — as 7 frases da XIIINA são MATURANDO_DECISAO (nunca null) ===')
const frasesMaturando = [
  'vou falar com meu irmão',
  'vou falar com meu sócio',
  'vou conversar com a esposa',
  'vou analisar',
  'vou pensar',
  'preciso ver com alguém',
  'vou verificar',
]
for (const frase of frasesMaturando) {
  const r = detectFollowupReason(frase)
  check(`MATURANDO "${frase}" → não-null (${r})`, r !== null, true)
}
// Novos gatilhos específicos da Fase 0.1
check('0.1 "ver com alguém" → socio', detectFollowupReason('preciso ver com alguém antes'), 'socio')
check('0.1 "preciso verificar" → pensar', detectFollowupReason('preciso verificar uma coisa'), 'pensar')
check('0.1 "vou verificar" → pensar', detectFollowupReason('vou verificar e te falo'), 'pensar')
check('0.1 "vou conferir" → pensar', detectFollowupReason('vou conferir aqui'), 'pensar')

console.log('\n=== Fase 0.1 — GATE: hand-off é suprimido quando há followupReason ===')
// Simula a regra do leadProcessor: const handoff = containsHandoffSignal(reply) && !followupReason
function handoffEfetivo(replyDoGpt: string, msgDoLead: string): boolean {
  const followupReason = detectFollowupReason(msgDoLead)
  return containsHandoffSignal(replyDoGpt) && !followupReason
}
// Mesmo que o GPT emita [[HANDOFF]], MATURANDO_DECISAO bloqueia a promoção:
check('gate: "irmão" + GPT com [[HANDOFF]] → NÃO promove',
  handoffEfetivo('Vou te conectar com nosso comercial 👊 [[HANDOFF]]', 'vou falar com meu irmão'), false)
check('gate: "vou pensar" + GPT com [[HANDOFF]] → NÃO promove',
  handoffEfetivo('vou passar pro comercial [[HANDOFF]]', 'vou pensar'), false)
check('gate: "ver com alguém" + paráfrase de hand-off → NÃO promove',
  handoffEfetivo('vou repassar pro nosso comercial', 'preciso ver com alguém'), false)
// Hand-off legítimo (sem followupReason) CONTINUA promovendo:
check('gate: "quero falar com humano" + [[HANDOFF]] → PROMOVE',
  handoffEfetivo('Já te conecto com o comercial 👊 [[HANDOFF]]', 'quero falar com um humano'), true)
check('gate: aceitou comprar + [[HANDOFF]] → PROMOVE',
  handoffEfetivo('Perfeito! Vou passar pro nosso comercial [[HANDOFF]]', 'fechado, quero comprar'), true)

console.log('\n=== Regressão — gatilhos originais preservados ===')
check('reg socio "falar com meu sócio"', detectFollowupReason('vou falar com meu sócio'), 'socio')
check('reg pensar "vou pensar"', detectFollowupReason('vou pensar e te falo'), 'pensar')
check('reg pagamento "preciso organizar o dinheiro"', detectFollowupReason('preciso organizar o dinheiro primeiro'), 'pagamento')
check('reg neutra "qual o valor?" → null', detectFollowupReason('qual o valor?'), null)
// KNOWN ISSUE (Bug #5 — sombreamento /vou ver/, FORA DE ESCOPO da Fase 0): "vou ver com o
// banco" cai em 'pensar' antes de 'pagamento'. Asseguramos que as mudanças da Fase 0 NÃO
// alteraram este caminho — comportamento permanece o mesmo de antes (pré-existente).
check('Bug #5 (fora de escopo) inalterado: "vou ver com o banco" → pensar',
  detectFollowupReason('vou ver com o banco o financiamento'), 'pensar')

console.log('\n=== Simulação → hand-off automático (isSimulationRequest) ===')
check('sim "faz em 6x?"', isSimulationRequest('faz em 6x?'), true)
check('sim "quanto fica em 10x?"', isSimulationRequest('quanto fica em 10x?'), true)
check('sim "15 mil de entrada"', isSimulationRequest('e se eu der 15 mil de entrada?'), true)
check('sim "dá pra financiar?"', isSimulationRequest('dá pra financiar?'), true)
check('sim "tem financiamento?"', isSimulationRequest('vocês têm financiamento?'), true)
check('sim "sem juros"', isSimulationRequest('consegue fazer sem juros?'), true)
check('sim "parcelar"', isSimulationRequest('tem como parcelar?'), true)
// Negativos: não pode capturar pedido de preço puro nem produto
check('sim NEG "qual o valor?"', isSimulationRequest('qual o valor da máquina?'), false)
check('sim NEG "Miura X433"', isSimulationRequest('quero a Miura X433'), false)
check('sim NEG "como funciona?"', isSimulationRequest('como funciona a máquina?'), false)

console.log('\n=== Precedência: MATURANDO_DECISAO vence simulação (regra do leadProcessor) ===')
// "vou ver com o banco" deve ir para follow-up (pagamento), não simulação.
// No leadProcessor a simulação só roda quando followupReason é null.
const msgBanco = 'vou ver com o banco o financiamento'
const fr = detectFollowupReason(msgBanco)
// O essencial para a Fase 0: havendo QUALQUER gatilho de acompanhamento, a simulação é
// bloqueada no leadProcessor (a simulação só roda quando followupReason === null). Mesmo
// com o sombreamento do Bug #5 ('pensar' em vez de 'pagamento'), a precedência se mantém.
check('"vou ver com o banco" gera gatilho de acompanhamento (!= null)', fr !== null, true)
check('simulação fica bloqueada quando há followupReason (gate do leadProcessor)',
  fr === null && isSimulationRequest(msgBanco), false)

console.log('\n=== Correção Spring — detector técnico respeita Spring ===')
check('tec "como funciona a máquina?" (Miura)', isTechnicalRequest('como funciona a máquina?'), true)
check('tec NEG "como funciona o encolhedor?" (Spring)', isTechnicalRequest('como funciona o encolhedor?'), false)
check('tec NEG "o que faz o simulador?" (Spring)', isTechnicalRequest('o que faz o simulador de folga?'), false)
check('tec NEG Spring no contexto recente',
  isTechnicalRequest('como funciona?', ['tenho interesse no encolhedor de molas']), false)
check('tec OK contexto recente Miura',
  isTechnicalRequest('como funciona?', ['quero saber da Miura']), true)
// Espelha priceRequestDetector: preço também segue protegido
check('price NEG Spring "preço do gdi"', isPriceRequest('qual o preço do gdi?'), false)

console.log('\n=== Hand-off robusto — token [[HANDOFF]] (handoffSignal) ===')
check('detecta token', containsHandoffSignal('Vou te conectar agora 👊 [[HANDOFF]]'), true)
check('detecta paráfrase via fallback', containsHandoffSignal('vou passar agora pro nosso comercial pra dar sequência'), true)
check('detecta token mesmo com paráfrase que quebra regex',
  containsHandoffSignal('vou repassar suas infos pro setor responsável [[HANDOFF]]'), true)
check('NÃO detecta em conversa normal', containsHandoffSignal('te mando os vídeos da Miura 👊'), false)
// Sanitização: token nunca chega ao lead
check('strip remove token simples',
  stripHandoffSignal('Vou já te conectar com nosso comercial 👊 [[HANDOFF]]'),
  'Vou já te conectar com nosso comercial 👊')
check('strip remove token sem deixar resíduo',
  stripHandoffSignal('Anotei tudo [[HANDOFF]]'), 'Anotei tudo')
check('strip não contém o token',
  stripHandoffSignal('Perfeito! [[HANDOFF]]').includes(HANDOFF_TOKEN), false)
check('strip preserva [[SPLIT]]',
  stripHandoffSignal('Oi[[SPLIT]]tudo bem? [[HANDOFF]]'), 'Oi[[SPLIT]]tudo bem?')

console.log(`\n=== RESULTADO: ${pass} passaram, ${fail} falharam ===`)
if (fail > 0) {
  console.log('\nFALHAS:')
  failures.forEach(f => console.log(' - ' + f))
  process.exit(1)
}
console.log('Todos os testes passaram ✅')
