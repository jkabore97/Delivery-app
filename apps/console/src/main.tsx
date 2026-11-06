import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { App } from './App';
import { AuthProvider } from './auth/AuthContext';
import { API_URL } from './config';

const root = document.getElementById('root');
if (!root) throw new Error('#root introuvable');

// Pas de <StrictMode> : en développement il double les effets, donc les téléchargements
// de pièces KYC (chacun journalisé dans l'audit) seraient comptés deux fois.
createRoot(root).render(
  <BrowserRouter>
    <AuthProvider baseUrl={API_URL}>
      <App socketUrl={API_URL} />
    </AuthProvider>
  </BrowserRouter>,
);
