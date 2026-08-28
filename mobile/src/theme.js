// Theme — visual parity with the desktop app (desktop/src/index.css).
// The desktop theme is an "aurora glass" design on an indigo canvas; these
// constants mirror its CSS variables so both apps look like one product.
// Android-native behaviors (Material ripples, elevation, edge-to-edge) are
// layered on top — native UX, familiar skin.

export const CANVAS = {
  light: ['#EEF2FF', '#E0E7FF'],
  dark: ['#0B0D12', '#11141C']
}

// Aurora blobs: radial-gradient(circle at x% y%, COLOR 0%, transparent 50%)
export const AURORA = {
  light: [
    { color: 'rgba(59,130,246,0.18)', top: '18%', left: '-20%' },
    { color: 'rgba(168,85,247,0.16)', top: '55%', left: '60%' },
    { color: 'rgba(34,197,94,0.14)', top: '72%', left: '10%' }
  ],
  dark: [
    { color: 'rgba(59,130,246,0.22)', top: '18%', left: '-20%' },
    { color: 'rgba(168,85,247,0.20)', top: '55%', left: '60%' },
    { color: 'rgba(34,197,94,0.16)', top: '72%', left: '10%' }
  ]
}

export const LIGHT = {
  dark: false,
  bgPrimary: '#ffffff',
  bgSecondary: '#f5f5f5',
  bgTertiary: '#e8e8e8',
  textPrimary: '#1a1a1a',
  textSecondary: '#666666',
  textMuted: '#999999',
  border: '#e0e0e0',
  glassBg: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(255,255,255,0.6)',
  rowFill: 'rgba(15,23,42,0.04)',
  rowFillSelected: 'rgba(15,23,42,0.10)',
  ripple: 'rgba(15,23,42,0.12)',
  scrim: 'rgba(15,23,42,0.45)',
  shadow: '#0f172a'
}

export const DARK = {
  dark: true,
  bgPrimary: '#1a1a1a',
  bgSecondary: '#2a2a2a',
  bgTertiary: '#3a3a3a',
  textPrimary: '#f0f0f0',
  textSecondary: '#b0b0b0',
  textMuted: '#707070',
  border: '#3a3a3a',
  glassBg: 'rgba(17,20,28,0.88)',
  glassBorder: 'rgba(255,255,255,0.08)',
  rowFill: 'rgba(255,255,255,0.04)',
  rowFillSelected: 'rgba(255,255,255,0.10)',
  ripple: 'rgba(255,255,255,0.10)',
  scrim: 'rgba(0,0,0,0.60)',
  shadow: '#000000'
}

// Shared accents (theme-independent, same values as desktop)
export const ACCENTS = {
  flowState: '#8b5cf6', // settings.flowStateColor default — working-on highlight
  danger: '#dc2626',
  success: '#4ade80',
  warning: '#fbbf24'
}

// Desktop component CSS is scaled 1:1 (px) — RN density-independent pixels
// match CSS px on Android, so radii/paddings transfer directly.
export const RADIUS = { sm: 6, md: 8, lg: 12, xl: 20, fab: 16, sheet: 28 }

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 }

export function buildTheme(preference, systemScheme) {
  // preference: 'system' | 'light' | 'dark' (settings.theme; default 'system')
  const resolved =
    preference === 'light' || preference === 'dark'
      ? preference
      : (systemScheme === 'dark' ? 'dark' : 'light')
  const base = resolved === 'dark' ? DARK : LIGHT
  return { ...base, resolved, canvas: CANVAS[resolved], aurora: AURORA[resolved] }
}
