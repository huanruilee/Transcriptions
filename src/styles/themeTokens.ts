export type ThemeId = 'parchment' | 'zen-dark' | 'sepia';

export interface ThemeTokens {
  '--bg-color': string;
  '--sidebar-bg': string;
  '--text-main': string;
  '--text-muted': string;
  '--primary-color': string;
  '--accent-color': string;
  '--highlight-bg': string;
  '--highlight-border': string;
  '--border-color': string;
}

export const THEMES: Record<ThemeId, ThemeTokens> = {
  parchment: {
    '--bg-color': '#FAF8F5',
    '--sidebar-bg': '#F2ECE1',
    '--text-main': '#2B2623',
    '--text-muted': '#6B635B',
    '--primary-color': '#7C2D12',
    '--accent-color': '#B45309',
    '--highlight-bg': 'rgba(180, 83, 9, 0.08)',
    '--highlight-border': '#D97706',
    '--border-color': '#E6DED2',
  },
  'zen-dark': {
    '--bg-color': '#191817',
    '--sidebar-bg': '#121110',
    '--text-main': '#E6E1D8',
    '--text-muted': '#968F85',
    '--primary-color': '#9A3412',
    '--accent-color': '#F59E0B',
    '--highlight-bg': 'rgba(245, 158, 11, 0.14)',
    '--highlight-border': '#F59E0B',
    '--border-color': '#36332E',
  },
  sepia: {
    '--bg-color': '#F3EBD9',
    '--sidebar-bg': '#E7DCB8',
    '--text-main': '#3D3022',
    '--text-muted': '#756653',
    '--primary-color': '#7C2D12',
    '--accent-color': '#9A3412',
    '--highlight-bg': 'rgba(154, 52, 18, 0.10)',
    '--highlight-border': '#9A3412',
    '--border-color': '#DACFB6',
  },
};

export function getThemeTokens(themeId: ThemeId): ThemeTokens {
  return THEMES[themeId] || THEMES.parchment;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function getLuminance([r, g, b]: [number, number, number]): number {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * 依據 W3C WCAG 2.1 規範計算兩顏色之相對對比度比率 (1:1 ~ 21:1)
 */
export function calculateContrastRatio(hexColor1: string, hexColor2: string): number {
  const lum1 = getLuminance(hexToRgb(hexColor1));
  const lum2 = getLuminance(hexToRgb(hexColor2));
  const brightest = Math.max(lum1, lum2);
  const darkest = Math.min(lum1, lum2);
  return (brightest + 0.05) / (darkest + 0.05);
}
