import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: [/a11y-mobile\.spec\.ts$/, /e2e.gates./] },
    // Mobil + erişilebilirlik kapısı (mobil-erisilebilirlik-i18n B13): ürünün birincil yüzeyi
    // telefon. Pixel 7 (Chromium) ve iPhone 13 ölçüleri (WebKit kurulu değilse Chromium motoruyla
    // aynı viewport/dokunma/DPR) — axe taraması + yatay taşma + dokunma hedefi kontrolleri.
    { name: 'mobile-android', use: { ...devices['Pixel 7'] }, testMatch: /(a11y-mobile|smoke)\.spec\.ts$/ },
    {
      name: 'mobile-iphone',
      use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' },
      testMatch: /a11y-mobile\.spec\.ts$/,
    },
    // Kalite kapısı paketi (scripts/quality-gates.mjs): rol girişleri → birincil rotalar (+ axe/taşma/
    // dokunma/kontrast ölçümü) ve E2E_WRITE=1 ile DB yazan kritik akışlar. Telefon ölçüsünde koşar.
    { name: 'gates-setup', use: { ...devices['Pixel 7'] }, testMatch: /gates.auth\.setup\.ts$/ },
    {
      name: 'gates',
      use: { ...devices['Pixel 7'] },
      testMatch: /gates.(routes|flows)\.spec\.ts$/,
      dependencies: ['gates-setup'],
    },
  ],
  // PLAYWRIGHT_BASE_URL verildiyse (kalite kapısı: üretim derlemesi 3100) sunucuyu çağıran yönetir;
  // aksi hâlde 3000 ayakta olduğu sürece dev sunucusu gereksiz yere beklenir/başlatılır.
  webServer: process.env.CI || process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
      },
});
