import { API_URL } from '../config';
import { createApiClient } from './api';

/**
 * Client API sans session pour la page publique de suivi : aucun jeton envoyé (même si l'appareil a une
 * session Entreprise ou Livreur), aucun retour forcé à l'écran de connexion.
 */
export const publicApi = createApiClient({ baseUrl: API_URL, getToken: () => null });
