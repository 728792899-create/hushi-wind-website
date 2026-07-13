const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')
const request = require('supertest')
const { app, prisma, stopServer } = require('../../server')

const adminCredentials = { username: 'demo_admin', password: 'DemoPass_2026!' }
let adminToken = ''
let adminCsrfToken = ''

const auth = () => ({ Authorization: `Bearer ${adminToken}`, 'X-CSRF-Token': adminCsrfToken })

beforeAll(async () => {
  const response = await request(app).post('/api/auth/login').send(adminCredentials)
  expect(response.status).toBe(200)
  adminToken = response.body.token
  adminCsrfToken = response.body.csrfToken
})

afterAll(async () => {
  await stopServer()
})

describe('health and public catalog', () => {
  it('reports database health without exposing secrets', async () => {
    const response = await request(app).get('/health')
    expect(response.status).toBe(200)
    expect(response.body.status).toBe('ok')
    expect(response.body.database.status).toBe('ok')
    expect(JSON.stringify(response.body)).not.toContain('DemoPass')
  })

  it('only returns published products to public callers', async () => {
    await prisma.product.create({
      data: {
        title: 'Hidden integration product',
        slug: 'hidden-integration-product',
        type: 'piano',
        categoryName: '测试',
        description: 'must stay private',
        status: 'draft'
      }
    })
    const response = await request(app).get('/api/products')
    expect(response.status).toBe(200)
    expect(response.body.data.some((row) => row.attributes.slug === 'hidden-integration-product')).toBe(false)
  })
})

describe('authentication and RBAC', () => {
  it('refuses demo credentials when production mode is requested', () => {
    const result = spawnSync(process.execPath, ['-e', "require('./server')"], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        ADMIN_USERNAME: 'demo_admin',
        ADMIN_PASSWORD: 'DemoPass_2026!',
        ADMIN_TOKEN_SECRET: 'production-token-secret-at-least-32-characters',
        PUBLIC_SITE_URL: 'https://www.example.com',
        PUBLIC_ADMIN_URL: 'https://admin.example.com',
        API_PUBLIC_URL: 'https://api.example.com',
        UPLOAD_PUBLIC_BASE: 'https://cdn.example.com',
        ALLOWED_ORIGINS: 'https://www.example.com,https://admin.example.com'
      }
    })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toContain('弱默认账号')
  })

  it('refuses example placeholders during production preflight', () => {
    const result = spawnSync(process.execPath, ['scripts/preflight.js'], {
      cwd: path.resolve(__dirname, '../..'),
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        DATABASE_URL: 'file:./dev.db',
        ADMIN_USERNAME: 'ops_admin',
        ADMIN_PASSWORD: 'Replace-With-A-Strong-Password-2026!',
        ADMIN_TOKEN_SECRET: 'replace-with-a-64-character-random-token-secret-before-launch',
        PUBLIC_SITE_URL: 'https://www.your-company-domain.com',
        PUBLIC_ADMIN_URL: 'https://admin.your-company-domain.com',
        API_PUBLIC_URL: 'https://api.your-company-domain.com',
        UPLOAD_PUBLIC_BASE: 'https://cdn.your-company-domain.com',
        ALLOWED_ORIGINS: 'https://www.your-company-domain.com,https://admin.your-company-domain.com'
      }
    })
    expect(result.status).not.toBe(0)
    expect(`${result.stdout}${result.stderr}`).toMatch(/placeholder/i)
  })

  it('rejects invalid credentials and returns a usable session for valid credentials', async () => {
    const invalid = await request(app).post('/api/auth/login').send({ username: 'demo_admin', password: 'wrong-password' })
    expect(invalid.status).toBe(401)
    expect(invalid.body.error.code).toBe('INVALID_CREDENTIALS')

    const session = await request(app).get('/api/auth/session').set(auth())
    expect(session.status).toBe(200)
    expect(session.body.user.permissions).toContain('*')
  })

  it('enforces write permissions for readonly users', async () => {
    const suffix = Date.now()
    const username = `readonly_${suffix}`
    const created = await request(app)
      .post('/api/admin/users')
      .set(auth())
      .send({ username, password: 'Readonly_2026!', role: 'readonly', status: 'active' })
    expect(created.status).toBe(201)

    const login = await request(app)
      .post('/api/auth/login')
      .send({ username, password: 'Readonly_2026!' })
    expect(login.status).toBe(200)

    const denied = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('X-CSRF-Token', login.body.csrfToken)
      .send({ title: 'Denied', slug: `denied-${suffix}`, type: 'piano', categoryName: '测试', description: '' })
    expect(denied.status).toBe(403)
    expect(denied.body.error.code).toBe('FORBIDDEN')
  })

  it('requires a per-session CSRF token for authenticated mutations', async () => {
    const response = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'CSRF denied', slug: `csrf-denied-${Date.now()}`, type: 'piano', categoryName: '测试', description: '' })
    expect(response.status).toBe(403)
    expect(response.body.error.code).toBe('CSRF_VALIDATION_FAILED')
  })
})

