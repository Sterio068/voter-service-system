import { defineConfig, devices } from '@playwright/test'

const e2eEnv = {
  ...process.env,
  NODE_ENV: 'test',
  DATA_PATH: '.tmp/e2e/data',
  BACKUPS_PATH: '.tmp/e2e/backups',
  UPLOADS_PATH: '.tmp/e2e/uploads',
  JWT_SECRET: 'e2e-jwt-secret-with-at-least-thirty-two-characters',
  VOTER_SERVICE_SETTINGS_KEY: 'e2e-settings-encryption-key',
  VOTER_SERVICE_BACKUP_SIGNING_KEY: 'e2e-backup-signing-key',
  RATE_LIMIT_MAX: '10000',
  RATE_LIMIT_WINDOW: '1 minute',
}

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  outputDir: 'test-results/playwright',
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node -e "const fs=require(\'fs\'); fs.rmSync(\'.tmp/e2e\',{recursive:true,force:true}); fs.mkdirSync(\'.tmp/e2e/data\',{recursive:true}); fs.mkdirSync(\'.tmp/e2e/backups\',{recursive:true}); fs.mkdirSync(\'.tmp/e2e/uploads\',{recursive:true});" && npx tsx server/index.ts',
      url: 'http://127.0.0.1:8080/api/health',
      env: e2eEnv,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      command: 'npx vite --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
})
