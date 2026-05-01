import { pillStyle, muted } from '../styles';

export function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warn' }) {
  return (
    <div style={{ borderRadius: 0, padding: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ color: muted, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 12, fontWeight: 500, marginTop: 4, lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</div>
      <div style={{ marginTop: 6 }}>
        <span style={pillStyle(tone)}>{tone === 'default' ? 'stable' : tone}</span>
      </div>
    </div>
  );
}
