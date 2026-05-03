import type { CSSProperties, PropsWithChildren } from 'react';

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
    warn: '#ccbdf0'
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
