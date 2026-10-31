import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme } from './theme-engine';
import './styles/tokens.css';

applyTheme(document.documentElement.style, 'deep-space');

const root = document.getElementById('root');
if (root === null) {
  throw new Error('缺少 #root 挂载点');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
