import * as Sentry from '@sentry/vue'

export const initAdminSentry = (app) => {
  const dsn = import.meta.env.VITE_SENTRY_DSN
  if (!dsn) return false
  Sentry.init({
    app,
    dsn,
    environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE,
    release: import.meta.env.VITE_SENTRY_RELEASE || undefined,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0.05),
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
  return true
}
