import { Router } from 'express'
import { listLeads, getLeadHistory } from '../controllers/leadsController'

const router = Router()
router.get('/', listLeads)
router.get('/:phone/history', getLeadHistory)
export default router
