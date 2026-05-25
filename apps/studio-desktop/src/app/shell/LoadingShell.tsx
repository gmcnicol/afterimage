import { Screen } from '@afterimage/ui';
import { muted } from '../styles';

export function LoadingShell() {
  return (
    <Screen>
      <div className="studio-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="studio-surface" style={{ padding: 18, color: muted }}>
          Loading universe...
        </div>
      </div>
    </Screen>
  );
}
