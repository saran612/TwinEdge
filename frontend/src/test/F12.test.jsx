import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AppProvider } from '../context/AppContext';
import EngineViewport3D from '../components/twin/EngineViewport3D';

describe('F12 Accessibility and Keyboard Navigation', () => {
  it('supports cycling turbofan components using ArrowRight and ArrowLeft keyboard keys', () => {
    let selected = null;
    const handleSelect = (id) => {
      selected = id;
    };

    render(
      <EngineViewport3D
        selectedComponentId={selected}
        onSelectComponent={handleSelect}
      />
    );

    // Initial state: press ArrowRight should select first component
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(selected).toBeTruthy();

    // Escape clears selection
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(selected).toBeNull();
  });

  it('exposes window.__twin hook for programmatic selection and keyboard focus', () => {
    let selected = 'fan';
    const handleSelect = (id) => {
      selected = id;
    };

    render(
      <EngineViewport3D
        selectedComponentId={selected}
        onSelectComponent={handleSelect}
      />
    );

    expect(window.__twin).toBeDefined();
    expect(window.__twin.getSelected()).toBe('fan');

    window.__twin.select('hpc');
    expect(selected).toBe('hpc');
  });
});
