import React from 'react';
import ReactDOM from 'react-dom/client';
import type { CSSProperties } from 'react';
import { Screen, Panel, studioTheme } from '@afterimage/ui';
import type { LiveSessionDiagnostic, LiveSessionSnapshot } from '@afterimage/studio-contracts';

function App() {
  const [state, setState] = React.useState<{
    status: 'loading' | 'loaded';
    snapshot?: LiveSessionSnapshot;
  }>({ status: 'loading' });

  React.useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      const snapshot = window.afterimage
        ? await window.afterimage.getSession()
        : createBridgeUnavailableSnapshot();

      if (!cancelled) {
        setState({ status: 'loaded', snapshot });
      }
    }

    void loadSession().catch((error: unknown) => {
      if (!cancelled) {
        setState({
          status: 'loaded',
          snapshot: createBridgeFailureSnapshot(error)
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = state.snapshot;
  const readiness = snapshot?.readiness;
  const ref = snapshot?.compositionRef;
  const isReady = readiness?.status === 'ready';

  return (
    <Screen>
      <div style={layoutStyle}>
        <header style={headerStyle}>
          <div>
            <h1 style={titleStyle}>Afterimage Live Desktop</h1>
            <div style={subtleTextStyle}>
              {snapshot?.projectPath ?? 'No project loaded'}
            </div>
          </div>
          <StatusPill
            label={state.status === 'loading' ? 'Loading' : isReady ? 'Ready' : 'Blocked'}
            tone={state.status === 'loading' ? 'neutral' : isReady ? 'success' : 'danger'}
          />
        </header>

        <main style={gridStyle}>
          <Panel title="Session" bodyStyle={panelBodyStyle}>
            {state.status === 'loading' ? (
              <div style={subtleTextStyle}>Loading session...</div>
            ) : ref ? (
              <div style={rowsStyle}>
                <Field label="Project" value={ref.projectName} detail={ref.projectId} />
                <Field label="Composition" value={ref.compositionName} detail={ref.compositionId} />
                <Field label="Sequence" value={ref.sequenceName} detail={ref.sequenceId} />
                <Field label="Variant" value={ref.variantName} detail={ref.variantId} />
              </div>
            ) : (
              <EmptyState label="Session unavailable" />
            )}
          </Panel>

          <Panel title="Preview Backend" bodyStyle={panelBodyStyle}>
            {readiness ? (
              <div style={rowsStyle}>
                <Field label="Backend" value={readiness.backend.label} detail={readiness.backend.runtime} />
                <Field label="Readiness" value={readiness.status} detail={`preview: ${readiness.previewStatus}`} />
                <Field
                  label="Render graph"
                  value={readiness.report?.renderGraph.planId ?? 'Not evaluated'}
                  detail={readiness.report
                    ? `${readiness.report.renderGraph.passIds.length} pass, ${readiness.report.requiredCapabilities.length} capabilities`
                    : undefined}
                />
                <Field
                  label="Target"
                  value={readiness.report?.target.outputPath ?? 'No target'}
                  detail={readiness.report
                    ? `${readiness.report.target.profile.width}x${readiness.report.target.profile.height} at ${readiness.report.target.profile.frameRate}fps`
                    : undefined}
                />
              </div>
            ) : (
              <EmptyState label="Preview status unavailable" />
            )}
          </Panel>

          <Panel title="Diagnostics" style={diagnosticsPanelStyle} bodyStyle={panelBodyStyle}>
            {readiness?.diagnostics.length ? (
              <div style={diagnosticListStyle}>
                {readiness.diagnostics.map((diagnostic) => (
                  <DiagnosticRow key={diagnostic.id} diagnostic={diagnostic} />
                ))}
              </div>
            ) : (
              <EmptyState label={state.status === 'loading' ? 'Waiting for session' : 'No diagnostics'} />
            )}
          </Panel>
        </main>
      </div>
    </Screen>
  );
}

function createBridgeUnavailableSnapshot(): LiveSessionSnapshot {
  return {
    schemaVersion: 1,
    readiness: {
      status: 'blocked',
      previewStatus: 'not-evaluated',
      backend: {
        backend: 'ffmpeg',
        label: 'FFmpeg command preview',
        runtime: 'command'
      },
      diagnostics: [{
        id: 'diagnostic:live-session:preload-unavailable',
        severity: 'error',
        code: 'LIVE_SESSION_PRELOAD_UNAVAILABLE',
        message: 'Live Desktop preload bridge is unavailable.',
        source: 'live-session'
      }]
    }
  };
}

function createBridgeFailureSnapshot(error: unknown): LiveSessionSnapshot {
  return {
    schemaVersion: 1,
    readiness: {
      status: 'blocked',
      previewStatus: 'not-evaluated',
      backend: {
        backend: 'ffmpeg',
        label: 'FFmpeg command preview',
        runtime: 'command'
      },
      diagnostics: [{
        id: 'diagnostic:live-session:preload-failed',
        severity: 'error',
        code: 'LIVE_SESSION_PRELOAD_FAILED',
        message: error instanceof Error ? error.message : 'Live Desktop session query failed.',
        source: 'live-session'
      }]
    }
  };
}

function StatusPill(props: { label: string; tone: 'neutral' | 'success' | 'danger' }) {
  const toneStyle = props.tone === 'success'
    ? successPillStyle
    : props.tone === 'danger'
      ? dangerPillStyle
      : neutralPillStyle;

  return (
    <div style={{ ...pillStyle, ...toneStyle }}>
      {props.label}
    </div>
  );
}

function Field(props: { label: string; value: string; detail?: string }) {
  return (
    <div style={fieldStyle}>
      <div style={fieldLabelStyle}>{props.label}</div>
      <div style={fieldValueStyle}>{props.value}</div>
      {props.detail ? <div style={fieldDetailStyle}>{props.detail}</div> : null}
    </div>
  );
}

function EmptyState(props: { label: string }) {
  return <div style={emptyStateStyle}>{props.label}</div>;
}

function DiagnosticRow(props: { diagnostic: LiveSessionDiagnostic }) {
  const color = props.diagnostic.severity === 'error'
    ? '#f0a2a2'
    : props.diagnostic.severity === 'warning'
      ? '#dfc97a'
      : '#9bb8df';

  return (
    <div style={diagnosticRowStyle}>
      <div style={{ ...diagnosticSeverityStyle, color }}>{props.diagnostic.severity}</div>
      <div style={diagnosticContentStyle}>
        <div style={diagnosticCodeStyle}>{props.diagnostic.code}</div>
        <div style={diagnosticMessageStyle}>{props.diagnostic.message}</div>
        {props.diagnostic.path ? <div style={fieldDetailStyle}>{props.diagnostic.path}</div> : null}
      </div>
    </div>
  );
}

const layoutStyle: CSSProperties = {
  height: '100%',
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  gap: 16
};

const headerStyle: CSSProperties = {
  minHeight: 64,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 18,
  borderBottom: '1px solid rgba(255,255,255,0.08)',
  paddingBottom: 14
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: studioTheme.typography.heroWeight,
  letterSpacing: 0
};

const subtleTextStyle: CSSProperties = {
  color: studioTheme.colors.muted,
  fontSize: 12,
  lineHeight: 1.35,
  overflowWrap: 'anywhere'
};

const gridStyle: CSSProperties = {
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(260px, 0.85fr) minmax(320px, 1.15fr)',
  gridTemplateRows: 'minmax(220px, auto) minmax(0, 1fr)',
  gap: 14
};

const diagnosticsPanelStyle: CSSProperties = {
  gridColumn: '1 / -1'
};

const panelBodyStyle: CSSProperties = {
  overflow: 'auto'
};

const rowsStyle: CSSProperties = {
  display: 'grid',
  gap: 10
};

const fieldStyle: CSSProperties = {
  display: 'grid',
  gap: 4,
  minWidth: 0,
  paddingBottom: 10,
  borderBottom: '1px solid rgba(255,255,255,0.06)'
};

const fieldLabelStyle: CSSProperties = {
  color: '#aab4c5',
  fontSize: 11,
  lineHeight: 1.2,
  textTransform: 'uppercase',
  letterSpacing: 0
};

const fieldValueStyle: CSSProperties = {
  color: '#f4f6f8',
  fontSize: 13,
  lineHeight: 1.25,
  overflowWrap: 'anywhere'
};

const fieldDetailStyle: CSSProperties = {
  color: '#8994a6',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 11,
  lineHeight: 1.35,
  overflowWrap: 'anywhere'
};

const pillStyle: CSSProperties = {
  minWidth: 88,
  height: 30,
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0 12px',
  border: '1px solid',
  fontSize: 12,
  fontWeight: studioTheme.typography.strongWeight
};

const successPillStyle: CSSProperties = {
  color: '#b9f0d5',
  borderColor: 'rgba(113, 210, 160, 0.42)',
  background: 'rgba(42, 122, 82, 0.2)'
};

const dangerPillStyle: CSSProperties = {
  color: '#f2b2b2',
  borderColor: 'rgba(224, 96, 96, 0.44)',
  background: 'rgba(136, 45, 45, 0.2)'
};

const neutralPillStyle: CSSProperties = {
  color: '#c6d0df',
  borderColor: 'rgba(166, 183, 207, 0.34)',
  background: 'rgba(92, 109, 132, 0.16)'
};

const emptyStateStyle: CSSProperties = {
  color: studioTheme.colors.muted,
  minHeight: 120,
  display: 'flex',
  alignItems: 'center'
};

const diagnosticListStyle: CSSProperties = {
  display: 'grid',
  gap: 10
};

const diagnosticRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '88px minmax(0, 1fr)',
  gap: 12,
  paddingBottom: 10,
  borderBottom: '1px solid rgba(255,255,255,0.06)'
};

const diagnosticSeverityStyle: CSSProperties = {
  fontSize: 11,
  lineHeight: 1.35,
  textTransform: 'uppercase',
  letterSpacing: 0,
  fontWeight: studioTheme.typography.strongWeight
};

const diagnosticContentStyle: CSSProperties = {
  minWidth: 0,
  display: 'grid',
  gap: 4
};

const diagnosticCodeStyle: CSSProperties = {
  color: '#e6ebf2',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: 11,
  lineHeight: 1.35,
  overflowWrap: 'anywhere'
};

const diagnosticMessageStyle: CSSProperties = {
  color: '#cdd4df',
  fontSize: 12,
  lineHeight: 1.4,
  overflowWrap: 'anywhere'
};

const style = document.createElement('style');
style.textContent = `
  html, body, #root {
    width: 100%;
    height: 100%;
    margin: 0;
  }

  @media (max-width: 860px) {
    #root main {
      grid-template-columns: minmax(0, 1fr) !important;
      grid-template-rows: auto auto minmax(0, 1fr) !important;
    }
  }
`;
document.head.append(style);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
