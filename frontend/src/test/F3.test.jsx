import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider, useApp, DATA_SOURCES } from '../context/AppContext';
import GlobalShell from '../components/layout/GlobalShell';
import EngineSplitBadge from '../components/common/EngineSplitBadge';
import { defaultReplayController } from '../services/replayController';

function SourceSwitchTester() {
  const { dataSource, setDataSource, activeEngineId, setActiveEngineId } = useApp();
  const cycleData = defaultReplayController.getCycleData(activeEngineId, 1);

  return (
    <GlobalShell activePage="twin" onNavigate={() => {}}>
      <div data-testid="test-content">
        <span data-testid="current-source">{dataSource}</span>
        <span data-testid="engine-split">{cycleData.split}</span>
        <button onClick={() => setDataSource(DATA_SOURCES.LIVE)}>Set Live</button>
        <button onClick={() => setDataSource(DATA_SOURCES.REPLAY)}>Set Replay</button>
        <button onClick={() => setDataSource(DATA_SOURCES.SIMULATION)}>Set Sim</button>
        <button onClick={() => setActiveEngineId(1)}>Select Engine 1</button>
      </div>
    </GlobalShell>
  );
}

describe('F3 Replay Controller and Data Source Switch', () => {
  it('correctly loads bundled replay engines and splits', () => {
    const engines = defaultReplayController.getEnginesList();
    expect(engines.length).toBeGreaterThanOrEqual(4);
    const heldOut = engines.filter((e) => e.split === 'HELD-OUT VALIDATION');
    const testEngines = engines.filter((e) => e.split === 'TEST');
    expect(heldOut.length).toBeGreaterThanOrEqual(3);
    expect(testEngines.length).toBeGreaterThanOrEqual(3);
  });

  it('renders split badges with correct colors and text', () => {
    const { unmount } = render(<EngineSplitBadge split="HELD-OUT VALIDATION" />);
    expect(screen.getByText('HELD-OUT VAL')).toBeInTheDocument();
    unmount();

    render(<EngineSplitBadge split="TEST" />);
    expect(screen.getByText('TEST')).toBeInTheDocument();
  });

  it('allows switching between Live, Replay, and Simulation sources', () => {
    render(
      <AppProvider>
        <SourceSwitchTester />
      </AppProvider>
    );

    expect(screen.getByTestId('current-source').textContent).toBe(DATA_SOURCES.REPLAY);

    fireEvent.click(screen.getByText('Set Live'));
    expect(screen.getByTestId('current-source').textContent).toBe(DATA_SOURCES.LIVE);

    fireEvent.click(screen.getByText('Set Sim'));
    expect(screen.getByTestId('current-source').textContent).toBe(DATA_SOURCES.SIMULATION);
    expect(screen.getByTestId('simulation-banner')).toBeInTheDocument();
  });
});
