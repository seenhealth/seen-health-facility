/// <reference types="vite/client" />
// Keep first: rebases the app's root-relative asset URLs before any app code runs.
import './asset-base';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../app/globals.css';
import Home from '../../app/page';

/** Standalone static build of the facility viewer (see README, "Static viewer build"). */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
