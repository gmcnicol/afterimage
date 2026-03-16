import { pillStyle, muted } from '../styles';

export function StatCard({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'success' | 'warn' }) {
  return (
    <div style={{ borderRadius: 18, padding: 12, background: 'linear-gradient(145deg, rgba(23, 28, 38, 0.98), rgba(14, 17, 24, 0.92))', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div style={{ color: muted, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, marginTop: 4, lineHeight: 1.15 }}>{value}</div>
      <div style={{ marginTop: 8 }}>
        <span style={pillStyle(tone)}>{tone === 'default' ? 'stable' : tone}</span>
      </div>
    </div>
  );
}
