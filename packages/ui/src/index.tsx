import type { PropsWithChildren } from 'react';

export function Screen({ children }: PropsWithChildren) {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#111318',
      color: '#f6f7f9',
      fontFamily: 'Inter, system-ui, sans-serif',
      padding: '24px'
    }}>
      {children}
    </div>
  );
}

export function Panel(props: PropsWithChildren<{ title: string }>) {
  return (
    <section style={{
      border: '1px solid #2b3140',
      borderRadius: 16,
      padding: 16,
      background: '#191d25'
    }}>
      <h2 style={{ marginTop: 0 }}>{props.title}</h2>
      {props.children}
    </section>
  );
}
