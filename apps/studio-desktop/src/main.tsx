import React from 'react';
import ReactDOM from 'react-dom/client';
import { Screen, Panel } from '@afterimage/ui';

function App() {
  return (
    <Screen>
      <h1 style={{ marginTop: 0 }}>Afterimage — Studio Desktop</h1>
      <p>Offline authoring shell for scene detection, sequencing, music sync, and HQ export.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
        <Panel title="Media Library">
          Long-form clips, source ingestion, thumbnails, metadata.
        </Panel>
        <Panel title="Scene Analysis">
          FFmpeg scene detection, cut candidates, ranking, and review.
        </Panel>
        <Panel title="Sequence Builder">
          Arrange selected cuts against a timeline or music bed.
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
