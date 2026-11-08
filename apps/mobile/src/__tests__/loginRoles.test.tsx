import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type { UserDto } from '@yaar/shared';
import LoginScreen from '../app/login';
import VerifyScreen from '../app/verify';
import { CLIENT_ACCOUNT_MESSAGE } from '../lib/roles';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  router: { push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Redirect: () => null,
}));

const user = (role: UserDto['role']): UserDto => ({
  id: 'u1',
  phone: '+22672000001',
  name: 'Aminata K.',
  role,
  isSuspended: false,
  suspensionReason: null,
  createdAt: '2026-11-01T00:00:00.000Z',
});

const mockAuth = {
  api: { requestOtp: jest.fn(async () => ({ sent: true, expiresInSeconds: 300 })), verifyOtp: jest.fn() },
  notice: null as string | null,
  status: 'signedOut' as 'signedOut' | 'signedIn',
  user: null as UserDto | null,
  signIn: jest.fn(async () => undefined),
  signOut: jest.fn(async () => undefined),
};
jest.mock('../state/auth', () => ({ useAuth: () => mockAuth }));
jest.mock('../state/config', () => ({
  useAppConfig: () => ({ config: { realtime: 'poll', pollIntervalMs: 4000, demoMode: true, otpChannel: 'console' } }),
}));

describe('Connexion : Entreprise et Livreur seulement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.notice = null;
    mockAuth.status = 'signedOut';
    mockAuth.user = null;
  });

  it('deux profils, pas d’inscription client ; message pour les destinataires', async () => {
    const r = await render(<LoginScreen />);
    expect(r.getByTestId('role-SELLER')).toHaveTextContent(/Entreprise/);
    expect(r.getByTestId('role-DRIVER')).toHaveTextContent(/Livreur/);
    expect(r.queryByTestId('role-CLIENT')).toBeNull();
    expect(r.queryByText(/Je suis client/)).toBeNull();
    expect(r.getByTestId('recipient-hint')).toHaveTextContent(/Pas besoin de compte/);
  });

  it('profil choisi transmis à l’écran du code', async () => {
    const r = await render(<LoginScreen />);
    await fireEvent.press(r.getByTestId('role-DRIVER'));
    await fireEvent.changeText(r.getByTestId('phone-input'), '73 00 00 09');
    await fireEvent.press(r.getByText('Recevoir le code'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith({ pathname: '/verify', params: { phone: '+22673000009', role: 'DRIVER' } }));
  });

  it('comptes de démonstration : entreprises et livreurs, profil présélectionné', async () => {
    const r = await render(<LoginScreen />);
    expect(r.getByText('Entreprise · Le Verdoyant (restaurant)')).toBeTruthy();
    expect(r.getByText('Entreprise · Pharmacie du Progrès')).toBeTruthy();
    expect(r.queryByText(/Client ·/)).toBeNull();
    await fireEvent.press(r.getByTestId('demo-account-73000002'));
    expect(r.getByTestId('phone-input').props.value).toBe('73000002');
    expect(r.getByTestId('role-DRIVER').props.accessibilityState).toMatchObject({ selected: true });
  });

  it('session d’un ancien compte client : déconnexion avec un message d’accueil', async () => {
    mockAuth.status = 'signedIn';
    mockAuth.user = user('CLIENT');
    await render(<LoginScreen />);
    expect(mockAuth.signOut).toHaveBeenCalledWith(CLIENT_ACCOUNT_MESSAGE);
  });

  it('le message s’affiche sur l’écran de connexion', async () => {
    mockAuth.notice = CLIENT_ACCOUNT_MESSAGE;
    const r = await render(<LoginScreen />);
    expect(r.getByText(CLIENT_ACCOUNT_MESSAGE)).toBeTruthy();
    expect(CLIENT_ACCOUNT_MESSAGE).toMatch(/réservé aux entreprises et aux livreurs.*lien de suivi/);
  });
});

describe('Code de vérification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams.phone = '+22672000001';
  });

  it('compte client existant : pas d’espace, retour à la connexion avec le message', async () => {
    mockParams.role = 'SELLER';
    mockAuth.api.verifyOtp.mockResolvedValue({ accessToken: 't', tokenType: 'Bearer', expiresIn: 3600, isNewUser: false, user: user('CLIENT') });
    const r = await render(<VerifyScreen />);
    await fireEvent.press(r.getByText('Valider'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));
    expect(mockAuth.api.verifyOtp).toHaveBeenCalledWith({ phone: '+22672000001', code: '123456', role: 'SELLER' });
    expect(mockAuth.signOut).toHaveBeenCalledWith(CLIENT_ACCOUNT_MESSAGE);
    expect(mockAuth.signIn).not.toHaveBeenCalled();
  });

  it('entreprise : espace Entreprise ; un rôle inconnu dans le lien ne crée jamais de compte client', async () => {
    mockParams.role = 'CLIENT';
    mockAuth.api.verifyOtp.mockResolvedValue({ accessToken: 't', tokenType: 'Bearer', expiresIn: 3600, isNewUser: true, user: user('SELLER') });
    const r = await render(<VerifyScreen />);
    expect(r.getByTestId('signup-role')).toHaveTextContent(/compte 🏪 Entreprise sera créé/);
    await fireEvent.press(r.getByText('Valider'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/business'));
    expect(mockAuth.api.verifyOtp).toHaveBeenCalledWith(expect.objectContaining({ role: 'SELLER' }));
    expect(mockAuth.signIn).toHaveBeenCalled();
  });
});
