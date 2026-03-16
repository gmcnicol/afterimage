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
    borderRadius: 999,
    padding: '10px 15px',
    fontWeight: 700,
    letterSpacing: '0.01em',
    boxShadow: primary ? '0 12px 24px rgba(114, 133, 166, 0.24)' : '0 10px 22px rgba(0, 0, 0, 0.16)',
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
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 700
  };
}
