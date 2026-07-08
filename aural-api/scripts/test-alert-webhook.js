#!/usr/bin/env node

const { PrismaClient } = require('@prisma/client')
const { loadEnvFile } = require('./load-env')

loadEnvFile()

const prisma = new PrismaClient()
const webhookUrl = process.env.ALERT_WEBHOOK_URL || ''
const provider = String(process.env.ALERT_WEBHOOK_PROVIDER || 'generic').toLowerCase()
const level = process.env.TEST_ALERT_LEVEL || 'warning'
const type = process.env.TEST_ALERT_TYPE || 'manual_test'
const title = process.env.TEST_ALERT_TITLE || '报警通知通道测试'
const message = process.env.TEST_ALERT_MESSAGE || '这是一条由胡氏管乐后台发送的测试报警，用于确认通知通道可用。'

const safeJson = (value) => {
  try { return JSON.stringify(value ?? null).slice(0, 8000) } catch { return null }
}

const levelLabel = (value) => ({
  critical: '严重',
  error: '错误',
  warning: '警告',
  info: '提醒'
}[value] || value || '提醒')

const plainText = (payload) => [
  `[胡氏管乐] ${levelLabel(payload.level)}报警`,
  `标题：${payload.title}`,
  `类型：${payload.type}`,
  `说明：${payload.message}`,
  payload.alertId ? `报警ID：${payload.alertId}` : '',
  `时间：${new Date().toLocaleString('zh-CN', { hour12: false })}`
].filter(Boolean).join('\n')

const buildPayload = (payload) => {
  const text = plainText(payload)
  if (['wechat', 'wecom', 'qywx'].includes(provider)) return { msgtype: 'text', text: { content: text } }
  if (provider === 'dingtalk') return { msgtype: 'text', text: { content: text } }
  if (['feishu', 'lark'].includes(provider)) return { msg_type: 'text', content: { text } }
  return { ...payload, text, sentAt: new Date().toISOString() }
}

const sendWebhook = async (payload) => {
  if (!webhookUrl) {
    console.log('WARN ALERT_WEBHOOK_URL is empty; only database alert record will be created.')
    return
  }
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildPayload(payload))
  })
  const body = await response.text().catch(() => '')
  if (!response.ok) throw new Error(`Webhook returned ${response.status}: ${body.slice(0, 300)}`)
  console.log(`OK webhook sent provider=${provider} status=${response.status}`)
  if (body) console.log(body.slice(0, 500))
}

;(async () => {
  const metadata = {
    provider,
    source: 'npm run alert:test',
    host: require('os').hostname()
  }
  const record = await prisma.alertRecord.create({
    data: {
      level,
      type,
      title,
      message,
      metadata: safeJson(metadata)
    }
  })
  console.log(`OK alert record created id=${record.id}`)
  await sendWebhook({ level, type, title, message, metadata, alertId: record.id })
  await prisma.$disconnect()
})().catch(async (error) => {
  console.error(`FAIL alert test failed: ${error.message}`)
  await prisma.$disconnect()
  process.exit(1)
})
