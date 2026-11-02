import { createRoot } from 'react-dom/client';
import './styles/global.css';
import App from './App';

// Note: no <StrictMode> — its dev-only double mount drops the WebGL
// context of the animated background (React Bits Grainient).
createRoot(document.getElementById('root')!).render(<App />);
