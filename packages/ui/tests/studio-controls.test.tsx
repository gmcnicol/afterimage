import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  CapabilityBadge,
  CaptureTrustChip,
  getCaptureTrustTone,
  getPrimitiveControlTone,
  primitiveControlStyle,
  PrimitiveScalarControl,
  WarningChip
} from '../src';

describe('@afterimage/ui studio controls', () => {
  it('renders compact accessible primitive controls with deterministic sizing', () => {
    const html = renderToStaticMarkup(
      <PrimitiveScalarControl valueKind="pressure" value={0.42} disabled inputProps={{ id: 'pressure-control' }} />
    );

    expect(html).toContain('Pressure');
    expect(html).toContain('42%');
    expect(html).toContain('type="range"');
    expect(html).toContain('disabled=""');
    expect(html).toContain('aria-label="Pressure"');
    expect(primitiveControlStyle()).toMatchObject({
      gridTemplateRows: '14px 26px',
      minHeight: 44
    });
  });

  it('maps semantic values and trust states to stable tones', () => {
    expect(getPrimitiveControlTone('pressure')).toBe('warn');
    expect(getPrimitiveControlTone('cohesion')).toBe('success');
    expect(getPrimitiveControlTone('archive-affinity')).toBe('success');
    expect(getCaptureTrustTone('trusted')).toBe('success');
    expect(getCaptureTrustTone('watch')).toBe('warn');
    expect(getCaptureTrustTone('blocked')).toBe('danger');
    expect(getCaptureTrustTone('uncaptured')).toBe('default');
  });

  it('renders state chips, warning chips, and capability badges', () => {
    expect(renderToStaticMarkup(<CaptureTrustChip state="blocked" />)).toContain('blocked');
    expect(renderToStaticMarkup(<WarningChip blocking>render blocked</WarningChip>)).toContain('render blocked');
    expect(renderToStaticMarkup(<CapabilityBadge available={false}>CPU fallback</CapabilityBadge>)).toContain('CPU fallback');
  });
});
