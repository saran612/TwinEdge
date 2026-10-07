import React, { useState } from 'react';
import { AppProvider } from './context/AppContext';
import GlobalShell from './components/layout/GlobalShell';

import OverviewPage from './pages/OverviewPage';
import DigitalTwinPage from './pages/DigitalTwinPage';
import TelemetryPage from './pages/TelemetryPage';
import AlertsPage from './pages/AlertsPage';
import AuditPage from './pages/AuditPage';
import SimulationLabPage from './pages/SimulationLabPage';
import EdgeModelPage from './pages/EdgeModelPage';
import MethodLimitsPage from './pages/MethodLimitsPage';

export default function App() {
  const [activePage, setActivePage] = useState('overview');

  const renderActivePage = () => {
    switch (activePage) {
      case 'overview':
        return (
          <OverviewPage
            onNavigateToTwin={() => setActivePage('twin')}
            onNavigateToAlerts={() => setActivePage('alerts')}
          />
        );
      case 'twin':
        return <DigitalTwinPage />;
      case 'telemetry':
        return <TelemetryPage />;
      case 'alerts':
        return <AlertsPage />;
      case 'audit':
        return <AuditPage />;
      case 'simulation':
        return <SimulationLabPage />;
      case 'edge':
        return <EdgeModelPage />;
      case 'about':
        return <MethodLimitsPage />;
      default:
        return <OverviewPage onNavigateToTwin={() => setActivePage('twin')} onNavigateToAlerts={() => setActivePage('alerts')} />;
    }
  };

  return (
    <AppProvider>
      <GlobalShell activePage={activePage} onNavigate={(pageId) => setActivePage(pageId)}>
        {renderActivePage()}
      </GlobalShell>
    </AppProvider>
  );
}
