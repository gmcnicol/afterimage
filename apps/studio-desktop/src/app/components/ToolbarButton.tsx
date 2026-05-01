import type { CSSProperties, PropsWithChildren } from 'react';
import { buttonStyle } from '../styles';

export function ToolbarButton(props: PropsWithChildren<{
  primary?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  style?: CSSProperties;
  compact?: boolean;
  edge?: 'single' | 'left' | 'middle' | 'right';
}>) {
  const edge = props.edge ?? 'single';
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      style={{
        ...buttonStyle(props.primary),
        borderRadius: 0,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
        borderLeft: edge === 'left' || edge === 'single' ? buttonStyle(props.primary).border : '1px solid rgba(255,255,255,0.08)',
        marginLeft: edge === 'middle' || edge === 'right' ? -1 : 0,
        opacity: props.disabled ? 0.5 : 1,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        height: 28,
        minHeight: 28,
        padding: '0 10px',
        fontSize: 12,
        fontWeight: 400,
        ...props.style
      }}
    >
      {props.children}
    </button>
  );
}
