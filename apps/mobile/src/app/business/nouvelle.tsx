import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  useWindowDimensions,
  View,
} from 'react-native';
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
import { BUSINESS_ACCENT } from '../../components/business/accent';
import { ChoiceRow, DarkBanner, DarkField, SectionLabel } from '../../components/business/DarkForm';
import { MapIconButton, Pill } from '../../components/design/Pill';
import { AmountRow } from '../../components/design/Surfaces';
import { CenterPin } from '../../components/map/CenterPin';
import { vehicleSideGlyph } from '../../components/map/markerArt';
import { ArtView } from '../../components/map/MarkerViews';
import { PickerMap, type PickerMapHandle } from '../../components/map/PickerMap';
import { StoreApprovalBanner } from '../../components/StoreApprovalBanner';
import { VEHICLE_HINT } from '../../components/VehicleOptions';
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
import { MAP_COLORS } from '../../lib/map/style';
import { formatPhone } from '../../lib/phone';
import { useApi } from '../../state/auth';
import { isBusinessApproved, useBusiness } from '../../state/business';
import { dark, SHEET_RADIUS, spacing, typeScale } from '../../theme';

const PACKAGE_SUGGESTIONS = ['Documents', 'Petit colis', 'Carton', 'Repas', 'Médicaments', 'Vêtements'];

type Step = 1 | 2 | 3;

/**
 * Nouvelle livraison (comme Uber Direct), sur fond sombre : 1. destination sur la carte (feuille sombre posée sur la
 * carte à épingle centrale, quartiers proches en pastilles, destinataire), 2. colis, véhicule et prix (choix en
 * pastilles, qui paie, montant à encaisser), 3. récapitulatif (trajet, montants) ; un grand bouton vert par étape.
 */
