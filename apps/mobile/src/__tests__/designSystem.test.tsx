import { Linking, StyleSheet, Text } from 'react-native';
import { act, fireEvent, render, within } from '@testing-library/react-native';
import { BUSINESS_ACCENT, ORANGE_INK, ORANGE_TEXT } from '../components/business/accent';
import { CountdownRing } from '../components/design/CountdownRing';
import { PackageCard } from '../components/design/PackageCard';
import { Pill } from '../components/design/Pill';
import { RoundButton } from '../components/design/RoundButton';
import { AmountRow } from '../components/design/Surfaces';
import { touchTarget } from '../lib/touchTarget';
import { colors, dark, MIN_TOUCH } from '../theme';

/** Contraste WCAG entre deux couleurs #RRGGBB. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe('couleurs des surfaces sombres', () => {
  it('textes lisibles (4,5:1 au moins) sur le fond, les feuilles et les cartes relevées', () => {
    for (const bg of [dark.background, dark.surface, dark.raised]) {
      for (const fg of [dark.text, dark.textMuted, dark.textFaint, dark.green, dark.amber, dark.red]) {
        expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(dark.textFaint, dark.raised)).toBeCloseTo(4.64, 1);
  });

  it('petits textes des écrans de l’entreprise et du destinataire : 4,5:1 au moins là où ils sont posés', () => {
    // Fond de la carte « Prévenez le destinataire » (ShareTrackingCard mise en avant).
    const PROMINENT = '#13261E';
    const pairs: [string, string, string][] = [
      ['sur-titre et ligne du livreur des cartes (textFaint / raised)', dark.textFaint, dark.raised],
      ['date et frais de l’historique (textFaint / raised)', dark.textFaint, dark.raised],
      ['note de l’historique (textFaint / background)', dark.textFaint, dark.background],
      ['texte indicatif des champs sombres (textFaint / raised)', dark.textFaint, dark.raised],
      ['aide sous un champ, titres de section (textFaint / surface)', dark.textFaint, dark.surface],
      ['lien de suivi sur la carte mise en avant (textMuted / #13261E)', dark.textMuted, PROMINENT],
      ['textFaint sur la carte mise en avant, s’il y servait', dark.textFaint, PROMINENT],
      ['« + Nouvelle », disque et boutons orange (ORANGE_INK / orange)', ORANGE_INK, BUSINESS_ACCENT],
      ['texte orange sur blanc (ORANGE_TEXT)', ORANGE_TEXT, colors.white],
    ];
    for (const [what, fg, bg] of pairs) expect([what, contrast(fg, bg) >= 4.5]).toEqual([what, true]);
    // Pourquoi ORANGE_INK / ORANGE_TEXT : le blanc sur l'orange et l'orange sur le blanc n'atteignent pas 3:1.
    expect(contrast(colors.white, BUSINESS_ACCENT)).toBeLessThan(3);
  });
});

describe('zones tactiles de 56 px (lib/touchTarget)', () => {
  it('natif : hitSlop ; web (qui ignore hitSlop) : marge intérieure compensée par une marge négative', () => {
    expect(touchTarget(48, MIN_TOUCH, 'android')).toEqual({ hitSlop: 4 });
    expect(touchTarget(48, MIN_TOUCH, 'web')).toEqual({ style: { padding: 4, margin: -4 } });
    expect(touchTarget(44, MIN_TOUCH, 'web')).toEqual({ style: { padding: 6, margin: -6 } });
    expect(touchTarget(64, MIN_TOUCH, 'web')).toEqual({});
  });
});

describe('RoundButton', () => {
  it('libellé sous le disque, accessibilité, action', async () => {
    const onPress = jest.fn();
    const r = await render(<RoundButton label="Livré" icon="check" size="big" tone="primary" onPress={onPress} testID="b" />);
    expect(r.getByText('Livré')).toBeTruthy();
    expect(r.getByTestId('b').props.accessibilityLabel).toBe('Livré');
    await act(async () => fireEvent.press(r.getByTestId('b')));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('inactif ou en chargement : aucune action, état annoncé', async () => {
    const onPress = jest.fn();
    const r = await render(
      <>
        <RoundButton label="Appeler" icon="phone" onPress={onPress} disabled testID="off" />
        <RoundButton label="Récupéré" icon="check" onPress={onPress} loading testID="busy" />
      </>,
    );
    await act(async () => fireEvent.press(r.getByTestId('off')));
    await act(async () => fireEvent.press(r.getByTestId('busy')));
    expect(onPress).not.toHaveBeenCalled();
    expect(r.getByTestId('off').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(r.getByTestId('busy').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true, busy: true }));
    expect(r.queryByText('Récupéré')).toBeTruthy(); // libellé gardé sous le disque pendant le chargement
  });

  it('bouton icône : libellé seulement pour l’accessibilité ; libellé et légende dans le disque', async () => {
    const r = await render(
      <>
        <RoundButton label="WhatsApp" icon="chat" size="small" showLabel={false} onPress={jest.fn()} testID="icon" />
        <RoundButton label="Accepter" caption="28 s" icon="check" diameter={128} labelInside onPress={jest.fn()} testID="hero" />
      </>,
    );
    expect(r.queryByText('WhatsApp')).toBeNull();
    expect(r.getByTestId('icon').props.accessibilityLabel).toBe('WhatsApp');
    expect(r.getByTestId('hero')).toHaveTextContent('Accepter28 s');
  });
});

describe('Pill', () => {
  it('étiquette simple, ou bouton avec état inactif', async () => {
    const onPress = jest.fn();
    const r = await render(
      <>
        <Pill label="≈ 6 min · 2,1 km" icon="clock" testID="tag" />
        <Pill label="Refuser" icon="close" tone="red" size="lg" onPress={onPress} testID="btn" />
        <Pill label="Refuser" tone="red" onPress={onPress} disabled testID="off" />
      </>,
    );
    expect(r.getByTestId('tag')).toHaveTextContent('≈ 6 min · 2,1 km');
    await act(async () => fireEvent.press(r.getByTestId('btn')));
    await act(async () => fireEvent.press(r.getByTestId('off')));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('grande pastille d’action : 56 px de haut au moins (cible tactile minimale, ex. « Refuser »)', async () => {
    const r = await render(<Pill label="Refuser" icon="close" tone="red" size="lg" onPress={jest.fn()} testID="lg" />);
    const body = r.getByTestId('lg').children[0] as unknown as { props: { style: unknown } };
    expect(StyleSheet.flatten(body.props.style as never)).toMatchObject({ minHeight: MIN_TOUCH });
    expect(MIN_TOUCH).toBe(56);
  });

  it('étiquette avec libellé d’accessibilité : un seul élément annoncé, avec ce libellé', async () => {
    const r = await render(
      <>
        <Pill label="Nouvelle course" accessibilityLabel="Nouvelle course, Moto" testID="labelled" />
        <Pill label="En ligne : suivi GPS actif" live testID="plain" />
      </>,
    );
    expect(r.getByTestId('labelled').props).toMatchObject({ accessible: true, accessibilityRole: 'text', accessibilityLabel: 'Nouvelle course, Moto' });
    expect(r.getByLabelText('Nouvelle course, Moto')).toBe(r.getByTestId('labelled'));
    // Sans libellé : le texte visible est lu tel quel (pas de regroupement).
    expect(r.getByTestId('plain').props.accessible).toBe(false);
  });
});

describe('PackageCard', () => {
  it('nom, initiales, adresse et repère, état, colis, instructions, montant', async () => {
    const r = await render(
      <PackageCard
        kicker="Course #1052"
        status={{ label: 'EN LIVRAISON', tone: 'green' }}
        name="Awa Kaboré"
        address="Patte d’Oie, rue 15.23"
        landmark="Station Total"
        description="2 boîtes de médicaments"
        notes="Appeler en arrivant"
        amount={{ label: 'À encaisser', value: 16500 }}
        testID="card"
      />,
    );
    expect(r.getByTestId('card')).toHaveTextContent(
      /AK.*Course #1052.*EN LIVRAISON.*Awa Kaboré.*Patte d’Oie, rue 15\.23.*Repère : Station Total.*2 boîtes de médicaments.*« Appeler en arrivant ».*À encaisser.*16 500 FCFA/,
    );
    // Pas de numéro fourni : pas de boutons de contact.
    expect(r.queryByLabelText(/Appeler/)).toBeNull();
  });

  it('boutons ronds WhatsApp et Appeler ; inactifs sans numéro', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const r = await render(<PackageCard name="Awa Kaboré" phone="+22670112233" whatsappText="Bonjour" />);
    await act(async () => fireEvent.press(r.getByLabelText('Écrire sur WhatsApp (+22670112233)')));
    expect(open).toHaveBeenLastCalledWith('https://wa.me/22670112233?text=Bonjour');
    await act(async () => fireEvent.press(r.getByLabelText('Appeler (+22670112233)')));
    expect(open).toHaveBeenLastCalledWith('tel:+22670112233');
    open.mockClear();
    const none = await render(<PackageCard name="Awa Kaboré" phone={null} />);
    await act(async () => fireEvent.press(none.getByLabelText('Appeler : numéro indisponible')));
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  it('carte qui ouvre un détail ET boutons de contact : deux voisins, jamais un bouton dans un bouton', async () => {
    const onPress = jest.fn();
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    const r = await render(
      <PackageCard
        compact
        kicker="#1052"
        status={{ label: 'EN LIVRAISON', tone: 'green' }}
        name="Awa Kaboré"
        description="Arrivée vers 14:29 · dans 9 min"
        address="Patte d’Oie, rue 15.23"
        landmark="Station Total"
        meta="Livreur : Issouf · Moto"
        phone="+22670112233"
        contactName="Awa Kaboré"
        onPress={onPress}
        accessibilityLabel="Awa Kaboré, en livraison, arrivée vers 14:29, dans 9 min"
        testID="card"
      />,
    );
    const main = r.getByTestId('card');
    expect(main.props.accessibilityRole).toBe('button');
    expect(main.props.accessibilityLabel).toBe('Awa Kaboré, en livraison, arrivée vers 14:29, dans 9 min');
    // Liste dense : numéro et état, nom, heure d'arrivée juste dessous, adresse, repère, livreur.
    expect(main).toHaveTextContent(/^#1052EN LIVRAISONAKAwa KaboréArrivée vers 14:29 · dans 9 minPatte d’Oie, rue 15\.23Repère : Station TotalLivreur : Issouf · Moto$/);
    expect(within(main).queryByLabelText(/WhatsApp|Appeler/)).toBeNull();
    const card = r.getByTestId('card-card');
    await act(async () => fireEvent.press(within(card).getByLabelText('Appeler Awa Kaboré (+22670112233)')));
    expect(open).toHaveBeenLastCalledWith('tel:+22670112233');
    expect(onPress).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(main));
    expect(onPress).toHaveBeenCalledTimes(1);
    open.mockRestore();
  });

  it('sans boutons de contact (livreur, historique) : la carte entière reste le bouton, libellé = nom par défaut', async () => {
    const onPress = jest.fn();
    const r = await render(<PackageCard name="Pharmacie du Centre" kicker="Course #1052" onPress={onPress} testID="card" />);
    expect(r.getByTestId('card').props.accessibilityLabel).toBe('Pharmacie du Centre');
    expect(r.queryByTestId('card-card')).toBeNull();
    await act(async () => fireEvent.press(r.getByTestId('card')));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('pastille : pictogramme à la place des initiales (colis sans entreprise ni nom)', async () => {
    const r = await render(<PackageCard name="Colis" avatarIcon="package" testID="card" />);
    expect(r.getByTestId('card-avatar-icon')).toBeTruthy();
    expect(r.queryByText('C')).toBeNull();
    const named = await render(<PackageCard name="Pharmacie du Centre" testID="named" />);
    expect(named.getByText('PC')).toBeTruthy();
    expect(named.queryByTestId('named-avatar-icon')).toBeNull();
  });
});

describe('AmountRow', () => {
  it('montant exact sous `<testID>-value` (vérifications de bout en bout)', async () => {
    const r = await render(<AmountRow hero label="Encaissez" amount={16500} detail="En espèces." testID="amount" />);
    expect(r.getByTestId('amount-value')).toHaveTextContent('16 500 FCFA');
    expect(r.getByTestId('amount')).toHaveTextContent(/Encaissez.*16 500 FCFA.*En espèces\./);
  });
});

describe('CountdownRing', () => {
  beforeEach(() => jest.useFakeTimers({ now: Date.parse('2026-11-06T09:43:00.000Z') }));
  afterEach(() => jest.useRealTimers());

  it('se vide d’elle-même (horloge interne) et donne l’état à son contenu', async () => {
    const seen: number[] = [];
    const r = await render(
      <CountdownRing startAt="2026-11-06T09:43:00.000Z" endAt="2026-11-06T09:43:30.000Z" size={150} testID="ring">
        {({ secondsLeft, warning }) => {
          seen.push(secondsLeft);
          return <Text testID="inside">{`${secondsLeft}${warning ? '!' : ''}`}</Text>;
        }}
      </CountdownRing>,
    );
    expect(r.getByTestId('inside')).toHaveTextContent('30');
    await act(async () => {
      jest.advanceTimersByTime(25_500);
    });
    expect(r.getByTestId('inside')).toHaveTextContent('5!');
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(r.getByTestId('inside')).toHaveTextContent('0');
    // Anneau vide : plus d'arc dessiné.
    expect(r.queryByTestId('ring-arc')).toBeNull();
    expect(Math.min(...seen)).toBe(0);
  });

  it('contenu recalculé à chaque seconde seulement, pas à chaque image de l’anneau ; anneau à côté du contenu', async () => {
    let calls = 0;
    const r = await render(
      <CountdownRing startAt="2026-11-06T09:43:00.000Z" endAt="2026-11-06T09:43:30.000Z" size={150} fps={15} testID="ring">
        {({ secondsLeft }) => {
          calls++;
          return <Text testID="inside">{secondsLeft}</Text>;
        }}
      </CountdownRing>,
    );
    const arcBefore = r.getByTestId('ring-arc').props.d as string;
    const before = calls;
    // 2,1 s par pas de 50 ms : une trentaine d'images de l'anneau, deux changements de seconde (30 → 29 → 28).
    for (let i = 0; i < 42; i++) {
      await act(async () => {
        jest.advanceTimersByTime(50);
      });
    }
    expect(r.getByTestId('inside')).toHaveTextContent('28');
    expect(r.getByTestId('ring-arc').props.d).not.toBe(arcBefore);
    expect(calls - before).toBe(2);
    // Barre de progression (l'anneau) posée derrière le contenu, pas autour : ses enfants ne seraient pas lus.
    expect(r.getByTestId('ring').props.accessibilityRole).toBe('progressbar');
    expect(within(r.getByTestId('ring')).queryByTestId('inside')).toBeNull();
  });
});
