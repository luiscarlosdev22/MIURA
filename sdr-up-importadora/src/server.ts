import app from './app'
import { env } from './config/env'
import { logger } from './config/logger'
import { connectDatabase } from './config/database'
import { runMigrations } from './models/lead'
import { startFollowupJob } from './services/followupJob'

async function start(): Promise<void> {
  try {
    await connectDatabase()
    try {
      await runMigrations()
      logger.info('Tabelas verificadas/criadas com sucesso')
    } catch (migrationError) {
      logger.error('Falha ao executar migrations', { error: migrationError })
      throw migrationError
    }

    const server = app.listen(env.port, () => {
      logger.info(`SDR UP Importadora rodando`, {
        port: env.port,
        env: env.nodeEnv,
        webhook: `http://localhost:${env.port}/webhook`,
        health: `http://localhost:${env.port}/health`,
      })
    })

    startFollowupJob()

    process.on('SIGTERM', () => {
      logger.info('SIGTERM recebido. Encerrando graciosamente...')
      server.close(() => {
        logger.info('Servidor encerrado.')
        process.exit(0)
      })
    })
  } catch (error) {
    logger.error('Falha ao iniciar servidor', {
      message: (error as Error)?.message,
      code: (error as any)?.code,
      stack: (error as Error)?.stack,
    })
    process.exit(1)
  }
}

start()
