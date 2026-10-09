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
import StyleguidePage from './pages/StyleguidePage';
import LogsPage from './pages/LogsPage';

export default function App() {
  const getInitialPage = () => {
    const hash = window.location.hash.replace('#/', '').replace('#', '');
    return hash || 'overview';
  };

  const [activePage, setActivePage] = useState(getInitialPage);

  React.useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#/', '').replace('#', '');
      if (hash) setActivePage(hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Dev-only styleguide route check
  if (window.location.pathname === '/__styleguide' || activePage === '__styleguide') {
    return <StyleguidePage />;
  }

  const renderActivePage = () => {
    switch (activePage) {
      case 'overview':
        return (
          <OverviewPage
            onNavigateToTwin={() => handleNavigate('twin')}
            onNavigateToAlerts={() => handleNavigate('alerts')}
          />
        );
      case 'twin':
        return (
          <DigitalTwinPage
            onNavigateToAlerts={() => handleNavigate('alerts')}
            onNavigateToSim={() => handleNavigate('simulation')}
          />
        );
      case 'telemetry':
        return <TelemetryPage />;
      case 'alerts':
        return <AlertsPage />;
      case 'audit':
        return <AuditPage />;
      case 'logs':
        return <LogsPage />;
      case 'simulation':
        return (
          <SimulationLabPage
            onSendToTwin={() => handleNavigate('twin')}
          />
        );
      case 'edge':
        return <EdgeModelPage />;
      case 'about':
        return <MethodLimitsPage />;
      default:
        return (
          <OverviewPage
            onNavigateToTwin={() => handleNavigate('twin')}
            onNavigateToAlerts={() => handleNavigate('alerts')}
          />
        );
    }
  };


  const handleNavigate = (pageId) => {
    setActivePage(pageId);
    window.location.hash = `#/${pageId}`;
  };

  return (
    <AppProvider>
      <GlobalShell activePage={activePage} onNavigate={handleNavigate}>
        {renderActivePage()}
      </GlobalShell>
    </AppProvider>
  );
}
