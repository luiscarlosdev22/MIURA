/**
 * Fase 1.3 — Consultora Técnica.
 *
 * Valida, de forma 100% determinística (sem banco/WhatsApp/OpenAI):
 *   (1) que a Base de Conhecimento Oficial da Miura contém os fatos liberados;
 *   (2) o ajuste da base (remove "compressor de ar", adiciona "tempo de serviço");
 *   (3) que a base NÃO vaza preço/condição comercial;
 *   (4) os limites/hand-off técnicos (volante + specs fora da ficha);
 *   (5) CARACTERIZAÇÃO: que os guardrails COMERCIAIS do sdr.ts continuam
 *       íntegros (preço, proposta, hand-off, follow-up, Spring) e que apenas os
 *       blocos TÉCNICOS mudaram conforme a espec.
 *
 * Executar: npx ts-node src/__tests__/fase1_3.test.ts
 */
import { MIURA_KNOWLEDGE_BLOCK, MIURA_SPECS } from '../prompts/miuraKnowledge'
import { SDR_SYSTEM_PROMPT } from '../prompts/sdr'

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

const KB = MIURA_KNOWLEDGE_BLOCK

console.log('\n=== 1.3 — Specs oficiais liberadas (presentes na base) ===')
check('voltagem 220V monofásico', KB.includes('220V monofásico'), true)
check('disco até 500 mm', /disco.{0,40}500\s*mm/i.test(KB), true)
check('tambor até 500 mm', /tambor.{0,40}500\s*mm/i.test(KB), true)
check('peso 120 kg', KB.includes('120 kg'), true)
check('altura 120 cm', KB.includes('120 cm'), true)
check('largura 70 cm', KB.includes('70 cm'), true)
check('garantia 3 anos', /3\s*anos/.test(KB), true)
check('equipamento móvel', /m[óo]vel/i.test(KB), true)
check('potência 0,75 HP', /0[,.]75\s*HP/i.test(KB), true)

console.log('\n=== 1.3 — MIURA_SPECS (estrutura) ===')
check('voltagem', MIURA_SPECS.voltagem, '220V monofásico')
check('pesoKg', MIURA_SPECS.pesoKg, 120)
check('alturaCm', MIURA_SPECS.alturaCm, 120)
check('larguraCm', MIURA_SPECS.larguraCm, 70)
check('discoMaxMm', MIURA_SPECS.discoMaxMm, 500)
check('tamborMaxMm', MIURA_SPECS.tamborMaxMm, 500)
check('garantiaAnos', MIURA_SPECS.garantiaAnos, 3)
check('potenciaHp', MIURA_SPECS.potenciaHp, 0.75)
check('potenciaW', MIURA_SPECS.potenciaW, 750)

console.log('\n=== 1.3 — Ajuste da base (remove compressor / adiciona tempo de serviço) ===')
check('NÃO contém "compressor"', /compressor/i.test(KB), false)
check('contém FAQ "quanto tempo leva o serviço"', /quanto tempo leva o servi[çc]o/i.test(KB), true)
check('tempo: "30 e 60 minutos"', /30 e 60 minutos/.test(KB), true)
check('tempo: "mesmo dia"', /mesmo dia/i.test(KB), true)

console.log('\n=== 1.3 — Treinamento (incluso; online só se perguntarem) ===')
check('treinamento incluso', /incluso/i.test(KB), true)
check('online condicionado a pergunta', /perguntar\s+como.{0,30}online|online/i.test(KB), true)

console.log('\n=== 1.3 — Garantia e compatibilidade (respondem direto) ===')
check('garantia: cobertura – não mau uso', /mau uso/i.test(KB), true)
check('garantia: acionamento – entrar em contato', /acionar a garantia/i.test(KB), true)
check('compatibilidade: até 500mm sem pedir modelo/ano', /500\s*mm.{0,200}(nem precisa|sem pedir)/i.test(KB), true)
check('compatibilidade: RAM', /\bRAM\b/.test(KB), true)

console.log('\n=== 1.3 — Limites / hand-off técnico ===')
check('limites: validação de volante', /validad[ao]|validar|valida[çc][ãa]o/i.test(KB), true)
check('limites: specs fora da ficha deferidas', /NÃO esteja nesta base/i.test(KB), true)
check('frase de validação de volante presente', /verificamos a compatibilidade/i.test(KB), true)

console.log('\n=== 1.3 — Base NÃO vaza preço/condição comercial ===')
check('sem valor R$ 27.900', /27\.?900/.test(KB), false)
check('sem "R$" com número', /R\$\s*\d/.test(KB), false)
check('sem "18x"', /\b18x\b/.test(KB), false)
check('sem "1.869"', /1\.?869/.test(KB), false)

console.log('\n=== 1.3 — CARACTERIZAÇÃO: guardrails COMERCIAIS do sdr.ts intactos ===')
check('marcador [[HANDOFF]] presente', SDR_SYSTEM_PROMPT.includes('[[HANDOFF]]'), true)
check('hand-off de desconto intacto', SDR_SYSTEM_PROMPT.includes('não tenho autorização pra negociar'), true)
check('formato de PROPOSTA intacto', /Proposta Comercial/i.test(SDR_SYSTEM_PROMPT), true)
check('preço comercial intacto (R$ 27.900)', SDR_SYSTEM_PROMPT.includes('27.900'), true)
check('parcela 18x intacta', /18x/i.test(SDR_SYSTEM_PROMPT), true)
check('estado MATURANDO_DECISAO (follow-up) intacto', SDR_SYSTEM_PROMPT.includes('MATURANDO_DECISAO'), true)
check('guarda Spring (CHECK 2) intacta', SDR_SYSTEM_PROMPT.includes('CHECK 2'), true)
check('regra de boleto intacta', /BOLETO/i.test(SDR_SYSTEM_PROMPT), true)

console.log('\n=== 1.3 — CARACTERIZAÇÃO: mudança técnica aplicada no sdr.ts ===')
check('removeu "Voltagem exata, peso exato" de NÃO SABE', SDR_SYSTEM_PROMPT.includes('Voltagem exata, peso exato'), false)
check('removeu "Treinamento ONLINE incluso"', SDR_SYSTEM_PROMPT.includes('Treinamento ONLINE incluso'), false)
check('agora "Treinamento incluso no preço"', SDR_SYSTEM_PROMPT.includes('Treinamento incluso no preço'), true)
check('NÃO SABE agora defere cobertura de garantia', /Cobertura, exclus[õo]es e acionamento da garantia/.test(SDR_SYSTEM_PROMPT), true)

console.log(`\n=== RESULTADO: ${pass} passaram, ${fail} falharam ===`)
if (fail > 0) {
  console.log('\nFALHAS:')
  failures.forEach(f => console.log(' - ' + f))
  process.exit(1)
}
console.log('Todos os testes passaram ✅')
