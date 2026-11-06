import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import type { UserDto } from '@yaar/shared';
import { RoleGuard } from '../components/RoleGuard';

jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return { Redirect: ({ href }: { href: string }) => <RNText>{`redirect:${href}`}</RNText> };
});

let mockAuth: { status: string; user: UserDto | null } = { status: 'loading', user: null };
jest.mock('../state/auth', () => ({ useAuth: () => mockAuth }));

const user = (role: UserDto['role']): UserDto => ({
  id: 'u1',
  phone: '+22670000001',
  name: 'Test',
  role,
  isSuspended: false,
  suspensionReason: null,
  createdAt: '2026-11-01T00:00:00.000Z',
});

const guarded = (
  <RoleGuard role="DRIVER">
    <Text>espace livreur</Text>
  </RoleGuard>
);

describe('RoleGuard', () => {
  it('chargement : ni contenu ni redirection', async () => {
    mockAuth = { status: 'loading', user: null };
    const r = await render(guarded);
    expect(r.queryByText('espace livreur')).toBeNull();
    expect(r.queryByText(/redirect:/)).toBeNull();
  });

  it('déconnecté : vers /login', async () => {
    mockAuth = { status: 'signedOut', user: null };
    const r = await render(guarded);
    expect(r.getByText('redirect:/login')).toBeTruthy();
  });

  it('bon rôle : contenu affiché', async () => {
    mockAuth = { status: 'signedIn', user: user('DRIVER') };
    const r = await render(guarded);
    expect(r.getByText('espace livreur')).toBeTruthy();
  });

  it('autre rôle : redirigé vers son espace, jamais vers le contenu', async () => {
    mockAuth = { status: 'signedIn', user: user('CLIENT') };
    const r = await render(guarded);
    expect(r.queryByText('espace livreur')).toBeNull();
    expect(r.getByText(/redirect:\/client/)).toBeTruthy();
  });

  it('contrôleur : renvoyé à la connexion (pas d’espace mobile)', async () => {
    mockAuth = { status: 'signedIn', user: user('CONTROLLER') };
    const r = await render(guarded);
    expect(r.queryByText('espace livreur')).toBeNull();
    expect(r.getByText('redirect:/login')).toBeTruthy();
  });
});
