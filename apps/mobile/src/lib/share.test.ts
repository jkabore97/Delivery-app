import { Share } from 'react-native';
import {
  copyText,
  recipientCallName,
  recipientWhatsappText,
  shareFeedback,
  shareButtonShortLabel,
  shareOrCopyTrackingLink,
  shareButtonLabel,
  shareTrackingLink,
  trackingShareMessage,
  whatsappUrl,
  type ShareEnv,
} from './share';

const URL_ = 'https://yaar-livraison.vercel.app/suivi/tok-abc';
const input = { url: URL_, recipientName: 'Awa Kaboré', recipientPhone: '+22670112233', businessName: 'Pharmacie du Centre' };

function env(over: Partial<ShareEnv> = {}): ShareEnv & { opened: string[] } {
  const opened: string[] = [];
  return {
    platform: 'web',
    nativeShare: jest.fn(async () => ({ action: Share.sharedAction })),
    navigator: null,
    openUrl: jest.fn(async (u: string) => {
      opened.push(u);
    }),
    document: null,
    opened,
    ...over,
  };
}

describe('message et lien WhatsApp', () => {
  it('message avec le prénom, l’entreprise et le lien', () => {
    expect(trackingShareMessage(input)).toBe(
      'Bonjour Awa, Pharmacie du Centre vous envoie un colis avec Yaar Livraison. Suivez votre livreur en direct (le code à lui donner s’affiche sur la page) : https://yaar-livraison.vercel.app/suivi/tok-abc',
    );
  });

  it('destinataire entreprise : son nom complet (« Bureau Faso Conseil », pas « Bureau »)', () => {
    expect(trackingShareMessage({ ...input, recipientName: 'Bureau Faso Conseil', recipientIsBusiness: true })).toMatch(
      /^Bonjour Bureau Faso Conseil, Pharmacie du Centre vous envoie/,
    );
    expect(recipientCallName('  Awa   Kaboré ', false)).toBe('Awa');
    expect(recipientCallName('Bureau  Faso Conseil', true)).toBe('Bureau Faso Conseil');
    expect(recipientCallName(null, true)).toBe('');
  });

  it('wa.me avec les chiffres du numéro (indicatif compris) et le texte encodé', () => {
    expect(whatsappUrl('70 11 22 33', 'Suivi : https://x/y?z=1')).toBe(
      'https://wa.me/22670112233?text=Suivi%20%3A%20https%3A%2F%2Fx%2Fy%3Fz%3D1',
    );
    expect(whatsappUrl(null, 'a')).toBe('https://wa.me/?text=a');
  });
});

describe('envoi du lien de suivi', () => {
  it('Android / iOS : feuille de partage du système', async () => {
    const e = env({ platform: 'android' });
    await expect(shareTrackingLink(input, e)).resolves.toBe('shared');
    expect(e.nativeShare).toHaveBeenCalledWith({ message: trackingShareMessage(input), title: 'Suivi de livraison' });
    const dismissed = env({ platform: 'ios', nativeShare: jest.fn(async () => ({ action: Share.dismissedAction })) });
    await expect(shareTrackingLink(input, dismissed)).resolves.toBe('dismissed');
  });

  it('web avec navigator.share : partage natif du navigateur (lien à part)', async () => {
    const share = jest.fn(async () => undefined);
    const e = env({ navigator: { share } });
    await expect(shareTrackingLink(input, e)).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: URL_, title: 'Suivi de livraison · Yaar Livraison' }));
    expect(e.opened).toEqual([]);
  });

  it('web : partage annulé par l’utilisateur → rien d’autre ; partage refusé → WhatsApp', async () => {
    const abort = Object.assign(new Error('annulé'), { name: 'AbortError' });
    const cancelled = env({ navigator: { share: jest.fn(async () => Promise.reject(abort)) } });
    await expect(shareTrackingLink(input, cancelled)).resolves.toBe('dismissed');
    expect(cancelled.opened).toEqual([]);
    const refused = env({ navigator: { share: jest.fn(async () => Promise.reject(new Error('NotAllowedError'))) } });
    await expect(shareTrackingLink(input, refused)).resolves.toBe('whatsapp');
    expect(refused.opened[0]).toMatch(/^https:\/\/wa\.me\/22670112233\?text=/);
  });

  it('web sans navigator.share : lien WhatsApp vers le destinataire, message prérempli', async () => {
    const e = env();
    await expect(shareTrackingLink(input, e)).resolves.toBe('whatsapp');
    expect(e.opened).toEqual([whatsappUrl('+22670112233', trackingShareMessage(input))]);
    expect(decodeURIComponent(e.opened[0]!.split('text=')[1]!)).toContain(URL_);
    expect(shareButtonLabel(e)).toBe('Envoyer le lien de suivi par WhatsApp');
    expect(shareButtonLabel(env({ navigator: { share: jest.fn() } }))).toBe('Envoyer le lien de suivi au destinataire');
    expect(shareButtonLabel(env({ platform: 'android' }))).toBe('Envoyer le lien de suivi au destinataire');
  });
});

