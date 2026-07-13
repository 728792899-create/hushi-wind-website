import * as Sentry from '@sentry/nuxt'

if (process.env.NUXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NUXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NUXT_PUBLIC_SENTRY_ENVIRONMENT || process.env.NODE_ENV,
    release: process.env.NUXT_PUBLIC_SENTRY_RELEASE || undefined,
    tracesSampleRate: Number(process.env.NUXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || 0.05),
    sendDefaultPii: false,
    beforeSend(event) {
      delete event.user
      if (event.request) {
        delete event.request.cookies
        delete event.request.data
        delete event.request.headers
      }
      return event
    }
  })
}
