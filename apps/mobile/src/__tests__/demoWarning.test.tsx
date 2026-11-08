import { render } from '@testing-library/react-native';
import { DEMO_DATA_WARNING, type PublicConfigDto } from '@yaar/shared';
import DriverDocuments from '../app/driver/(tabs)/documents';
import { DemoNotice } from '../components/DemoNotice';
import { driverProfile } from './fixtures';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, Redirect: () => null }));
jest.mock('../lib/photo', () => ({ capturePhoto: jest.fn(async () => null) }));
jest.mock('../state/auth', () => ({ useApi: () => ({ uploadDocument: jest.fn() }) }));
const mockDriver = { profile: driverProfile({ isOnline: false }), setProfile: jest.fn() };
jest.mock('../state/driver', () => ({ useDriver: () => mockDriver }));
const mockConfig: { config: PublicConfigDto | null } = { config: null };
jest.mock('../state/config', () => ({ useAppConfig: () => mockConfig }));

const demo: PublicConfigDto = { realtime: 'poll', pollIntervalMs: 4000, demoMode: true, otpChannel: 'console' };

describe('avertissement « démonstration publique »', () => {
  it('écran de connexion (DemoNotice) : code 123456 et avertissement', async () => {
    const r = await render(<DemoNotice onPick={jest.fn()} />);
    expect(r.getByText('Mode démo : utilisez le code 123456')).toBeTruthy();
    expect(r.getByTestId('demo-data-warning').props.children).toEqual(['⚠️ ', DEMO_DATA_WARNING]);
  });

  it('dépôt des pièces KYC : affiché en mode démo seulement', async () => {
    mockConfig.config = demo;
    const withDemo = await render(<DriverDocuments />);
    expect(withDemo.getByText(`⚠️ ${DEMO_DATA_WARNING}`)).toBeTruthy();
    withDemo.unmount();

    mockConfig.config = { ...demo, demoMode: false };
    const real = await render(<DriverDocuments />);
    expect(real.queryByText(`⚠️ ${DEMO_DATA_WARNING}`)).toBeNull();
    expect(real.getByText('Mes documents')).toBeTruthy();
  });
});
