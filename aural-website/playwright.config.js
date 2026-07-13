import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3300',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] }, grepInvert: /@responsive/ },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] }, grep: /@responsive/ }
  ],
  webServer: [
    {
      command: 'npm --prefix ../aural-api start',
      url: 'http://127.0.0.1:1437/api/health',
      env: {
        NODE_ENV: 'test',
        DATABASE_URL: 'file:./dev.db',
        PORT: '1437',
        ADMIN_USERNAME: 'demo_admin',
        ADMIN_PASSWORD: 'DemoPass_2026!',
        ADMIN_TOKEN_SECRET: 'hushi-e2e-token-secret-2026',
        PUBLIC_SITE_URL: 'http://127.0.0.1:3300',
        PUBLIC_ADMIN_URL: 'http://127.0.0.1:5335',
        API_PUBLIC_URL: 'http://127.0.0.1:1437',
        UPLOAD_PUBLIC_BASE: 'http://127.0.0.1:1437/uploads',
        ALLOWED_ORIGINS: 'http://127.0.0.1:3300,http://127.0.0.1:5335'
      },
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe'
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 3300',
      url: 'http://127.0.0.1:3300',
      env: {
        NUXT_PUBLIC_API_BASE: 'http://127.0.0.1:1437',
        NUXT_API_INTERNAL_BASE: 'http://127.0.0.1:1437',
        NUXT_PUBLIC_SITE_URL: 'http://127.0.0.1:3300',
        NUXT_PUBLIC_BRAND_IMAGE_BASE: 'http://127.0.0.1:1437/uploads/real-assets',
        NUXT_DEVTOOLS: 'false'
      },
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe'
    },
    {
      command: 'npm --prefix ../aural-admin run dev -- --host 127.0.0.1 --port 5335',
      url: 'http://127.0.0.1:5335',
      env: {
        VITE_API_BASE: 'http://127.0.0.1:1437',
        VITE_SITE_URL: 'http://127.0.0.1:3300'
      },
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe'
    }
  ]
})
