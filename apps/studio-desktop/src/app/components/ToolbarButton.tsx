import type { CSSProperties, PropsWithChildren } from 'react';
import { buttonStyle } from '../styles';

export function ToolbarButton(props: PropsWithChildren<{ primary?: boolean; onClick?: () => void; disabled?: boolean; title?: string; style?: CSSProperties }>) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      style={{
        ...buttonStyle(props.primary),
        opacity: props.disabled ? 0.5 : 1,
        cursor: props.disabled ? 'not-allowed' : 'pointer',
        ...props.style
      }}
    >
      {props.children}
    </button>
  );
}
