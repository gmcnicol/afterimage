import type { CSSProperties, PropsWithChildren } from 'react';

export function Screen({ children }: PropsWithChildren) {
  return (
    <div style={{
      height: '100%',
      minHeight: '100%',
      boxSizing: 'border-box',
      background: '#111318',
      color: '#f6f7f9',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '20px',
      overflow: 'hidden'
    }}>
      {children}
    </div>
  );
}

export function Panel(props: PropsWithChildren<{
  title: string;
  style?: CSSProperties;
  className?: string;
  bodyStyle?: CSSProperties;
  bodyClassName?: string;
}>) {
  return (
    <section
      className={props.className}
      style={{
        border: '1px solid #2b3140',
        borderRadius: 16,
        padding: 16,
        background: '#191d25',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
        ...props.style
      }}
    >
      <h2 style={{ margin: '0 0 16px' }}>{props.title}</h2>
      <div
        className={props.bodyClassName}
        style={{
          minHeight: 0,
          ...props.bodyStyle
        }}
      >
        {props.children}
      </div>
    </section>
  );
}
