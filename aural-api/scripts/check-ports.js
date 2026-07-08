#!/usr/bin/env node

const http = require('http')

const checks = [
  {
    name: 'api',
    url: process.env.API_HEALTH_URL || 'http://127.0.0.1:1337/health',
    expectedBody: 'hushi-api'
  },
  {
    name: 'web',
    url: process.env.WEB_HEALTH_URL || 'http://127.0.0.1:3000/',
    expectedBody: '<!DOCTYPE html'
  }
]

const request = (check) => new Promise((resolve) => {
  const req = http.get(check.url, { timeout: 5000 }, (res) => {
    let body = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => {
      body += chunk
      if (body.length > 1000) req.destroy()
    })
    res.on('end', () => {
      resolve({
        ...check,
        ok: res.statusCode >= 200 && res.statusCode < 400 && body.includes(check.expectedBody),
        statusCode: res.statusCode,
        body: body.slice(0, 160).replace(/\s+/g, ' ')
      })
    })
  })
  req.on('timeout', () => {
    req.destroy()
    resolve({ ...check, ok: false, error: 'timeout' })
  })
  req.on('error', (error) => {
    resolve({ ...check, ok: false, error: error.message })
  })
})

;(async () => {
  const results = await Promise.all(checks.map(request))
  results.forEach((item) => {
    console.log(`${item.ok ? 'OK' : 'FAIL'} ${item.name} ${item.url} ${item.statusCode || ''} ${item.error || ''}`)
  })
  if (results.some((item) => !item.ok)) process.exit(1)
})()
