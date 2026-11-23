import {defineConfig} from '@playwright/test';
const phase=process.env.READER_SMOKE_PHASE === 'deployed' ? 'deployed' : 'artifact';
export default defineConfig({
  testDir: './tests/browser',
  testMatch: ['readerRelease.spec.ts', 'ruzhong01Release.spec.ts', 'ruzhong38aRelease.spec.ts', 'ruzhong38bRelease.spec.ts', 'ruzhong39aRelease.spec.ts', 'ruzhong39bRelease.spec.ts', 'ruzhong40aRelease.spec.ts', 'ruzhong40bRelease.spec.ts', 'ruzhong41aRelease.spec.ts', 'ruzhong41bRelease.spec.ts', 'ruzhong42aRelease.spec.ts', 'ruzhong42bRelease.spec.ts', 'ruzhong43aRelease.spec.ts', 'ruzhong43bRelease.spec.ts', 'ruzhong44aRelease.spec.ts', 'ruzhong44bRelease.spec.ts', 'ruzhong45aRelease.spec.ts', 'ruzhong45bRelease.spec.ts', 'ruzhong46aRelease.spec.ts', 'ruzhong46bRelease.spec.ts', 'ruzhong47aRelease.spec.ts', 'ruzhong47bRelease.spec.ts', 'ruzhong48aRelease.spec.ts', 'ruzhong48bRelease.spec.ts', 'ruzhong49aRelease.spec.ts', 'ruzhong49bRelease.spec.ts', 'ruzhong50aRelease.spec.ts', 'ruzhong50bRelease.spec.ts', 'ruzhong51aRelease.spec.ts', 'ruzhong51bRelease.spec.ts', 'ruzhong52aRelease.spec.ts', 'ruzhong52bRelease.spec.ts', 'ruzhong53aRelease.spec.ts', 'ruzhong53bRelease.spec.ts', 'ruzhong54aRelease.spec.ts', 'ruzhong54bRelease.spec.ts', 'ruzhong55aRelease.spec.ts', 'ruzhong55bRelease.spec.ts', 'ruzhong56aRelease.spec.ts', 'ruzhong56bRelease.spec.ts', 'ruzhong57aRelease.spec.ts', 'ruzhong57bRelease.spec.ts', 'ruzhong58aRelease.spec.ts', 'ruzhong58bRelease.spec.ts', 'ruzhong59aRelease.spec.ts', 'ruzhong59bRelease.spec.ts'],
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
