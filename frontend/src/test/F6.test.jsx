import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../context/AppContext';
import AlertsPage from '../pages/AlertsPage';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getAlerts: vi.fn().mockResolvedValue([
      {
        id: 'alert-001',
        engine_id: 1,
        cycle: 45,
        rul_prediction: 48.5,
        status: 'PENDING',
        reviewer_id: null,
        timestamp: '2026-10-07T12:00:00Z',
      },
      {
        id: 'alert-002',
        engine_id: 2,
        cycle: 80,
        rul_prediction: 52.0,
        status: 'APPROVED',
        reviewer_id: 'TECH-101',
        timestamp: '2026-10-07T11:00:00Z',
      },
    ]),
    postSignoff: vi.fn().mockResolvedValue({
      status: 'ok',
      alert: { id: 'alert-001', status: 'APPROVED' },
      audit_entry: { row_hash: 'abc123hash' },
    }),
  },
}));

describe('F6 Alerts & Sign-off Page', () => {
  it('renders alerts table and policy gating metrics', async () => {
    render(
      <AppProvider>
        <AlertsPage />
      </AppProvider>
    );

    expect(screen.getByText(/Fleet Alerts Queue/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('alert-001')).toBeInTheDocument();
      expect(screen.getByText('alert-002')).toBeInTheDocument();
    });
  });

  it('opens detail drawer when an alert is clicked', async () => {
    render(
      <AppProvider>
        <AlertsPage />
      </AppProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('alert-001')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('alert-001'));

    await waitFor(() => {
      expect(screen.getByText(/Reviewer ID is recorded, not licence-verified/i)).toBeInTheDocument();
      expect(screen.getByText(/Work-Order Template/i)).toBeInTheDocument();
    });
  });
});
