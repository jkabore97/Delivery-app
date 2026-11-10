import { useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import { Text } from '../../components/Text';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  distanceM,
  LABELS,
  OUAGADOUGOU_CENTER,
  OUAGADOUGOU_NEIGHBOURHOODS,
  type AddressDto,
  type FeePayer,
  type QuoteOptionDto,
  type QuoteResponse,
  type VehicleType,
} from '@yaar/shared';
import { zoneName } from '../../components/AddressPicker';
import { ChoiceRow, DarkBanner, DarkField, SectionLabel } from '../../components/business/DarkForm';
import { PAGE_PADDING, TILE_GAP, useIsDesktop } from '../../components/business/desktop/layout';
import { MapTile } from '../../components/business/desktop/MapTile';
import { PageHeader } from '../../components/business/desktop/PageHeader';
import { BusinessMark } from '../../components/business/parts';
import { Icon } from '../../components/design/Icon';
import { MapIconButton, Pill } from '../../components/design/Pill';
import { AmountRow } from '../../components/design/Surfaces';
import { CenterPin } from '../../components/map/CenterPin';
import { avatarInitials } from '../../components/map/markerArt';
import { PickerMap, type PickerMapHandle } from '../../components/map/PickerMap';
import { StoreApprovalBanner } from '../../components/StoreApprovalBanner';
import { VEHICLE_HINT, VEHICLE_ICON } from '../../components/VehicleOptions';
import { useDeliveryQuote } from '../../hooks/useDeliveryQuote';
import { isPinAtDefault, toAddressInput } from '../../lib/address';
import { errorMessage } from '../../lib/api';
import {
  buildDeliveryInput,
  EMPTY_DELIVERY_FORM,
  FEE_PAYER_LABELS,
  hasErrors,
  parseAmount,
  pickupFromStore,
  pickVehicle,
  recipientPays,
  validateDestination,
  validatePackage,
  type DeliveryForm,
  type FormErrors,
} from '../../lib/delivery';
import { formatFcfa, formatKm } from '../../lib/format';
import { formatPhone } from '../../lib/phone';
import { useApi } from '../../state/auth';
import { isBusinessApproved, useBusiness } from '../../state/business';
import { MIN_TOUCH, palette, radii, SHEET_RADIUS, shadows, spacing, tabular, typography } from '../../theme';

const PACKAGE_SUGGESTIONS = ['Documents', 'Petit colis', 'Carton', 'Repas', 'Médicaments', 'Vêtements'];

type Step = 1 | 2 | 3;
type SetForm = (fn: (f: DeliveryForm) => DeliveryForm) => void;

const STEP_TITLES: Record<Step, string> = { 1: 'Où livrer ?', 2: 'Colis et prix', 3: 'Récapitulatif' };

/**
 * Nouvelle livraison (comme Uber Direct), en Cobalt : 1. destination sur la carte (épingle centrale, quartiers proches
 * en pastilles, destinataire), 2. colis, véhicule et prix (choix en pastilles, qui paie, montant à encaisser, ce que
 * paiera le destinataire en tuile soleil), 3. récapitulatif (trajet, montants) ; une grande pilule cobalt par étape.
 * Téléphone : carte en haut et feuille blanche à l'étape 1, écran plein ensuite. Ordinateur : la carte à gauche (épingle
 * à déplacer à l'étape 1, trajet ensuite) et le formulaire dans une colonne à droite.
 */
