import { defineConfig, devices } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEFAULT_E2E_PORT = 3000;

function parseE2ePort(rawPort: string | undefined): number {
  const trimmedPort = rawPort?.trim();
  if (!trimmedPort) return DEFAULT_E2E_PORT;

  const parsedPort = Number(trimmedPort);
  return Number.isInteger(parsedPort) && parsedPort >= 1 && parsedPort <= 65_535
    ? parsedPort
    : DEFAULT_E2E_PORT;
}

const e2ePort = parseE2ePort(process.env.PLAYWRIGHT_PORT);
const baseURL = `http://127.0.0.1:${e2ePort}`;
const e2eHome = process.env.PLAYWRIGHT_HOME?.trim() || mkdtempSync(join(tmpdir(), 'openroom-e2e-'));

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm --dir apps/webuiapps dev --host 127.0.0.1 --port ${e2ePort} --strictPort`,
    url: baseURL,
    env: {
      HOME: e2eHome,
      USERPROFILE: e2eHome,
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
