import type { CSSProperties } from 'react';

export const accent = '#88a0bf';
export const muted = '#99a5b7';

export function buttonStyle(primary = false): CSSProperties {
  return {
    border: primary ? '1px solid rgba(136, 160, 191, 0.9)' : '1px solid rgba(255,255,255,0.12)',
    background: primary
      ? 'linear-gradient(135deg, #9db1ca, #7285a6)'
      : 'linear-gradient(180deg, rgba(28, 33, 44, 0.96), rgba(19, 22, 30, 0.96))',
    color: primary ? '#0d1118' : '#f6f7f9',
    borderRadius: 0,
    height: 28,
    padding: '0 10px',
    boxSizing: 'border-box',
    maxWidth: '100%',
    whiteSpace: 'nowrap',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    fontSize: 12,
    fontWeight: 500,
    letterSpacing: '0.01em',
    boxShadow: 'none',
    cursor: 'pointer',
    transition: 'transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease, background 120ms ease'
  };
}

export function pillStyle(tone: 'default' | 'success' | 'warn' = 'default'): CSSProperties {
  const map = {
    default: { background: 'rgba(255,255,255,0.08)', color: '#f5f6f8' },
    success: { background: 'rgba(103, 177, 145, 0.18)', color: '#9fe1c1' },
    warn: { background: 'rgba(166, 144, 210, 0.18)', color: '#ccbdf0' }
  };

  return {
    ...map[tone],
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 0,
    padding: '3px 8px',
    fontSize: 10,
    fontWeight: 500,
    lineHeight: 1
  };
}