export default function NewDeliveryScreen() {
  const api = useApi();
  const { store, stores } = useBusiness();
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

  const close = () => (router.canGoBack() ? router.back() : router.replace('/business'));

  if (stores === undefined) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]}>
        <ActivityIndicator size="large" color={dark.green} />
      </SafeAreaView>
    );
  }
  if (!store) {
    return (
      <SafeAreaView style={[styles.root, styles.centered]}>
        <Text style={styles.emptyTitle}>Créez d’abord le profil de votre entreprise (adresse de retrait).</Text>
        <Pill label="Mon profil d’entreprise" icon="store" tone="green" size="lg" onPress={() => router.replace('/business/profile')} />
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

  if (step === 1) {
    return (
      <DestinationStep
        form={form}
        setForm={setForm}
        errors={errors}
        clearError={clearError}
        pickup={pickup}
        approved={isBusinessApproved(store)}
        storeBanner={<StoreApprovalBanner store={store} tone="dark" />}
        onClose={close}
        onNext={next}
      />
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <WizardHeader step={step} onBack={back} title={step === 2 ? 'Colis et prix' : 'Récapitulatif'} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 2 ? (
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
          )}
          {!isBusinessApproved(store) && step === 3 ? <StoreApprovalBanner store={store} tone="dark" /> : null}
          {submitError ? <DarkBanner message={submitError} /> : null}
        </ScrollView>
        <View style={styles.footer}>
          {step === 2 ? (
            <Pill
              label={option ? `Continuer · ${formatFcfa(option.deliveryFee)}` : 'Continuer'}
              icon="chevronRight"
              tone="green"
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
              tone="green"
              size="lg"
              onPress={submit}
              loading={busy}
              disabled={!option || !isBusinessApproved(store)}
              style={styles.stretch}
              testID="request-driver"
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Trois barres d'étape (orange de l'entreprise jusqu'à l'étape en cours). */
function StepBars({ step }: { step: Step }) {
  return (
    <View style={styles.stepBars} accessibilityRole="progressbar" accessibilityLabel={`Étape ${step} sur 3`}>
      {[1, 2, 3].map((i) => (
        <View key={i} style={[styles.stepBar, i <= step && { backgroundColor: BUSINESS_ACCENT }]} />
      ))}
    </View>
  );
}

/** « ÉTAPE 2 SUR 3 » en sur-titre orange, titre de l'étape et barres : le même en-tête aux trois étapes. */
function StepTitle({ step, title, grow }: { step: Step; title: string; grow?: boolean }) {
  return (
    <View style={[styles.stepTitle, grow && styles.flex]}>
      <View style={styles.flex}>
        <Text style={[typeScale.kicker, styles.stepText]} testID="wizard-step">
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
      <MapIconButton icon="back" theme="dark" onPress={onBack} accessibilityLabel="Retour" testID="wizard-back" />
      <StepTitle step={step} title={title} grow />
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Destination                                                      */
/* ------------------------------------------------------------------ */

function DestinationStep({
  form,
  setForm,
  errors,
  clearError,
  pickup,
  approved,
  storeBanner,
  onClose,
  onNext,
}: {
  form: DeliveryForm;
  setForm: (fn: (f: DeliveryForm) => DeliveryForm) => void;
  errors: FormErrors;
  clearError: (k: keyof FormErrors) => void;
  pickup: { lat: number; lng: number } | null;
  approved: boolean;
  storeBanner: ReactNode;
  onClose: () => void;
  onNext: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const mapRef = useRef<PickerMapHandle>(null);
  const [moving, setMoving] = useState(false);
  /** Adresse préremplie avec le nom du quartier (remplacée tant que l'utilisateur ne l'a pas modifiée). */
  const autoAddress = useRef<string | null>(null);
  const [initial] = useState(() => form.dropoff ?? pickup ?? OUAGADOUGOU_CENTER);
  const dropoff: AddressDto = form.dropoff ?? { lat: initial.lat, lng: initial.lng, address: '', landmark: '' };

  const suggestions = useMemo(() => {
    const ref = pickup ?? OUAGADOUGOU_CENTER;
    return [...OUAGADOUGOU_NEIGHBOURHOODS].sort((a, b) => distanceM(ref, a) - distanceM(ref, b)).slice(0, 9);
  }, [pickup]);

  const updateDropoff = (patch: Partial<AddressDto>) =>
    setForm((f) => ({ ...f, dropoff: { ...(f.dropoff ?? dropoff), ...patch } }));

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
  const mapHeight = Math.max(280, Math.round(height * 0.5));
  // Petit téléphone (360 × 640) : la bulle au-dessus de l'épingle toucherait les boutons du haut ; elle passe dessous.
  const bubbleBelow = mapHeight / 2 < insets.top + 172;

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ height: mapHeight }}>
        <PickerMap
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initial={initial}
          initialZoom={14}
          onMoveStart={() => setMoving(true)}
          onCenterChange={onCenter}
        />
        <CenterPin moving={moving} bubble={bubble} bubblePlacement={bubbleBelow ? 'below' : 'above'} />
        <View style={[styles.mapTop, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
          <MapIconButton icon="close" onPress={onClose} accessibilityLabel="Fermer" testID="wizard-close" />
        </View>
      </View>
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          {/* Même en-tête qu'aux étapes 2 et 3 (sur-titre « ÉTAPE 1 SUR 3 », titre, barres). */}
          <View style={{ gap: 4 }}>
            <StepTitle step={1} title="Où livrer ?" />
            <Text style={styles.muted}>Déplacez la carte jusqu’au lieu de livraison, ou choisissez un quartier.</Text>
          </View>
          {!approved ? storeBanner : null}
          {errors.dropoff ? <DarkBanner message={errors.dropoff} /> : null}
          <SectionLabel>Quartiers proches</SectionLabel>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
            {suggestions.map((n) => {
              const selected = zoneName(dropoff) === n.name && pinPlaced;
              return (
                <Pill
                  key={n.name}
                  label={n.name}
                  tone={selected ? 'green' : 'outline'}
                  icon={selected ? 'check' : undefined}
                  onPress={() => {
                    mapRef.current?.centerOn(n.lat, n.lng, 15);
                    onCenter(n.lat, n.lng);
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
              autoAddress.current = null;
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
              trackColor={{ true: dark.green, false: dark.raisedHigh }}
              thumbColor="#FFFFFF"
              accessibilityLabel="Le destinataire est une entreprise"
              testID="recipient-business"
            />
          </View>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Pill label="Continuer" icon="chevronRight" tone="green" size="lg" onPress={onNext} style={styles.stretch} testID="wizard-next" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Colis et prix                                                    */
/* ------------------------------------------------------------------ */

/** Disque vert au véhicule de profil : le même dessin que le marqueur du livreur sur les cartes. */
function VehicleDisc({ type }: { type: VehicleType }) {
  return (
    <View style={styles.vehicleDisc}>
      <ArtView rects={vehicleSideGlyph(type)} size={26} />
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
            leading={<VehicleDisc type={o.vehicleType} />}
            title={LABELS.vehicleType[o.vehicleType]}
            subtitle={o.available ? `~${o.estimatedMinutes} min · ${VEHICLE_HINT[o.vehicleType]}` : 'Indisponible pour le moment'}
            right={<Text style={[styles.price, isSel && { color: dark.green }]}>{o.available ? formatFcfa(o.deliveryFee) : '—'}</Text>}
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
        label="Que livrez-vous ?"
        placeholder="Ex. 2 cartons, une enveloppe de documents"
        value={form.packageDescription}
        onChangeText={(t) => set('packageDescription', t)}
        error={errors.packageDescription}
        maxLength={200}
        testID="package-description"
      />
      <View style={styles.wrap}>
        {PACKAGE_SUGGESTIONS.map((p) => (
          <Pill key={p} label={p} tone={form.packageDescription === p ? 'green' : 'outline'} onPress={() => set('packageDescription', p)} />
        ))}
      </View>

      <SectionLabel>Véhicule</SectionLabel>
      {quoteLoading && !quote ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator color={dark.green} />
          <Text style={styles.muted}>Calcul des prix…</Text>
        </View>
      ) : null}
      {quote ? <VehicleChoices options={quote.options} selected={vehicle} onSelect={(v) => set('vehicleType', v)} /> : null}
      {quote ? (
        <Text style={styles.small}>
          Distance estimée : {formatKm(quote.distanceKm)} · retrait chez {storeName}.
        </Text>
      ) : null}
      {quoteError ? <DarkBanner message={quoteError} /> : null}
      {errors.vehicleType ? <DarkBanner message={errors.vehicleType} /> : null}

      <SectionLabel>Qui paie la livraison ?</SectionLabel>
      <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
        {(['SENDER', 'RECIPIENT'] as FeePayer[]).map((p) => (
          <ChoiceRow
            key={p}
            shape="pill"
            selected={form.feePaidBy === p}
            onPress={() => set('feePaidBy', p)}
            title={FEE_PAYER_LABELS[p].title}
            subtitle={p === 'SENDER' ? 'En espèces au livreur, au retrait du colis' : 'En espèces au livreur, à la livraison'}
            right={fee !== null ? <Text style={styles.price}>{formatFcfa(fee)}</Text> : null}
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
          <View style={[styles.tripDot, styles.tripDotPickup]} />
          <View style={styles.flex}>
            <Text style={styles.tripTitle}>{storeName}</Text>
            <Text style={styles.small} numberOfLines={1}>
              Retrait · {storeAddress}
            </Text>
          </View>
        </View>
        <View style={styles.tripLine} />
        <View style={styles.tripRow}>
          <View style={[styles.tripDot, styles.tripDotDropoff]} />
          <View style={styles.flex}>
            <Text style={styles.tripTitle}>
              {form.recipientName.trim()}
              {form.recipientIsBusiness ? <Text style={styles.small}> · entreprise</Text> : null}
            </Text>
            <Text style={styles.small}>
              {d?.address}
              {d?.landmark ? ` · Repère : ${d.landmark}` : ''}
            </Text>
            <Text style={styles.small}>{formatPhone(form.recipientPhone.trim()) || form.recipientPhone}</Text>
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
        Après la demande, envoyez au destinataire son lien de suivi : il verra le livreur en direct et le code à lui donner.
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: dark.background },
  centered: { alignItems: 'center', justifyContent: 'center', gap: spacing.lg, padding: spacing.xl },
  emptyTitle: { color: dark.text, fontSize: 17, fontWeight: '800', textAlign: 'center', lineHeight: 24 },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: dark.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: dark.border,
  },
  stretch: { alignSelf: 'stretch', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  stepText: { color: BUSINESS_ACCENT },
  headerTitle: { ...typeScale.title, color: dark.text },
  stepBars: { flexDirection: 'row', gap: 4 },
  stepBar: { width: 18, height: 5, borderRadius: 3, backgroundColor: dark.raisedHigh },
  mapTop: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center' },
  stepTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  sheet: {
    flex: 1,
    marginTop: -SHEET_RADIUS,
    backgroundColor: dark.surface,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 12,
  },
  sheetContent: { padding: spacing.lg, gap: spacing.md },
  muted: { color: dark.textMuted, fontSize: 14, lineHeight: 20 },
  small: { color: dark.textMuted, fontSize: 13, lineHeight: 18 },
  chips: { gap: spacing.sm, paddingRight: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs },
  switchLabel: { fontSize: 15, fontWeight: '800', color: dark.text },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  vehicleDisc: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MAP_COLORS.driver,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  price: { fontSize: 16, fontWeight: '900', color: dark.text, fontVariant: ['tabular-nums'] },
  card: { backgroundColor: dark.raised, borderRadius: 18, borderWidth: 1, borderColor: dark.border, padding: spacing.md },
  tripRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  tripDot: { width: 16, height: 16, marginTop: 3, borderWidth: 2, borderColor: '#FFFFFF' },
  tripDotPickup: { backgroundColor: MAP_COLORS.pickup, borderRadius: 5 },
  tripDotDropoff: { backgroundColor: dark.green, borderRadius: 8 },
  tripLine: { width: 2, height: 20, backgroundColor: dark.border, marginLeft: 7, marginVertical: 3 },
  tripTitle: { fontSize: 16, fontWeight: '900', color: dark.text },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  summaryLabel: { color: dark.textMuted, fontSize: 14, fontWeight: '700' },
  summaryValue: { flex: 1, color: dark.text, fontSize: 14, fontWeight: '900', textAlign: 'right', fontVariant: ['tabular-nums'] },
  notes: { color: dark.textMuted, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
});
