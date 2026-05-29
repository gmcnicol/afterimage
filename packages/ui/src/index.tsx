import type { CSSProperties, InputHTMLAttributes, PropsWithChildren, ReactNode } from 'react';

export const studioTheme = {
  colors: {
    pageBackground: '#111318',
    shellBackground: '#090b10',
    shellBackgroundAlt: '#0c0f14',
    surfaceBackground: 'linear-gradient(180deg, rgba(20, 24, 32, 0.96), rgba(14, 17, 24, 0.96))',
    surfaceBorder: 'rgba(255,255,255,0.08)',
    text: '#f6f7f9',
    muted: '#99a5b7',
    accent: '#88a0bf',
    success: '#9fe1c1',
    warn: '#ccbdf0',
    danger: '#f0a6ad'
  },
  radii: {
    xs: 0,
    sm: 0,
    md: 0,
    lg: 0,
    xl: 0,
    xxl: 0,
    xxxl: 0
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 14,
    xl: 16,
    xxl: 18
  },
  typography: {
    fontFamily: 'Inter, system-ui, sans-serif',
    bodyWeight: 400,
    mediumWeight: 500,
    strongWeight: 500,
    heroWeight: 600,
    monoWeight: 500
  }
} as const;

export type StudioTone = 'default' | 'success' | 'warn' | 'danger';
export type PrimitiveSemanticValue =
  | 'pressure'
  | 'entropy'
  | 'cohesion'
  | 'memory'
  | 'emergence'
  | 'archive-affinity';
export type CaptureTrustState = 'trusted' | 'watch' | 'blocked' | 'uncaptured';

const primitiveLabels: Record<PrimitiveSemanticValue, string> = {
  pressure: 'Pressure',
  entropy: 'Entropy',
  cohesion: 'Cohesion',
  memory: 'Memory',
  emergence: 'Emergence',
  'archive-affinity': 'Archive affinity'
};

const primitiveTones: Record<PrimitiveSemanticValue, StudioTone> = {
  pressure: 'warn',
  entropy: 'warn',
  cohesion: 'success',
  memory: 'default',
  emergence: 'default',
  'archive-affinity': 'success'
};

const toneStyles: Record<StudioTone, { background: string; border: string; color: string }> = {
  default: {
    background: 'rgba(255,255,255,0.07)',
    border: 'rgba(255,255,255,0.1)',
    color: studioTheme.colors.text
  },
  success: {
    background: 'rgba(103, 177, 145, 0.16)',
    border: 'rgba(159, 225, 193, 0.32)',
    color: studioTheme.colors.success
  },
  warn: {
    background: 'rgba(166, 144, 210, 0.17)',
    border: 'rgba(204, 189, 240, 0.34)',
    color: studioTheme.colors.warn
  },
  danger: {
    background: 'rgba(199, 82, 96, 0.17)',
    border: 'rgba(240, 166, 173, 0.34)',
    color: studioTheme.colors.danger
  }
};

export function getPrimitiveControlTone(value: PrimitiveSemanticValue): StudioTone {
  return primitiveTones[value];
}

export function getCaptureTrustTone(state: CaptureTrustState): StudioTone {
  if (state === 'trusted') {
    return 'success';
  }
  if (state === 'blocked') {
    return 'danger';
  }
  if (state === 'watch') {
    return 'warn';
  }
  return 'default';
}

function formatUnitPercent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function primitiveControlStyle(disabled = false): CSSProperties {
  return {
    display: 'grid',
    gridTemplateRows: '14px 26px',
    gap: 4,
    width: '100%',
    minWidth: 0,
    minHeight: 44,
    opacity: disabled ? 0.48 : 1
  };
}

