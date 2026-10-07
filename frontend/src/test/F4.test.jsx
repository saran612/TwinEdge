import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../context/AppContext';
import DigitalTwinPage from '../pages/DigitalTwinPage';
import componentMapData from '../config/component_map.json';

// Mock Three.js WebGL canvas context for jsdom environment
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
});

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

describe('F4 Digital Twin Page Component', () => {
  it('renders 3D canvas viewport and tabs', async () => {
    render(
      <AppProvider>
        <DigitalTwinPage />
      </AppProvider>
    );

    expect(screen.getByText('Component')).toBeInTheDocument();
    expect(screen.getByText('Engine')).toBeInTheDocument();
    expect(screen.getByText('Sensors')).toBeInTheDocument();
  });

  it('exposes window.__twin test hook for selecting components', async () => {
    render(
      <AppProvider>
        <DigitalTwinPage />
      </AppProvider>
    );

    expect(window.__twin).toBeDefined();
    expect(typeof window.__twin.select).toBe('function');

    // Select HPC component
    window.__twin.select('hpc');
    await waitFor(() => {
      expect(screen.getByText(/High Pressure Compressor/i)).toBeInTheDocument();
    });

    // Select Fan
    window.__twin.select('fan');
    await waitFor(() => {
      expect(screen.getByText(/Fan & Bypass Duct/i)).toBeInTheDocument();
    });
  });

  it('displays engine-level EOL block without per-component RUL per Rule H2', async () => {
    render(
      <AppProvider>
        <DigitalTwinPage />
      </AppProvider>
    );

    expect(screen.getByText(/Predicted Engine RUL/i)).toBeInTheDocument();
    expect(screen.getByText(/Projected EOL Cycle/i)).toBeInTheDocument();
    expect(screen.getByText(/Conf: not computed/i)).toBeInTheDocument();
    expect(screen.getByText(/Model-Attributed Impact/i)).toBeInTheDocument();
  });
});