export default function NewDeliveryScreen() {
  const api = useApi();
  const { store, stores } = useBusiness();
  const desktop = useIsDesktop();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<DeliveryForm>(EMPTY_DELIVERY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof DeliveryForm>(k: K, v: DeliveryForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  // Un champ corrigé perd son message d'erreur tout de suite (la validation complète reste au « Continuer »).
  const clearError = (k: keyof FormErrors) =>
    setErrors((e) => {
      if (!e[k]) return e;
      const next = { ...e };
      delete next[k];
      return next;
    });

  const pickup = store ? { lat: store.lat, lng: store.lng } : null;
  // Retrait = l'établissement choisi (profil) : envoyé à l'API pour que le prix et le livreur correspondent.
  const pickupAddress = useMemo(
    () => pickupFromStore(store),
    [store?.id, store?.lat, store?.lng, store?.address, store?.landmark], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const quoteInput = useMemo(
    () =>
      step >= 2 && form.dropoff && form.dropoff.address.trim()
        ? { ...(pickupAddress ? { pickup: pickupAddress } : {}), dropoff: toAddressInput(form.dropoff) }
        : null,
    [step, form.dropoff, pickupAddress],
  );
  const { quote, error: quoteError, loading: quoteLoading } = useDeliveryQuote(quoteInput);
  const vehicle = quote ? pickVehicle(quote, form.vehicleType) : form.vehicleType;
  const option = quote?.options.find((o) => o.vehicleType === vehicle) ?? null;
  const picker = useDestinationPicker(form, setForm, pickup, clearError);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/business'));

  if (stores === undefined) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={palette.cobalt} />
      </SafeAreaView>
    );
  }
  if (!store) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]}>
        <Text style={styles.emptyTitle}>Créez d’abord le profil de votre entreprise (adresse de retrait).</Text>
        <Pill label="Mon profil d’entreprise" icon="store" tone="cobalt" size="lg" onPress={() => router.replace('/business/profile')} />
        <Pill label="Fermer" icon="close" tone="outline" onPress={close} />
      </SafeAreaView>
    );
  }

  const next = () => {
    setSubmitError(null);
    if (step === 1) {
      const e = validateDestination(form, pickup);
      setErrors(e);
      if (!hasErrors(e)) setStep(2);
      return;
    }
    if (step === 2) {
      const e = validatePackage({ ...form, vehicleType: vehicle }, quote);
      setErrors(e);
      if (!hasErrors(e)) {
        set('vehicleType', vehicle);
        setStep(3);
      }
    }
  };

  const back = () => {
    setErrors({});
    setSubmitError(null);
    if (step === 1) close();
    else setStep((s) => (s - 1) as Step);
  };

  const submit = async () => {
    // Entreprise pas encore validée ou prix inconnu : aucune demande (le bouton est aussi désactivé).
    if (!option || !isBusinessApproved(store)) return;
    const built = buildDeliveryInput({ ...form, vehicleType: vehicle }, pickupAddress);
    if (!built.ok) {
      setSubmitError(built.error);
      return;
    }
    setBusy(true);
    setSubmitError(null);
    try {
      const created = await api.createDelivery(built.input);
      router.replace({ pathname: '/business/livraison/[id]', params: { id: created.id, created: '1' } });
    } catch (e) {
      setSubmitError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const approved = isBusinessApproved(store);
  const fields =
    step === 1 ? (
      <DestinationFields form={form} setForm={setForm} errors={errors} clearError={clearError} picker={picker} storeBanner={approved ? null : <StoreApprovalBanner store={store} />} />
    ) : step === 2 ? (
      <PackageStep
        form={form}
        set={(k, v) => {
          set(k, v);
          // Champs sans message d'erreur (qui paie, instructions) : sans effet.
          clearError(k as keyof FormErrors);
        }}
        errors={errors}
        quote={quote}
        quoteError={quoteError}
        quoteLoading={quoteLoading}
        vehicle={vehicle}
        fee={option?.deliveryFee ?? null}
        storeName={store.name}
      />
    ) : (
      <SummaryStep form={form} storeName={store.name} storeAddress={store.address} quote={quote} vehicle={vehicle} />
    );
  const tail = (
    <>
      {!approved && step === 3 ? <StoreApprovalBanner store={store} /> : null}
      {submitError ? <DarkBanner message={submitError} /> : null}
    </>
  );
  const cta =
    step === 1 ? (
      <Pill label="Continuer" icon="chevronRight" tone="cobalt" size="lg" onPress={next} style={styles.stretch} testID="wizard-next" />
    ) : step === 2 ? (
      <Pill
        label={option ? `Continuer · ${formatFcfa(option.deliveryFee)}` : 'Continuer'}
        icon="chevronRight"
        tone="cobalt"
        size="lg"
        onPress={next}
        disabled={quoteLoading && !quote}
        style={styles.stretch}
        testID="wizard-next"
      />
    ) : (
      <Pill
        label="Demander un livreur"
        icon="check"
        tone="cobalt"
        size="lg"
        onPress={submit}
        loading={busy}
        disabled={!option || !approved}
        style={styles.stretch}
        testID="request-driver"
      />
    );

  if (desktop) {
    return <DesktopWizard step={step} onBack={back} onClose={close} form={form} picker={picker} store={store} fields={fields} tail={tail} cta={cta} />;
  }

  if (step === 1) {
    return <PhoneDestination picker={picker} onClose={close} fields={fields} cta={cta} />;
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <WizardHeader step={step} onBack={back} title={STEP_TITLES[step]} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {fields}
          {tail}
        </ScrollView>
        <View style={[styles.footer, shadows.sheet]}>{cta}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Trois pilules d'étape (cobalt jusqu'à l'étape en cours). */
function StepBars({ step }: { step: Step }) {
  return (
    <View style={styles.stepBars} accessibilityRole="progressbar" accessibilityLabel={`Étape ${step} sur 3`}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.stepBar, i <= step && styles.stepBarOn]} />
      ))}
    </View>
  );
}

