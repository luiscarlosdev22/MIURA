import { Request, Response } from 'express'
import { getAllLeads } from '../models/lead'
import { getHistory } from '../models/conversation'
import { logger } from '../config/logger'

export async function listLeads(_req: Request, res: Response): Promise<void> {
  try {
    const leads = await getAllLeads()
    res.json({ total: leads.length, leads })
  } catch (err) {
    logger.error('Erro ao listar leads', { error: err })
    res.status(500).json({ error: 'Erro ao buscar leads' })
  }
}

export async function getLeadHistory(req: Request, res: Response): Promise<void> {
  try {
    const { phone } = req.params
    const history = await getHistory(phone, 50)
    res.json({ phone, messages: history.length, history })
  } catch (err) {
    logger.error('Erro ao buscar historico', { error: err })
    res.status(500).json({ error: 'Erro ao buscar historico' })
  }
}
