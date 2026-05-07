import OpenAI from 'openai'
import { env } from '../config/env'
import { logger } from '../config/logger'
import { SDR_SYSTEM_PROMPT } from '../prompts/sdr'

const openai = new OpenAI({ apiKey: env.openai.apiKey })

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export async function generateSDRResponse(
  history: ChatMessage[],
  newMessage: string
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SDR_SYSTEM_PROMPT },
    ...history.slice(-10),
    { role: 'user', content: newMessage },
  ]

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 200,
    temperature: 0.7,
  })

  const reply = completion.choices[0]?.message?.content
  if (!reply) throw new Error('GPT nao retornou resposta')

  logger.debug('GPT respondeu', {
    tokens: completion.usage?.total_tokens,
    cost: `~$${((completion.usage?.total_tokens ?? 0) * 0.0000006).toFixed(6)}`,
  })

  return reply.trim()
}

export async function classifyLead(history: ChatMessage[]): Promise<'QUENTE' | 'MORNO' | 'FRIO'> {
  if (history.length < 4) return 'FRIO'

  const conversationText = history
    .slice(-8)
    .map(m => `${m.role === 'user' ? 'Lead' : 'SDR'}: ${m.content}`)
    .join('\n')

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Analise a conversa e classifique o lead em apenas uma palavra:\nQUENTE (quer comprar, urgencia, pediu preco, decide sozinho)\nMORNO (interesse mas sem prazo, pesquisando)\nFRIO (curioso, sem verba, sem perfil)\n\nConversa:\n${conversationText}\n\nResponda APENAS: QUENTE, MORNO ou FRIO`,
      },
    ],
    max_tokens: 10,
    temperature: 0,
  })

  const result = completion.choices[0]?.message?.content?.trim().toUpperCase()
  if (result === 'QUENTE' || result === 'MORNO' || result === 'FRIO') return result
  return 'MORNO'
}
