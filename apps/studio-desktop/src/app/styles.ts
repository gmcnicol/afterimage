import type { CSSProperties } from 'react';

export const accent = '#f48762';
export const muted = '#a6adbb';

export function buttonStyle(primary = false): CSSProperties {
  return {
    border: primary ? '1px solid #ff9f7f' : '1px solid #41495b',
    background: primary ? 'linear-gradient(135deg, #ff9f7f, #f48762)' : 'rgba(22, 25, 34, 0.92)',
    color: primary ? '#130f12' : '#f6f7f9',
    borderRadius: 999,
    padding: '9px 14px',
    fontWeight: 700,
    cursor: 'pointer'
  };
}

export function pillStyle(tone: 'default' | 'success' | 'warn' = 'default'): CSSProperties {
  const map = {
    default: { background: 'rgba(255,255,255,0.08)', color: '#f5f6f8' },
    success: { background: 'rgba(67, 201, 142, 0.15)', color: '#86f2be' },
    warn: { background: 'rgba(255, 187, 92, 0.15)', color: '#ffd18a' }
  };

  return {
    ...map[tone],
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 700
  };
}
