#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const days = Number.parseInt(process.env.ANALYTICS_RETENTION_DAYS || '180', 10)
const apiLogDays = Number.parseInt(process.env.API_LOG_RETENTION_DAYS || '90', 10)
const alertDays = Number.parseInt(process.env.ALERT_RETENTION_DAYS || '180', 10)

const cutoff = (retentionDays) => {
  const date = new Date()
  date.setDate(date.getDate() - Math.max(1, retentionDays))
  return date
}

const main = async () => {
  const [analytics, apiLogs, alerts] = await Promise.all([
    prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: cutoff(days) } } }),
    prisma.apiRequestLog.deleteMany({ where: { createdAt: { lt: cutoff(apiLogDays) } } }),
    prisma.alertRecord.deleteMany({ where: { createdAt: { lt: cutoff(alertDays) }, status: 'resolved' } })
  ])
  console.log(JSON.stringify({
    deletedAnalyticsEvents: analytics.count,
    deletedApiRequestLogs: apiLogs.count,
    deletedResolvedAlerts: alerts.count
  }))
}

main().finally(() => prisma.$disconnect())
