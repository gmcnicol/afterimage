import React from 'react';
import ReactDOM from 'react-dom/client';
import { Screen, Panel } from '@afterimage/ui';

function App() {
  return (
    <Screen>
      <h1 style={{ marginTop: 0 }}>Afterimage — Live Desktop</h1>
      <p>Low-latency desktop shell for clip banks, reactive filters, streaming, and performance control.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
        <Panel title="Clip Banks">
          Prebuilt material and loop sets for performance.
        </Panel>
        <Panel title="Performance Controls">
          MIDI mappings, preset morphing, reactive modulation.
        </Panel>
        <Panel title="Outputs">
          Fullscreen projector, stream out, local record.
        </Panel>
      </div>
    </Screen>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
