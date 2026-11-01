import React from 'react';
import { Card } from '../../components/ui/Card';

export default function StudioPage() {
  return (
    <div>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ui-text)', marginBottom: '0.25rem' }}>
        Creator Studio
      </h1>
      <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
        Course authoring, draft management, and version publishing.
      </p>
      <Card>
        <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.9rem', margin: 0 }}>
          The Creator Studio workspace is scheduled for <strong>UI-05</strong>.
          The backend authoring API is fully functional — this UI increment focuses
          on the Learner Workspace, assessment navigation, and design tokens.
        </p>
      </Card>
    </div>
  );
}
