import './styles/base.css';
import { state } from './shared/state.js';
import { startDashboard } from './dashboard/dashboard.js';

// La intro todavía no existe: se entra directo al dashboard.
state.mode = 'dashboard';
startDashboard(document.body)
  .then((dashboard) => {
    // Solo en desarrollo: acceso desde la consola y las pruebas de navegador.
    if (import.meta.env.DEV) window.__marswalk = { ...dashboard, state };
  })
  .catch((error) => {
    console.error(error);
  });
