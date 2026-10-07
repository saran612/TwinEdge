import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../context/AppContext';
import SimulationLabPage from '../pages/SimulationLabPage';
import { applyPerturbations, createDefaultPerturbationMatrix } from '../services/simulator';
import trainingStatsJson from '../../public/offline/training_stats.json';

describe('F5 Simulation Lab', () => {
  it('correctly creates and applies perturbation matrix adjustments', () => {
    const matrix = createDefaultPerturbationMatrix();
    // Apply +2 sigma bias to s_3 (HPC Outlet Temp)
    const s3Row = matrix.find((r) => r.sensorId === 's_3');
    s3Row.active = true;
    s3Row.biasSigma = 2.0;

    const baseSensors = Array(14).fill(100.0);
    const { sensors, isOOD } = applyPerturbations({
      rawCycleSensors: baseSensors,
      cycleNumber: 5,
      matrix,
      trainingStats: trainingStatsJson,
    });

    const s3Idx = 1; // s_3 is second feature
    expect(sensors[s3Idx]).toBeGreaterThan(100.0);
  });

  it('detects Out-Of-Distribution (OOD) when |z| exceeds 4.0', () => {
    const matrix = createDefaultPerturbationMatrix();
    const s3Row = matrix.find((r) => r.sensorId === 's_3');
    s3Row.active = true;
    s3Row.biasSigma = 6.0; // Extreme shift

    const baseSensors = Array(14).fill(100.0);
    const { isOOD, oodIndicators } = applyPerturbations({
      rawCycleSensors: baseSensors,
      cycleNumber: 5,
      matrix,
      trainingStats: trainingStatsJson,
    });

    expect(isOOD).toBe(true);
    expect(oodIndicators.length).toBeGreaterThan(0);
  });

  it('renders Simulation Lab page with presets and matrix controls', () => {
    render(
      <AppProvider>
        <SimulationLabPage />
      </AppProvider>
    );

    expect(screen.getByText(/OFFLINE SIMULATION LAB/i)).toBeInTheDocument();
    expect(screen.getByText(/Perturbation Matrix/i)).toBeInTheDocument();
    expect(screen.getByText('Accelerated Degradation')).toBeInTheDocument();
  });
});
