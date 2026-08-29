import { Buffer } from 'buffer';
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import EcoReliefHarness from './ecorelief/EcoReliefHarness';

document.body.classList.add('ecorelief-body');

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found in ecorelief.html.');
}

createRoot(rootElement).render(
  <StrictMode>
    <EcoReliefHarness />
  </StrictMode>,
);
