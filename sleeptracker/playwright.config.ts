import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:8100',
    viewport: { width: 390, height: 844 },
    launchOptions: existsSync(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    )
      ? {
          executablePath:
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        }
      : {},
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm start -- --host 127.0.0.1 --port 8100',
    url: 'http://127.0.0.1:8100',
    reuseExistingServer: true,
  },
});