describe('« Copier le lien »', () => {
  it('API presse-papiers', async () => {
    const writeText = jest.fn(async () => undefined);
    await expect(copyText(URL_, env({ navigator: { clipboard: { writeText } } }))).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(URL_);
  });

  it('presse-papiers refusé : zone de texte + execCommand ; sans document : échec signalé', async () => {
    const area = { value: '', style: {} as Record<string, string>, setAttribute: jest.fn(), select: jest.fn() };
    const doc = {
      body: { appendChild: jest.fn(), removeChild: jest.fn() },
      createElement: jest.fn(() => area),
      execCommand: jest.fn(() => true),
    } as unknown as Document;
    const e = env({ navigator: { clipboard: { writeText: jest.fn(async () => Promise.reject(new Error('denied'))) } }, document: doc });
    await expect(copyText(URL_, e)).resolves.toBe(true);
    expect(area.value).toBe(URL_);
    expect(doc.execCommand).toHaveBeenCalledWith('copy');
    await expect(copyText(URL_, env())).resolves.toBe(false);
  });
});

describe('boutons des livraisons de l’entreprise', () => {
  it('WhatsApp au destinataire : message du lien de suivi, sinon bonjour avec le numéro du colis', () => {
    expect(recipientWhatsappText(input)).toBe(trackingShareMessage(input));
    expect(recipientWhatsappText({ ...input, url: null, orderNumber: 1052 })).toBe(
      'Bonjour Awa, Pharmacie du Centre vous envoie un colis (#1052) avec Yaar Livraison.',
    );
    expect(recipientWhatsappText({ url: null, recipientName: null, businessName: null })).toBe(
      'Bonjour, votre expéditeur vous envoie un colis avec Yaar Livraison.',
    );
  });

  it('« Partager le lien » : partage du téléphone ; ordinateur sans partage : lien copié (pas WhatsApp)', async () => {
    const phone = env({ platform: 'android' });
    await expect(shareOrCopyTrackingLink(input, phone)).resolves.toBe('shared');
    const writeText = jest.fn(async () => undefined);
    const desktop = env({ navigator: { clipboard: { writeText } } });
    await expect(shareOrCopyTrackingLink(input, desktop)).resolves.toBe('copied');
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(desktop.opened).toEqual([]);
    await expect(shareOrCopyTrackingLink(input, env())).resolves.toBe('failed');
    expect(shareFeedback('copied')).toBe('Lien copié ✓');
    expect(shareFeedback('shared')).toBe('Lien envoyé.');
    expect(shareFeedback('dismissed')).toBeNull();
    expect(shareButtonShortLabel(env())).toBe('Envoyer par WhatsApp');
    expect(shareButtonShortLabel(env({ platform: 'android' }))).toBe('Envoyer le lien de suivi');
  });
});
