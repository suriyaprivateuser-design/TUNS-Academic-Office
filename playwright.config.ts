import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-End Test (Playwright)
 *
 * ค่าเริ่มต้น: build แล้วเปิด production server บนพอร์ตแยก โดยใช้ที่เก็บข้อมูล local (Demo Data เท่านั้น)
 * ในโฟลเดอร์ .data/e2e ที่ล้างใหม่ทุกครั้ง — ไม่แตะ Google Workspace และไม่ใช้ข้อมูลจริงของโรงเรียน
 *
 * ระหว่างพัฒนา ชี้ไปยังเซิร์ฟเวอร์ที่เปิดอยู่แล้วได้ด้วย E2E_BASE_URL=http://localhost:3000
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const externalBaseUrl = process.env.E2E_BASE_URL;
const baseURL = externalBaseUrl ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  // ทุกการทดสอบใช้ฐานข้อมูลชุดเดียวกัน จึงรันเรียงลำดับด้วย worker เดียว
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL,
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts$/ },
  ],
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `node -e "require('node:fs').rmSync('.data/e2e',{recursive:true,force:true})" && npm run build && npm run start -- -p ${PORT}`,
        url: `${baseURL}/login`,
        timeout: 420_000,
        reuseExistingServer: false,
        env: {
          DATA_DRIVER: 'local',
          LOCAL_DATA_DIR: '.data/e2e',
          DEMO_LOGIN: 'enabled',
          AUTH_TRUST_HOST: 'true',
          // ใช้กับการทดสอบเท่านั้น ไม่ใช่ secret ของระบบใด
          AUTH_SECRET: 'e2e-only-secret-0123456789abcdef0123456789abcdef',
          APP_URL: baseURL,
        },
      },
});
