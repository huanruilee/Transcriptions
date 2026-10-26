import {defineConfig} from '@playwright/test';
const phase=process.env.READER_SMOKE_PHASE === 'deployed' ? 'deployed' : 'artifact';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['readerRelease.spec.ts', 'ruzhong01Release.spec.ts', 'ruzhong38aRelease.spec.ts', 'ruzhong38bRelease.spec.ts', 'ruzhong39aRelease.spec.ts', 'ruzhong39bRelease.spec.ts', 'ruzhong40aRelease.spec.ts', 'ruzhong40bRelease.spec.ts', 'ruzhong41aRelease.spec.ts', 'ruzhong41bRelease.spec.ts'],
  timeout: 45000,
  expect: {timeout: 15000},
  retries: 0,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  outputDir: `test-results/${phase}`, 
  reporter: [['list'], ['json', {outputFile: `test-results/${phase}.json`}]],
  use: {
    baseURL: process.env.READER_BASE_URL || 'http://127.0.0.1:4173/Transcriptions/',
    browserName: 'chromium',
    serviceWorkers: 'allow',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    {name: 'desktop', use: {viewport: {width: 1280, height: 900}}},
    {name: 'mobile', use: {viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true}},
  ],
});