describe('product CRUD and version restore', () => {
  it('creates, updates, restores and deletes a product', async () => {
    const suffix = Date.now()
    const originalTitle = `Integration Product ${suffix}`
    const created = await request(app)
      .post('/api/products')
      .set(auth())
      .send({
        title: originalTitle,
        slug: `integration-product-${suffix}`,
        type: 'piano',
        categoryName: '测试钢琴',
        description: 'integration test',
        quantity: 2,
        price: 12345,
        status: 'published'
      })
    expect(created.status).toBe(201)

    const updated = await request(app)
      .put(`/api/products/${created.body.id}`)
      .set(auth())
      .send({ ...created.body, title: `${originalTitle} Updated` })
    expect(updated.status).toBe(200)

    const versions = await request(app).get(`/api/products/${created.body.id}/versions`).set(auth())
    expect(versions.status).toBe(200)
    const originalVersion = versions.body.data.find((row) => JSON.parse(row.snapshot).title === originalTitle)
    expect(originalVersion).toBeTruthy()

    const restored = await request(app)
      .post(`/api/products/${created.body.id}/restore/${originalVersion.id}`)
      .set(auth())
    expect(restored.status).toBe(200)
    expect(restored.body.title).toBe(originalTitle)

    const removed = await request(app).delete(`/api/products/${created.body.id}`).set(auth())
    expect(removed.status).toBe(200)
  })
})

describe('uploads, inquiries and generic CMS versions', () => {
  it('rejects unsafe uploads and accepts signature-verified PNG files', async () => {
    const rejected = await request(app)
      .post('/api/upload')
      .set(auth())
      .attach('file', Buffer.from('not allowed'), 'payload.txt')
    expect(rejected.status).toBe(400)
    expect(rejected.body.error.code).toBe('INVALID_UPLOAD_TYPE')

    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64')
    const accepted = await request(app)
      .post('/api/upload')
      .set(auth())
      .attach('file', png, 'integration.png')
    expect(accepted.status).toBe(200)
    expect(accepted.body.url).toMatch(/^\/uploads\/\d+-integration\.png$/)

    const uploaded = path.join(__dirname, '..', '..', accepted.body.url.replace(/^\//, ''))
    fs.rmSync(uploaded, { force: true })
  })

  it('accepts a guarded inquiry and exposes it only to authorized CRM readers', async () => {
    const created = await request(app).post('/api/inquiries').send({
      customerName: '测试客户',
      contactInfo: '13800138000',
      message: '希望预约试奏并获取报价',
      inquiryType: 'appointment',
      productTitle: 'DX-88',
      formStartedAt: Date.now() - 1000,
      website: ''
    })
    expect(created.status).toBe(201)

    const anonymous = await request(app).get('/api/inquiries')
    expect(anonymous.status).toBe(401)

    const list = await request(app).get('/api/inquiries?keyword=测试客户').set(auth())
    expect(list.status).toBe(200)
    expect(list.body.data.some((row) => row.id === created.body.data.id)).toBe(true)
  })

  it('publishes and restores generic CMS content', async () => {
    const suffix = Date.now()
    const created = await request(app)
      .post('/api/support-faqs')
      .set(auth())
      .send({ question: `Integration FAQ ${suffix}`, answer: 'Original answer', category: 'test', status: 'published' })
    expect(created.status).toBe(201)

    const updated = await request(app)
      .put(`/api/support-faqs/${created.body.id}`)
      .set(auth())
      .send({ ...created.body, answer: 'Updated answer' })
    expect(updated.status).toBe(200)

    const versions = await request(app).get(`/api/support-faqs/${created.body.id}/versions`).set(auth())
    const original = versions.body.data.find((row) => JSON.parse(row.snapshot).answer === 'Original answer')
    expect(original).toBeTruthy()

    const restored = await request(app)
      .post(`/api/support-faqs/${created.body.id}/restore/${original.id}`)
      .set(auth())
    expect(restored.status).toBe(200)
    expect(restored.body.answer).toBe('Original answer')

    await request(app).delete(`/api/support-faqs/${created.body.id}`).set(auth()).expect(200)
  })
})