export function PrimitiveScalarControl(props: {
  valueKind: PrimitiveSemanticValue;
  value: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  inputProps?: Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange' | 'disabled' | 'min' | 'max' | 'step'>;
}) {
  const min = props.min ?? 0;
  const max = props.max ?? 1;
  const step = props.step ?? 0.05;
  const label = primitiveLabels[props.valueKind];
  const tone = toneStyles[getPrimitiveControlTone(props.valueKind)];
  const value = Number.isFinite(props.value) ? props.value : min;

  return (
    <label style={primitiveControlStyle(props.disabled)}>
      <span style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) 42px',
        gap: 8,
        alignItems: 'center',
        color: studioTheme.colors.muted,
        fontSize: 10,
        lineHeight: 1,
        textTransform: 'uppercase',
        letterSpacing: 0
      }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ color: tone.color, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{formatUnitPercent(value)}</span>
      </span>
      <input
        {...props.inputProps}
        aria-label={props.inputProps?.['aria-label'] ?? label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={props.disabled}
        onChange={(event) => props.onChange?.(Number(event.currentTarget.value))}
        style={{
          width: '100%',
          minWidth: 0,
          height: 26,
          margin: 0,
          accentColor: tone.color,
          cursor: props.disabled ? 'not-allowed' : 'pointer',
          ...props.inputProps?.style
        }}
      />
    </label>
  );
}

export function StudioChip(props: {
  children: ReactNode;
  tone?: StudioTone;
  title?: string;
  style?: CSSProperties;
}) {
  const tone = toneStyles[props.tone ?? 'default'];

  return (
    <span
      title={props.title}
      style={{
        ...tone,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 0,
        minHeight: 24,
        border: `1px solid ${tone.border}`,
        borderRadius: studioTheme.radii.sm,
        padding: '0 8px',
        boxSizing: 'border-box',
        fontSize: 10,
        fontWeight: studioTheme.typography.mediumWeight,
        lineHeight: 1,
        letterSpacing: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        ...props.style
      }}
    >
      {props.children}
    </span>
  );
}

export function CaptureTrustChip(props: { state: CaptureTrustState; label?: string }) {
  const label = props.label ?? (props.state === 'uncaptured' ? 'uncaptured' : props.state);
  return <StudioChip tone={getCaptureTrustTone(props.state)}>{label}</StudioChip>;
}

export function WarningChip(props: { children: ReactNode; blocking?: boolean }) {
  return <StudioChip tone={props.blocking ? 'danger' : 'warn'}>{props.children}</StudioChip>;
}

export function CapabilityBadge(props: { children: ReactNode; available?: boolean }) {
  return <StudioChip tone={props.available === false ? 'warn' : 'success'}>{props.children}</StudioChip>;
}

export function Screen({ children }: PropsWithChildren) {
  return (
    <div style={{
      height: '100%',
      minHeight: '100%',
      boxSizing: 'border-box',
      background: studioTheme.colors.pageBackground,
      color: studioTheme.colors.text,
      fontFamily: studioTheme.typography.fontFamily,
      fontSize: 12,
      lineHeight: 1.2,
      padding: '20px',
      overflow: 'hidden'
    }}>
      {children}
    </div>
  );
}

export function Panel(props: PropsWithChildren<{
  title?: string;
  style?: CSSProperties;
  className?: string;
  bodyStyle?: CSSProperties;
  bodyClassName?: string;
}>) {
  return (
    <section
      className={props.className}
      style={{
        border: `1px solid ${studioTheme.colors.surfaceBorder}`,
        borderRadius: studioTheme.radii.xl,
        padding: 12,
        background: studioTheme.colors.surfaceBackground,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        ...props.style
      }}
    >
      {props.title ? <h2 style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.15, fontWeight: studioTheme.typography.strongWeight }}>{props.title}</h2> : null}
      <div
        className={props.bodyClassName}
        style={{
          minWidth: 0,
          minHeight: 0,
          flex: 1,
          overflow: 'hidden',
          ...props.bodyStyle
        }}
      >
        {props.children}
      </div>
    </section>
  );
}
