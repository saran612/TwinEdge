import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../context/AppContext';
import MethodLimitsPage from '../pages/MethodLimitsPage';

describe('F11 Method & Limits Page', () => {
  it('renders prototype scope and explicit limits', () => {
    render(
      <AppProvider>
        <MethodLimitsPage />
      </AppProvider>
    );

    expect(screen.getByText('Methodology, Limits & Claims')).toBeInTheDocument();
    expect(screen.getByText('What TwinEdge IS')).toBeInTheDocument();
    expect(screen.getByText(/What TwinEdge is NOT/i)).toBeInTheDocument();
    expect(screen.getByText(/NOT FAA \/ EASA \/ DO-178C Certified/i)).toBeInTheDocument();
  });

  it('allows switching to C-MAPSS FD001 data tab and displays 14 sensor channels', () => {
    render(
      <AppProvider>
        <MethodLimitsPage />
      </AppProvider>
    );

    fireEvent.click(screen.getByText('2. C-MAPSS FD001'));
    expect(screen.getByText(/14 Active Degradation Sensor Channels/i)).toBeInTheDocument();
    expect(screen.getByText(/T24 - Total LPC outlet temperature/i)).toBeInTheDocument();
    expect(screen.getAllByText(/^s_2$/i)[0]).toBeInTheDocument();
  });

  it('renders 1D-CNN specifications and RMSE benchmark metrics', () => {
    render(
      <AppProvider>
        <MethodLimitsPage />
      </AppProvider>
    );

    fireEvent.click(screen.getByText('3. 1D-CNN Specs'));
    expect(screen.getByText('16.197')).toBeInTheDocument();
    expect(screen.getByText('N = 30')).toBeInTheDocument();
    expect(screen.getByText(/AdaptiveAvgPool1d/i)).toBeInTheDocument();
  });

  it('renders operational decision norms and K-gate policy', () => {
    render(
      <AppProvider>
        <MethodLimitsPage />
      </AppProvider>
    );

    fireEvent.click(screen.getByText('4. Decision Norms'));
    expect(screen.getByText(/1. K-Gate Alert Confirmation Policy/i)).toBeInTheDocument();
    expect(screen.getByText(/K = 3 Cycles/i)).toBeInTheDocument();
    expect(screen.getByText(/HEALTHY \(RUL ≥ 60\)/i)).toBeInTheDocument();
  });

  it('renders permitted and forbidden claims matrix from CLAIMS.md', () => {
    render(
      <AppProvider>
        <MethodLimitsPage />
      </AppProvider>
    );

    fireEvent.click(screen.getByText('5. Claims Matrix'));
    expect(screen.getByText(/Permitted & Empirically Verified Claims/i)).toBeInTheDocument();
    expect(screen.getByText(/Forbidden Claims & Required Disclaimers/i)).toBeInTheDocument();
    expect(screen.getByText(/"FAA \/ DO-178C Flight Certified"/i)).toBeInTheDocument();
  });
});
