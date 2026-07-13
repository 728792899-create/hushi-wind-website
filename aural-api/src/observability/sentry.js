const Sentry = require('@sentry/node')

const enabled = Boolean(process.env.SENTRY_DSN)

if (enabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || undefined,
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.05),
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.user
      if (event.request) {
        delete event.request.cookies
        delete event.request.data
        delete event.request.headers
        delete event.request.query_string
      }
      return event
    }
  })
}

const setupExpressErrorHandler = (app) => {
  if (enabled) Sentry.setupExpressErrorHandler(app)
}

module.exports = {
  captureException: (error, context) => enabled && Sentry.captureException(error, context),
  enabled,
  setupExpressErrorHandler
}