/** « Étape 2 sur 3 », titre de l'étape et pilules : le même en-tête aux trois étapes. */
function StepTitle({ step, title, grow }: { step: Step; title: string; grow?: boolean }) {
  return (
    <View style={[styles.stepTitle, grow && styles.flex]}>
      <View style={styles.flex}>
        <Text style={styles.stepText} testID="wizard-step">
          Étape {step} sur 3
        </Text>
        <Text style={styles.headerTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      <StepBars step={step} />
    </View>
  );
}

function WizardHeader({ step, title, onBack }: { step: Step; title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <MapIconButton icon="back" onPress={onBack} accessibilityLabel="Retour" testID="wizard-back" />
      <StepTitle step={step} title={title} grow />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Destination                                                      */
/* ------------------------------------------------------------------ */

interface DestinationPicker {
  mapRef: RefObject<PickerMapHandle | null>;
  initial: { lat: number; lng: number };
  dropoff: AddressDto;
  moving: boolean;
  setMoving: (v: boolean) => void;
  onCenter: (lat: number, lng: number) => void;
  pinPlaced: boolean;
  bubble: { title: string; subtitle: string };
  suggestions: typeof OUAGADOUGOU_NEIGHBOURHOODS;
  /** L'utilisateur a modifié l'adresse : elle n'est plus remplacée par le nom du quartier. */
  touchAddress: () => void;
}

/** État du choix de la destination (épingle au centre de la carte, quartiers proches, adresse pré-remplie). */
function useDestinationPicker(form: DeliveryForm, setForm: SetForm, pickup: { lat: number; lng: number } | null, clearError: (k: keyof FormErrors) => void): DestinationPicker {
  const mapRef = useRef<PickerMapHandle>(null);
  const [moving, setMoving] = useState(false);
  /** Adresse préremplie avec le nom du quartier (remplacée tant que l'utilisateur ne l'a pas modifiée). */
  const autoAddress = useRef<string | null>(null);
  const [initial] = useState(() => form.dropoff ?? pickup ?? OUAGADOUGOU_CENTER);
  const dropoff: AddressDto = form.dropoff ?? { lat: initial.lat, lng: initial.lng, address: '', landmark: '' };

  const suggestions = useMemo(() => {
    const ref = pickup ?? OUAGADOUGOU_CENTER;
    return [...OUAGADOUGOU_NEIGHBOURHOODS].sort((a, b) => distanceM(ref, a) - distanceM(ref, b)).slice(0, 9);
  }, [pickup?.lat, pickup?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  const onCenter = (lat: number, lng: number) => {
    setMoving(false);
    clearError('dropoff');
    setForm((f) => {
      const cur = f.dropoff ?? dropoff;
      const zone = zoneName({ lat, lng });
      const auto = !cur.address.trim() || cur.address === autoAddress.current;
      const placed = !isPinAtDefault({ lat, lng }) && !(pickup && distanceM(pickup, { lat, lng }) < 30);
      const address = auto && placed && zone !== 'Hors des quartiers connus' ? zone : cur.address;
      if (auto && address !== cur.address) autoAddress.current = address;
      return { ...f, dropoff: { ...cur, lat, lng, address } };
    });
  };

  const pinPlaced = !!form.dropoff && !isPinAtDefault(form.dropoff) && !(pickup && distanceM(pickup, form.dropoff) < 30);
  const bubble = pinPlaced
    ? { title: zoneName(dropoff), subtitle: dropoff.address.trim() && dropoff.address !== zoneName(dropoff) ? dropoff.address : 'Livrer ici' }
    : { title: 'Déplacez la carte', subtitle: 'jusqu’au lieu de livraison' };
  return { mapRef, initial, dropoff, moving, setMoving, onCenter, pinPlaced, bubble, suggestions, touchAddress: () => (autoAddress.current = null) };
}

/** Carte à épingle centrale (téléphone et ordinateur). */
function DestinationMap({ picker, bubbleBelow, style }: { picker: DestinationPicker; bubbleBelow: boolean; style?: object }) {
  return (
    <View style={style}>
      <PickerMap
        ref={picker.mapRef}
        style={StyleSheet.absoluteFill}
        initial={picker.initial}
        initialZoom={14}
        onMoveStart={() => picker.setMoving(true)}
        onCenterChange={picker.onCenter}
      />
      <CenterPin moving={picker.moving} bubble={picker.bubble} bubblePlacement={bubbleBelow ? 'below' : 'above'} />
    </View>
  );
}

/** Étape 1 sur téléphone : carte en haut (moitié de l'écran), feuille blanche du formulaire dessous. */
function PhoneDestination({ picker, onClose, fields, cta }: { picker: DestinationPicker; onClose: () => void; fields: ReactNode; cta: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const mapHeight = Math.max(280, Math.round(height * 0.5));
  // Petit téléphone (360 × 640) : la bulle au-dessus de l'épingle toucherait les boutons du haut ; elle passe dessous.
  const bubbleBelow = mapHeight / 2 < insets.top + 172;
  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={{ height: mapHeight }}>
        <DestinationMap picker={picker} bubbleBelow={bubbleBelow} style={StyleSheet.absoluteFill} />
        <View style={[styles.mapTop, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
          <MapIconButton icon="close" onPress={onClose} accessibilityLabel="Fermer" testID="wizard-close" />
        </View>
      </View>
      <View style={[styles.sheet, shadows.sheet]}>
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          {fields}
        </ScrollView>
        <View style={[styles.sheetFooter, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>{cta}</View>
      </View>
    </KeyboardAvoidingView>
  );
}

/** Formulaire de l'étape 1 : en-tête d'étape, quartiers proches, adresse et repère, destinataire. */
function DestinationFields({
  form,
  setForm,
  errors,
  clearError,
  picker,
  storeBanner,
}: {
  form: DeliveryForm;
  setForm: SetForm;
  errors: FormErrors;
  clearError: (k: keyof FormErrors) => void;
  picker: DestinationPicker;
  storeBanner: ReactNode;
}) {
  const { dropoff, pinPlaced } = picker;
  const updateDropoff = (patch: Partial<AddressDto>) => setForm((f) => ({ ...f, dropoff: { ...(f.dropoff ?? dropoff), ...patch } }));
  return (
    <>
      {/* Même en-tête qu'aux étapes 2 et 3 (« Étape 1 sur 3 », titre, pilules). */}
      <View style={{ gap: 4 }}>
        <StepTitle step={1} title={STEP_TITLES[1]} />
        <Text style={styles.muted}>Déplacez la carte jusqu’au lieu de livraison, ou choisissez un quartier.</Text>
      </View>
      {storeBanner}
      {errors.dropoff ? <DarkBanner message={errors.dropoff} /> : null}
      <SectionLabel>Quartiers proches</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
        {picker.suggestions.map((n) => {
          const selected = zoneName(dropoff) === n.name && pinPlaced;
          return (
            <Pill
              key={n.name}
              label={n.name}
              tone={selected ? 'tint' : 'outline'}
              icon={selected ? 'check' : undefined}
              onPress={() => {
                picker.mapRef.current?.centerOn(n.lat, n.lng, 15);
                picker.onCenter(n.lat, n.lng);
              }}
            />
          );
        })}
      </ScrollView>
      <DarkField
        label="Adresse de livraison"
        placeholder="Quartier, rue (ex. Patte d’Oie, rue 15.23)"
        value={dropoff.address}
        onChangeText={(t) => {
          picker.touchAddress();
          clearError('address');
          updateDropoff({ address: t });
        }}
        error={errors.address}
        maxLength={200}
        testID="dropoff-address"
      />
      <DarkField
        label="Point de repère"
        placeholder="Ex. derrière la station Total, portail bleu"
        value={dropoff.landmark}
        onChangeText={(t) => updateDropoff({ landmark: t })}
        maxLength={200}
        testID="dropoff-landmark"
      />
      <SectionLabel>Destinataire</SectionLabel>
      <DarkField
        label="Nom du destinataire"
        placeholder="Ex. Awa Ouédraogo"
        value={form.recipientName}
        onChangeText={(t) => {
          clearError('recipientName');
          setForm((f) => ({ ...f, recipientName: t }));
        }}
        error={errors.recipientName}
        maxLength={80}
        testID="recipient-name"
      />
      <DarkField
        label="Téléphone du destinataire"
        placeholder="70 12 34 56"
        keyboardType="phone-pad"
        value={form.recipientPhone}
        onChangeText={(t) => {
          clearError('recipientPhone');
          setForm((f) => ({ ...f, recipientPhone: t }));
        }}
        error={errors.recipientPhone}
        hint="Il recevra le lien de suivi de son colis."
        maxLength={20}
        testID="recipient-phone"
      />
      <View style={styles.switchRow}>
        <View style={styles.flex}>
          <Text style={styles.switchLabel}>Le destinataire est une entreprise</Text>
          <Text style={styles.small}>Boutique, bureau, autre commerce…</Text>
        </View>
        <Switch
          value={form.recipientIsBusiness}
          onValueChange={(v) => setForm((f) => ({ ...f, recipientIsBusiness: v }))}
          trackColor={{ true: palette.cobalt, false: palette.raisedHigh }}
          thumbColor="#FFFFFF"
          accessibilityLabel="Le destinataire est une entreprise"
          testID="recipient-business"
        />
      </View>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Colis et prix                                                    */
/* ------------------------------------------------------------------ */

/** Disque du véhicule (pictogramme cobalt sur cobaltTint, disque blanc quand la ligne est choisie). */
function VehicleDisc({ type, selected }: { type: VehicleType; selected: boolean }) {
  return (
    <View style={[styles.vehicleDisc, selected && styles.vehicleDiscOn]}>
      <Icon name={VEHICLE_ICON[type]} size={24} color={palette.cobalt} strokeWidth={2.2} />
    </View>
  );
}

/** Choix du véhicule avec le prix et la durée du devis (pastilles sélectionnables, façon Uber). */
function VehicleChoices({ options, selected, onSelect }: { options: QuoteOptionDto[]; selected: VehicleType | null; onSelect: (v: VehicleType) => void }) {
  return (
    <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
      {options.map((o) => {
        const isSel = selected === o.vehicleType;
        return (
          <ChoiceRow
            key={o.vehicleType}
            shape="pill"
            selected={isSel}
            disabled={!o.available}
            onPress={() => onSelect(o.vehicleType)}
            leading={<VehicleDisc type={o.vehicleType} selected={isSel} />}
            title={LABELS.vehicleType[o.vehicleType]}
            subtitle={o.available ? `~${o.estimatedMinutes} min · ${VEHICLE_HINT[o.vehicleType]}` : 'Indisponible pour le moment'}
            right={<Text style={[styles.price, isSel && styles.priceOn]}>{o.available ? formatFcfa(o.deliveryFee) : '—'}</Text>}
            accessibilityLabel={`${LABELS.vehicleType[o.vehicleType]}, ${o.available ? formatFcfa(o.deliveryFee) : 'indisponible'}`}
            testID={`vehicle-${o.vehicleType}`}
          />
        );
      })}
    </View>
  );
}

function PackageStep({
  form,
  set,
  errors,
  quote,
  quoteError,
  quoteLoading,
  vehicle,
  fee,
  storeName,
}: {
  form: DeliveryForm;
  set: <K extends keyof DeliveryForm>(k: K, v: DeliveryForm[K]) => void;
  errors: FormErrors;
  quote: QuoteResponse | null;
  quoteError: string | null;
  quoteLoading: boolean;
  vehicle: DeliveryForm['vehicleType'];
  fee: number | null;
  storeName: string;
}) {
  const cash = parseAmount(form.cashToCollect) ?? 0;
  return (
    <>
      <DarkField
        label="Que livrez-vous ?"
        placeholder="Ex. 2 cartons, une enveloppe de documents"
        value={form.packageDescription}
        onChangeText={(t) => set('packageDescription', t)}
        error={errors.packageDescription}
        maxLength={200}
        testID="package-description"
      />
      <View style={styles.wrap}>
        {PACKAGE_SUGGESTIONS.map((p) => {
          const on = form.packageDescription === p;
          return <Pill key={p} label={p} tone={on ? 'tint' : 'outline'} icon={on ? 'check' : undefined} onPress={() => set('packageDescription', p)} />;
        })}
      </View>

      <SectionLabel>Véhicule</SectionLabel>
      {quoteLoading && !quote ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={palette.cobalt} />
          <Text style={styles.muted}>Calcul des prix…</Text>
        </View>
      ) : null}
      {quote ? <VehicleChoices options={quote.options} selected={vehicle} onSelect={(v) => set('vehicleType', v)} /> : null}
      {quote ? (
        <Text style={styles.small}>
          Distance estimée : <Text style={tabular}>{formatKm(quote.distanceKm)}</Text> · retrait chez {storeName}.
        </Text>
      ) : null}
      {quoteError ? <DarkBanner message={quoteError} /> : null}
      {errors.vehicleType ? <DarkBanner message={errors.vehicleType} /> : null}

      <SectionLabel>Qui paie la livraison ?</SectionLabel>
      <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
        {(['SENDER', 'RECIPIENT'] as FeePayer[]).map((p) => (
          <ChoiceRow
            key={p}
            shape="pill"
            selected={form.feePaidBy === p}
            onPress={() => set('feePaidBy', p)}
            title={FEE_PAYER_LABELS[p].title}
            subtitle={p === 'SENDER' ? 'En espèces au livreur, au retrait du colis' : 'En espèces au livreur, à la livraison'}
            right={fee !== null ? <Text style={[styles.price, form.feePaidBy === p && styles.priceOn]}>{formatFcfa(fee)}</Text> : null}
            testID={`payer-${p}`}
          />
        ))}
      </View>

      <DarkField
        label="Montant à encaisser auprès du destinataire (facultatif)"
        placeholder="0"
        keyboardType="number-pad"
        value={form.cashToCollect}
        onChangeText={(t) => set('cashToCollect', t.replace(/[^\d\s]/g, ''))}
        error={errors.cashToCollect}
        hint="Valeur de la marchandise, encaissée par le livreur puis reversée à votre entreprise. Laissez vide si déjà payé."
        maxLength={12}
        testID="cash-to-collect"
      />
      {cash > 0 || form.feePaidBy === 'RECIPIENT' ? (
        <AmountRow
          label="Le destinataire paiera au livreur"
          amount={recipientPays(fee, form.feePaidBy, cash)}
          detail={cash > 0 && form.feePaidBy === 'RECIPIENT' ? 'Marchandise + frais de livraison, en espèces.' : 'En espèces, à la livraison.'}
          testID="recipient-pays"
        />
      ) : null}
      <DarkField
        label="Instructions pour le livreur (facultatif)"
        placeholder="Ex. appeler en arrivant, fragile"
        value={form.notes}
        onChangeText={(t) => set('notes', t)}
        maxLength={300}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Récapitulatif                                                    */
/* ------------------------------------------------------------------ */

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryLine}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function SummaryStep({
  form,
  storeName,
  storeAddress,
  quote,
  vehicle,
}: {
  form: DeliveryForm;
  storeName: string;
  storeAddress: string;
  quote: QuoteResponse | null;
  vehicle: DeliveryForm['vehicleType'];
}) {
  const option = quote?.options.find((o) => o.vehicleType === vehicle) ?? null;
  const fee = option?.deliveryFee ?? null;
  const cash = parseAmount(form.cashToCollect) ?? 0;
  const d = form.dropoff;
  return (
    <>
      <View style={styles.card} testID="summary-trip">
        <View style={styles.tripRow}>
          <BusinessMark name={storeName} size={28} />
          <View style={styles.flex}>
            <Text style={styles.tripTitle}>{storeName}</Text>
            <Text style={styles.small} numberOfLines={1}>
              Retrait · {storeAddress}
            </Text>
          </View>
        </View>
        <View style={styles.tripLine} />
        <View style={styles.tripRow}>
          <View style={styles.tripDrop}>
            <Text style={styles.tripDropText}>{avatarInitials(form.recipientName) ?? '?'}</Text>
          </View>
          <View style={styles.flex}>
            <Text style={styles.tripTitle}>
              {form.recipientName.trim()}
              {form.recipientIsBusiness ? <Text style={styles.small}> · entreprise</Text> : null}
            </Text>
            <Text style={styles.small}>
              {d?.address}
              {d?.landmark ? ` · Repère : ${d.landmark}` : ''}
            </Text>
            <Text style={[styles.small, tabular]}>{formatPhone(form.recipientPhone.trim()) || form.recipientPhone}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { gap: spacing.sm }]}>
        <SummaryLine label="Colis" value={form.packageDescription.trim()} />
        {vehicle ? <SummaryLine label="Véhicule" value={`${LABELS.vehicleType[vehicle]}${option ? ` · ~${option.estimatedMinutes} min` : ''}`} /> : null}
        <SummaryLine label="Frais de livraison" value={fee !== null ? formatFcfa(fee) : '…'} />
        <SummaryLine label="Payés par" value={`${FEE_PAYER_LABELS[form.feePaidBy].title} (${FEE_PAYER_LABELS[form.feePaidBy].detail})`} />
        {cash > 0 ? <SummaryLine label="Marchandise à encaisser" value={formatFcfa(cash)} /> : null}
        {form.notes.trim() ? <Text style={styles.notes}>« {form.notes.trim()} »</Text> : null}
      </View>

      {form.feePaidBy === 'SENDER' && fee !== null ? (
        <AmountRow label="Vous payez au livreur au retrait" amount={fee} detail="Frais de livraison, en espèces." tone="text" />
      ) : null}
      <AmountRow
        label="Le destinataire paie à la livraison"
        amount={recipientPays(fee, form.feePaidBy, cash)}
        detail={cash > 0 ? 'Marchandise encaissée par le livreur, reversée à votre entreprise par Yaar.' : null}
        testID="summary-recipient-pays"
      />
      <Text style={styles.small}>
        Après la demande, envoyez au destinataire son lien de suivi : il verra le livreur en direct et le code à lui donner.
      </Text>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Ordinateur                                                          */
/* ------------------------------------------------------------------ */

/**
 * Parcours sur ordinateur : en-tête de page (retour, « Nouvelle livraison », étape), la carte à gauche (épingle à
 * déplacer à l'étape 1 ; ensuite le trajet de l'entreprise au destinataire) et le formulaire dans une colonne blanche
 * à droite, la pilule cobalt de l'étape fixée en bas de la colonne.
 */
function DesktopWizard({
  step,
  onBack,
  onClose,
  form,
  picker,
  store,
  fields,
  tail,
  cta,
}: {
  step: Step;
  onBack: () => void;
  onClose: () => void;
  form: DeliveryForm;
  picker: DestinationPicker;
  store: { name: string; lat: number; lng: number };
  fields: ReactNode;
  tail: ReactNode;
  cta: ReactNode;
}) {
  const d = form.dropoff;
  const trip = useMemo(() => {
    const markers = [
      { id: 'pickup', kind: 'pickup' as const, lat: store.lat, lng: store.lng, title: store.name, ...(avatarInitials(store.name) ? { initials: avatarInitials(store.name) } : {}) },
      ...(d ? [{ id: 'dropoff', kind: 'dropoff' as const, lat: d.lat, lng: d.lng, pulse: true, title: form.recipientName || 'Destinataire', ...(avatarInitials(form.recipientName) ? { initials: avatarInitials(form.recipientName) } : {}) }] : []),
    ];
    const lines = d ? [{ id: 'trip', kind: 'dashed' as const, points: [{ lat: store.lat, lng: store.lng }, { lat: d.lat, lng: d.lng }] }] : [];
    return { markers, lines, fitPoints: markers.map((m) => ({ lat: m.lat, lng: m.lng })) };
  }, [store.lat, store.lng, store.name, d?.lat, d?.lng, form.recipientName]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={styles.page} testID="new-delivery-desktop">
      <PageHeader
        back={{ onPress: step === 1 ? onClose : onBack, label: step === 1 ? 'Fermer' : 'Étape précédente' }}
        title="Nouvelle livraison"
        subtitle={`Retrait chez ${store.name}`}
      />
      <View style={styles.deskRow}>
        {step === 1 ? (
          <View style={[styles.deskMap, styles.deskMapTile, shadows.tile]}>
            <DestinationMap picker={picker} bubbleBelow={false} style={StyleSheet.absoluteFill} />
          </View>
        ) : (
          <MapTile markers={trip.markers} lines={trip.lines} fitPoints={trip.fitPoints} cameraKey={`trip-${step}`} animationMs={4000} style={styles.deskMap} testID="trip-map" />
        )}
        <View style={[styles.deskColumn, shadows.tile]}>
          <ScrollView contentContainerStyle={styles.deskColumnContent} keyboardShouldPersistTaps="handled">
            {step === 1 ? null : (
              <View style={{ gap: 4 }}>
                <StepTitle step={step} title={STEP_TITLES[step]} />
              </View>
            )}
            {fields}
            {tail}
          </ScrollView>
          <View style={styles.deskFooter}>{cta}</View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: palette.canvas },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  emptyTitle: { color: palette.ink, fontSize: 17, fontWeight: '800', textAlign: 'center', lineHeight: 24 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: palette.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  stretch: { alignSelf: 'stretch', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  stepText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.cobaltText },
  headerTitle: { ...typography.title, color: palette.ink },
  stepBars: { flexDirection: 'row', gap: 4 },
  stepBar: { width: 18, height: 6, borderRadius: 3, backgroundColor: palette.raisedHigh },
  stepBarOn: { backgroundColor: palette.cobalt },
  mapTop: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center' },
  stepTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sheet: {
    flex: 1,
    marginTop: -SHEET_RADIUS,
    backgroundColor: palette.card,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, marginTop: 8, backgroundColor: palette.handle },
  sheetContent: { padding: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  sheetFooter: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, backgroundColor: palette.card },
  muted: { color: palette.inkMuted, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  small: { color: palette.inkMuted, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  chips: { gap: spacing.sm, paddingRight: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs, minHeight: 48 },
  switchLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.ink },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  vehicleDisc: { width: 44, height: 44, borderRadius: 22, backgroundColor: palette.cobaltTint, alignItems: 'center', justifyContent: 'center' },
  vehicleDiscOn: { backgroundColor: palette.white },
  price: { fontSize: 16, lineHeight: 21, fontWeight: '800', color: palette.ink, ...tabular },
  priceOn: { color: palette.cobaltText },
  card: { backgroundColor: palette.raised, borderRadius: 20, padding: spacing.lg },
  tripRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  tripLine: { width: 2, height: 20, backgroundColor: palette.line, marginLeft: 13, marginVertical: 4 },
  tripDrop: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.cobalt, alignItems: 'center', justifyContent: 'center' },
  tripDropText: { fontSize: 11, lineHeight: 14, fontWeight: '800', color: palette.onCobalt },
  tripTitle: { fontSize: 16, lineHeight: 21, fontWeight: '700', color: palette.ink },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  summaryLabel: { color: palette.inkMuted, fontSize: 14, lineHeight: 19, fontWeight: '600' },
  summaryValue: { flex: 1, color: palette.ink, fontSize: 14, lineHeight: 19, fontWeight: '700', textAlign: 'right', ...tabular },
  notes: { color: palette.inkMuted, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  page: { flex: 1, padding: PAGE_PADDING, backgroundColor: palette.canvas },
  deskRow: { flex: 1, flexDirection: 'row', gap: TILE_GAP, marginTop: 16, minHeight: 0 },
  deskMap: { flex: 1, minWidth: 0 },
  deskMapTile: { borderRadius: radii.card, overflow: 'hidden', backgroundColor: '#F3F5F8' },
  deskColumn: { width: 480, borderRadius: radii.card, backgroundColor: palette.card, overflow: 'hidden' },
  deskColumnContent: { padding: 24, gap: spacing.md },
  deskFooter: { paddingHorizontal: 24, paddingTop: spacing.md, paddingBottom: 20, minHeight: MIN_TOUCH + 36, borderTopWidth: 1, borderTopColor: palette.line },
});
