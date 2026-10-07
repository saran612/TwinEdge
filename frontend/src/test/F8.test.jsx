import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import EdgeModelPage from '../pages/EdgeModelPage';

vi.mock('../services/api', () => ({
  api: {
    getModelInfo: vi.fn().mockResolvedValue({
      model_name: 'twinedge_rul_cnn',
      onnx_size_bytes: 71355,
      tflite_size_bytes: 24408,
      latency_p50_ms: 0.54,
      latency_p95_ms: 0.76,
      test_rmse: 16.1972,
    }),
    getEdgeStats: vi.fn().mockResolvedValue({
      total_calls: 50,
      raw_window_bytes: 84000,
      upstream_payload_bytes: 400,
      payload_to_raw_ratio: 0.00476,
    }),
  },
}));

describe('F8 Edge & Model Page', () => {
  it('renders hardware specs, latency percentiles, and edge bytes', async () => {
    render(<EdgeModelPage />);

    expect(screen.getByText(/Target Edge Hardware/i)).toBeInTheDocument();
    expect(screen.getByText(/Raw Sensor Bytes \/ Window/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/0.54 ms/)).toBeInTheDocument();
      expect(screen.getByText(/0.76 ms/)).toBeInTheDocument();
      expect(screen.getByText(/71355 bytes/)).toBeInTheDocument();
      expect(screen.getByText(/16.1972/)).toBeInTheDocument();
    });
  });
});
