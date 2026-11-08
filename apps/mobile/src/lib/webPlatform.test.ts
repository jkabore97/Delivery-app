import { Alert } from 'react-native';
import { confirmAsync, notify } from './dialog';
import { storageForPlatform, webStorageBackend } from './secureStorage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(async () => 'from-secure-store'),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    map: m,
  };
}

describe('stockage de session sur le web', () => {
  it('web : localStorage', async () => {
    const ls = memoryStorage();
    const store = webStorageBackend(ls);
    await store.setItem('yaar.session', 'abc');
    expect(ls.map.get('yaar.session')).toBe('abc');
    expect(await store.getItem('yaar.session')).toBe('abc');
    await store.deleteItem('yaar.session');
    expect(await store.getItem('yaar.session')).toBeNull();
  });

  it('localStorage inaccessible (navigation privée, quota) : repli en mémoire sans erreur', async () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => {
        throw new Error('SecurityError');
      },
    };
    const store = webStorageBackend(broken);
    await expect(store.setItem('k', 'v')).resolves.toBeUndefined();
    expect(await store.getItem('k')).toBe('v');
    await store.deleteItem('k');
    expect(await store.getItem('k')).toBeNull();
    const none = webStorageBackend(null);
    await none.setItem('k', 'v');
    expect(await none.getItem('k')).toBe('v');
  });

  it('Android / iOS : expo-secure-store', async () => {
    expect(await storageForPlatform('android').getItem('k')).toBe('from-secure-store');
    expect(await storageForPlatform('ios').getItem('k')).toBe('from-secure-store');
  });
});

describe('confirmAsync / notify', () => {
  afterEach(() => jest.restoreAllMocks());

  it('web : window.confirm (Alert.alert ne fait rien sur le web)', async () => {
    const confirm = jest.fn(() => true);
    (globalThis as unknown as { window: unknown }).window = { confirm, alert: jest.fn() };
    const alert = jest.spyOn(Alert, 'alert');
    await expect(confirmAsync({ title: 'Annuler la commande', message: 'Vraiment ?' }, 'web')).resolves.toBe(true);
    expect(confirm).toHaveBeenCalledWith('Annuler la commande\n\nVraiment ?');
    confirm.mockReturnValueOnce(false);
    await expect(confirmAsync({ title: 'Supprimer' }, 'web')).resolves.toBe(false);
    expect(alert).not.toHaveBeenCalled();
    notify('SOS envoyé', 'Restez en sécurité.', 'web');
    expect((globalThis as unknown as { window: { alert: jest.Mock } }).window.alert).toHaveBeenCalledWith(
      'SOS envoyé\n\nRestez en sécurité.',
    );
  });

  it('natif : Alert.alert avec Annuler / Confirmer', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const p = confirmAsync({ title: 'Envoyer un SOS ?', confirmText: 'Envoyer le SOS', destructive: true }, 'android');
    const buttons = alert.mock.calls[0]?.[2] ?? [];
    expect(buttons.map((b) => b.text)).toEqual(['Annuler', 'Envoyer le SOS']);
    expect(buttons[1]?.style).toBe('destructive');
    buttons[1]?.onPress?.();
    await expect(p).resolves.toBe(true);

    const p2 = confirmAsync({ title: 'Déconnexion' }, 'ios');
    (alert.mock.calls[1]?.[2] ?? [])[0]?.onPress?.();
    await expect(p2).resolves.toBe(false);
  });
});
