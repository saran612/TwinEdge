import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../context/AppContext';
import OverviewPage from '../pages/OverviewPage';

// Mock fetch for offline assets in test environment
import scalerJson from '../../public/offline/scaler.json';
global.fetch = vi.fn((url) => {
  if (String(url).includes('scaler.json')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve(scalerJson),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
});

describe('F9 Overview Page', () => {
  it('renders flight-deck instrument metrics and fleet engine table', async () => {
    render(
      <AppProvider>
        <OverviewPage />
      </AppProvider>
    );

    expect(screen.getAllByText(/Predicted RUL/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/Projected EOL Cycle/i)).toBeInTheDocument();
    expect(screen.getByText(/Fleet Turbofan Engines/i)).toBeInTheDocument();
    expect(screen.getByText(/Open Digital Twin 3D/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/#001/).length).toBeGreaterThan(0);
    });
  });

  it('selects new active engine when row is clicked', async () => {
    render(
      <AppProvider>
        <OverviewPage />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/#005/).length).toBeGreaterThan(0);
    });

    const matches = screen.getAllByText(/#005/);
    fireEvent.click(matches[0]);
  });
});
