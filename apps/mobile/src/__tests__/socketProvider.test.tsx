import { act, render } from '@testing-library/react-native';
import { SocketProvider } from '../state/socket';

type Listener = (arg: { message: string }) => void;
const mockListeners: Record<string, Listener> = {};
const mockSocket = {
  on: jest.fn((event: string, l: Listener) => {
    mockListeners[event] = l;
  }),
  removeAllListeners: jest.fn(),
  disconnect: jest.fn(),
};
jest.mock('../lib/socket', () => ({ createSocket: jest.fn(() => mockSocket) }));
jest.mock('../config', () => ({ API_URL: 'http://test' }));

const mockSignOut = jest.fn(async () => undefined);
jest.mock('../state/auth', () => ({ useAuth: () => ({ token: 'jwt', signOut: mockSignOut }) }));

describe('SocketProvider : déconnexion forcée', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ACCOUNT_SUSPENDED au connect : déconnexion avec message', async () => {
    await render(<SocketProvider>{null}</SocketProvider>);
    await act(async () => mockListeners.connect_error?.({ message: 'ACCOUNT_SUSPENDED' }));
    expect(mockSignOut).toHaveBeenCalledWith('Votre compte est suspendu.');
  });

  it('UNAUTHENTICATED au connect : session expirée', async () => {
    await render(<SocketProvider>{null}</SocketProvider>);
    await act(async () => mockListeners.connect_error?.({ message: 'UNAUTHENTICATED' }));
    expect(mockSignOut).toHaveBeenCalledWith('Session expirée, reconnectez-vous.');
  });

  it('erreur réseau : pas de déconnexion', async () => {
    await render(<SocketProvider>{null}</SocketProvider>);
    await act(async () => mockListeners.connect_error?.({ message: 'xhr poll error' }));
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});
