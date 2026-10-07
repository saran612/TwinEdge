import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../context/AppContext';
import TelemetryPage from '../pages/TelemetryPage';

describe('F10 Telemetry Page', () => {
  it('renders empirical error metrics and sensor selection chips', () => {
    render(
      <AppProvider>
        <TelemetryPage />
      </AppProvider>
    );

    expect(screen.getByText(/Empirical MAE/i)).toBeInTheDocument();
    expect(screen.getByText(/Empirical RMSE/i)).toBeInTheDocument();
    expect(screen.getByText(/Raw Engineering Units/i)).toBeInTheDocument();
    expect(screen.getByText(/Z-Score Normalized/i)).toBeInTheDocument();
    expect(screen.getByText(/Export Trace CSV/i)).toBeInTheDocument();
  });

  it('toggles between raw engineering units and z-score normalization', () => {
    render(
      <AppProvider>
        <TelemetryPage />
      </AppProvider>
    );

    const zBtn = screen.getByText(/Z-Score Normalized/i);
    fireEvent.click(zBtn);
  });
});
