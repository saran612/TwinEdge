import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider, useApp, DATA_SOURCES } from '../context/AppContext';
import GlobalShell from '../components/layout/GlobalShell';
import MetricCard from '../components/common/MetricCard';
import StatusBadge from '../components/common/StatusBadge';
import ProvenanceTag from '../components/common/ProvenanceTag';

function ShellWrapper({ activePage = 'overview' }) {
  const { setDataSource } = useApp();
  return (
    <GlobalShell activePage={activePage} onNavigate={() => {}}>
      <div data-testid="page-content">
        <button onClick={() => setDataSource(DATA_SOURCES.SIMULATION)}>Switch Sim</button>
        <MetricCard label="Test Metric" value="42" unit="cycles" provenance="LIVE" tooltip="Sample tip" />
        <StatusBadge status="HEALTHY" />
        <ProvenanceTag type="ASSUMED" />
      </div>
    </GlobalShell>
  );
}

describe('F1 Foundation Shell & Shared Components', () => {
  it('renders top bar, left nav, and child components with provenance tags', () => {
    render(
      <AppProvider>
        <ShellWrapper />
      </AppProvider>
    );

    expect(screen.getByText('TwinEdge')).toBeInTheDocument();
    expect(screen.getByText('Overview')).toBeInTheDocument();
    expect(screen.getByText('Digital Twin')).toBeInTheDocument();
    expect(screen.getByText('Test Metric')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('LIVE')).toBeInTheDocument();
    expect(screen.getByText('ASSUMED')).toBeInTheDocument();
  });

  it('displays persistent simulation banner when data source is Simulation', () => {
    render(
      <AppProvider>
        <ShellWrapper />
      </AppProvider>
    );

    expect(screen.queryByTestId('simulation-banner')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Switch Sim'));
    expect(screen.getByTestId('simulation-banner')).toBeInTheDocument();
    expect(screen.getByText(/SIMULATION MODE ACTIVE/i)).toBeInTheDocument();
  });

  it('opens and closes rubrics drawer', () => {
    render(
      <AppProvider>
        <ShellWrapper />
      </AppProvider>
    );

    fireEvent.click(screen.getByText('Rubrics'));
    expect(screen.getByText(/Operational Rubrics & Decision Norms/i)).toBeInTheDocument();
    expect(screen.getByText(/Engine Health Bands/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close Rubrics'));
    expect(screen.queryByText(/Operational Rubrics & Decision Norms/i)).not.toBeInTheDocument();
  });
});
