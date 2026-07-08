import { createConsola } from 'consola'

const logger = createConsola({
  level: process.env.LOG_LEVEL ? parseInt(process.env.LOG_LEVEL) : 3,
  formatOptions: {
    date: true,
    colors: true
  }
})

export default defineEventHandler((event) => {
  const startTime = Date.now()
  const { method, path } = event

  event.context.logger = logger

  event.node.res.on('finish', () => {
    const duration = Date.now() - startTime
    const statusCode = event.node.res.statusCode

    const logData = {
      method,
      path,
      statusCode,
      duration: `${duration}ms`,
      ip: getRequestIP(event, { xForwardedFor: true })
    }

    if (statusCode >= 500) {
      logger.error('Server error', logData)
    } else if (statusCode >= 400) {
      logger.warn('Client error', logData)
    } else {
      logger.info('Request', logData)
    }
  })
})
