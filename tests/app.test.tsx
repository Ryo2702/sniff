/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from '../src/App';

afterEach(() => cleanup());

describe('SNIFF shell', () => {
  it('renders the investigation entry point without a backend', () => {
    render(<App />);
    expect(screen.getByText('PASTE ANYTHING.')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start sniffing/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open command palette/i })).toBeTruthy();
  });

  it('switches scenes through the investigation desk', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Scent Map' }));
    expect(screen.getByRole('heading', { name: 'Scent map' })).toBeTruthy();
    expect(screen.getByText('No scent map yet')).toBeTruthy();
  });

  it('keeps the browser wallet picker limited to Phantom and Solflare', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect wallet' }));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Phantom Browser extension' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Solflare Browser extension' })).toHaveLength(1);
  });
});
