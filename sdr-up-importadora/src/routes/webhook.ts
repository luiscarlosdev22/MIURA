import { Router } from 'express'
import {
  verifyWebhook,
  receiveWebhook,
  receiveEvolutionWebhook,
} from '../controllers/webhookController'

const router = Router()
router.get('/', verifyWebhook)
router.post('/', receiveWebhook)
router.post('/evolution', receiveEvolutionWebhook)
export default router
