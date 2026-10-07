import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import AuditPage from '../pages/AuditPage';
import { api } from '../services/api';

vi.mock('../services/api', () => ({
  api: {
    getAuditLog: vi.fn().mockResolvedValue([
      {
        id: 1,
        timestamp: '2026-10-07T12:00:00Z',
        action: 'ALERT_CREATED',
        engine_id: 1,
        cycle: 45,
        reviewer_id: null,
        row_hash: 'hash001abc',
        prev_hash: 'GENESIS',
      },
      {
        id: 2,
        timestamp: '2026-10-07T12:05:00Z',
        action: 'ALERT_APPROVED',
        engine_id: 1,
        cycle: 45,
        reviewer_id: 'TECH-01',
        row_hash: 'hash002def',
        prev_hash: 'hash001abc',
      },
    ]),
    verifyAudit: vi.fn().mockResolvedValue({
      verified: true,
      total_rows: 2,
      tampered_row: null,
    }),
  },
}));

describe('F7 Audit Page', () => {
  it('renders cryptographic audit ledger table and verification status', async () => {
    render(<AuditPage />);

    expect(screen.getByText(/Immutable Audit Trail Ledger/i)).toBeInTheDocument();

    expect(await screen.findByText('ALERT_CREATED')).toBeInTheDocument();
    expect(await screen.findByText('ALERT_APPROVED')).toBeInTheDocument();
    const hashMatches = await screen.findAllByText(/hash001abc/);
    expect(hashMatches.length).toBeGreaterThan(0);
    expect(await screen.findByText('VERIFIED')).toBeInTheDocument();
  });
});
