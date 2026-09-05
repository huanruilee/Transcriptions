import { describe, it, expect } from 'vitest';
import { THEMES, getThemeTokens, calculateContrastRatio } from '../../src/styles/themeTokens';

describe('DesignTokens & Accessibility Test Pattern (TDD)', () => {
  it('三大主題應完整具備所有核心設計變數 (Design Tokens)', () => {
    const requiredKeys = [
      '--bg-color',
      '--sidebar-bg',
      '--text-main',
      '--text-muted',
      '--primary-color',
      '--accent-color',
      '--highlight-bg',
      '--border-color',
    ];

    ['parchment', 'zen-dark', 'sepia'].forEach((themeId) => {
      const tokens = getThemeTokens(themeId as any);
      expect(tokens).toBeDefined();
      requiredKeys.forEach((key) => {
        expect(tokens[key], `主題 ${themeId} 缺少變數 ${key}`).toBeTruthy();
      });
    });
  });

  it('預設主題【紙墨雅緻】應使用溫暖米紙底色與柔和沉金高光', () => {
    const parchment = getThemeTokens('parchment');
    expect(parchment['--bg-color'].toUpperCase()).toBe('#FAF8F5');
    // 嚴格禁止刺眼螢光黃 #fef08a
    expect(parchment['--highlight-bg']).not.toContain('#fef08a');
    expect(parchment['--highlight-bg']).toContain('180, 83, 9'); // 沉金光暈
  });

  it('三大主題之內文主色與背景色對比度皆應達 WCAG AAA 級標準 (>= 7:1)', () => {
    // 【紙墨雅緻】
    const parchmentContrast = calculateContrastRatio('#2B2623', '#FAF8F5');
    expect(parchmentContrast).toBeGreaterThanOrEqual(10.0);

    // 【靜慮夜讀】
    const zenDarkContrast = calculateContrastRatio('#E6E1D8', '#191817');
    expect(zenDarkContrast).toBeGreaterThanOrEqual(10.0);

    // 【貝葉古卷】
    const sepiaContrast = calculateContrastRatio('#3D3022', '#F3EBD9');
    expect(sepiaContrast).toBeGreaterThanOrEqual(7.0);
  });
});
