import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
const testDataDir =
  process.env.BLUEPRINT_E2E_DATA_DIR || mkdtempSync('/private/tmp/blueprint-e2e-');
process.env.BLUEPRINT_E2E_DATA_DIR = testDataDir;
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    channel: 'chrome',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm dev --port 3100',
    url: 'http://127.0.0.1:3100',
    reuseExistingServer: false,
    env: {
      BLUEPRINT_DATA_DIR: testDataDir,
      BLUEPRINT_NEXT_DIST_DIR: '.next-e2e',
      ANTHROPIC_API_KEY: '',
      ELEVENLABS_API_KEY: '',
    },
    timeout: 60000,
  },
});
