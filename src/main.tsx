import { createRoot } from 'react-dom/client';
import Game from './app/page';
import './app/globals.css';

const root = document.getElementById('root');
if (!root) throw new Error('Game root is missing.');
createRoot(root).render(<Game />);
