import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../styles/index.css';
import './mobile.css';
import { MobileRoot } from './MobileRoot';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MobileRoot />
  </StrictMode>,
);
