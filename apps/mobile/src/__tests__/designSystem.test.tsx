import { Linking, Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { CountdownRing } from '../components/design/CountdownRing';
import { PackageCard } from '../components/design/PackageCard';
import { Pill } from '../components/design/Pill';
import { RoundButton } from '../components/design/RoundButton';
import { AmountRow } from '../components/design/Surfaces';

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
});
