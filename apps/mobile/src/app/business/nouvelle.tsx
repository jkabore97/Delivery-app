import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  distanceM,
  LABELS,
  OUAGADOUGOU_CENTER,
  OUAGADOUGOU_NEIGHBOURHOODS,
  type AddressDto,
  type FeePayer,
  type QuoteResponse,
} from '@yaar/shared';
import { zoneName } from '../../components/AddressPicker';
import { CenterPin } from '../../components/map/CenterPin';
import { PickerMap, type PickerMapHandle } from '../../components/map/PickerMap';
import { StoreApprovalBanner } from '../../components/StoreApprovalBanner';
import { Banner, Button, Chip, Empty, Field, KeyValue, Loading, Muted, Row, SectionTitle } from '../../components/ui';
import { VEHICLE_EMOJI, VehicleOptions } from '../../components/VehicleOptions';
import { useDeliveryQuote } from '../../hooks/useDeliveryQuote';
import { isPinAtDefault, toAddressInput } from '../../lib/address';
import { errorMessage } from '../../lib/api';
import {
  buildDeliveryInput,
  EMPTY_DELIVERY_FORM,
  FEE_PAYER_LABELS,
  hasErrors,
  parseAmount,
  pickVehicle,
  recipientPays,
  validateDestination,
  validatePackage,
  type DeliveryForm,
  type FormErrors,
} from '../../lib/delivery';
import { formatFcfa, formatFcfaShort, formatKm } from '../../lib/format';
import { formatPhone } from '../../lib/phone';
import { useApi } from '../../state/auth';
import { isBusinessApproved, useBusiness } from '../../state/business';
import { colors, radius, spacing } from '../../theme';

const PACKAGE_SUGGESTIONS = ['Documents', 'Petit colis', 'Carton', 'Repas', 'Médicaments', 'Vêtements'];

type Step = 1 | 2 | 3;

/** Nouvelle livraison (comme Uber Direct) : 1. destination sur la carte, 2. colis et prix, 3. récapitulatif. */
export default function NewDeliveryScreen() {
  const api = useApi();
  const { store, stores } = useBusiness();
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<DeliveryForm>(EMPTY_DELIVERY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof DeliveryForm>(k: K, v: DeliveryForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const pickup = store ? { lat: store.lat, lng: store.lng } : null;
  const quoteInput = useMemo(
    () => (step >= 2 && form.dropoff && form.dropoff.address.trim() ? { dropoff: toAddressInput(form.dropoff) } : null),
    [step, form.dropoff],
  );
  const { quote, error: quoteError, loading: quoteLoading } = useDeliveryQuote(quoteInput);
  const vehicle = quote ? pickVehicle(quote, form.vehicleType) : form.vehicleType;
  const option = quote?.options.find((o) => o.vehicleType === vehicle) ?? null;

  const close = () => (router.canGoBack() ? router.back() : router.replace('/business'));

  if (stores === undefined) return <Loading />;
  if (!store) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
        <Empty title="Créez d’abord le profil de votre entreprise (adresse de retrait).">
          <Button title="Mon profil d’entreprise" color={colors.orange} onPress={() => router.replace('/business/profile')} />
          <Button title="Fermer" variant="ghost" color={colors.textMuted} onPress={close} />
        </Empty>
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
    const built = buildDeliveryInput({ ...form, vehicleType: vehicle });
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
        pickup={pickup}
        approved={isBusinessApproved(store)}
        storeBanner={<StoreApprovalBanner store={store} />}
        onClose={close}
        onNext={next}
      />
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <WizardHeader step={step} onBack={back} title={step === 2 ? 'Colis et prix' : 'Récapitulatif'} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 2 ? (
          <PackageStep
            form={form}
            set={set}
            errors={errors}
            quote={quote}
            quoteError={quoteError}
            quoteLoading={quoteLoading}
            vehicle={vehicle}
            fee={option?.deliveryFee ?? null}
          />
        ) : (
          <SummaryStep form={form} storeName={store.name} storeAddress={store.address} quote={quote} vehicle={vehicle} />
        )}
        {!isBusinessApproved(store) && step === 3 ? <StoreApprovalBanner store={store} /> : null}
        {submitError ? <Banner message={submitError} /> : null}
      </ScrollView>
      <View style={styles.footer}>
        {step === 2 ? (
          <Button
            title={option ? `Continuer · ${formatFcfaShort(option.deliveryFee)}` : 'Continuer'}
            color={colors.orange}
            onPress={next}
            disabled={quoteLoading && !quote}
            testID="wizard-next"
          />
        ) : (
          <Button
            title="Demander un livreur"
            color={colors.green}
            onPress={submit}
            loading={busy}
            disabled={!option || !isBusinessApproved(store)}
            testID="request-driver"
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function WizardHeader({ step, title, onBack }: { step: Step; title: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Retour" style={styles.headerBtn} testID="wizard-back">
        <Text style={styles.headerBtnText}>←</Text>
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepText}>Étape {step} sur 3</Text>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <View style={styles.stepDots}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[styles.dot, i <= step && { backgroundColor: colors.orange }]} />
        ))}
      </View>
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
  pickup,
  approved,
  storeBanner,
  onClose,
  onNext,
}: {
  form: DeliveryForm;
  setForm: (fn: (f: DeliveryForm) => DeliveryForm) => void;
  errors: FormErrors;
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
        <CenterPin moving={moving} bubble={bubble} />
        <View style={[styles.mapTop, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.fab} testID="wizard-close">
            <Text style={styles.fabText}>✕</Text>
          </Pressable>
          <View style={styles.mapTitle}>
            <Text style={styles.mapTitleText}>1/3 · Où livrer ?</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </View>
      <View style={styles.sheet}>
        <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
          {!approved ? storeBanner : null}
          {errors.dropoff ? <Banner message={errors.dropoff} /> : null}
          <SectionTitle>Quartiers proches</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
            {suggestions.map((n) => (
              <Chip
                key={n.name}
                label={n.name}
                selected={zoneName(dropoff) === n.name && pinPlaced}
                color={colors.green}
                onPress={() => {
                  mapRef.current?.centerOn(n.lat, n.lng, 15);
                  onCenter(n.lat, n.lng);
                }}
              />
            ))}
          </ScrollView>
          <Field
            label="Adresse de livraison"
            placeholder="Quartier, rue (ex. Patte d’Oie, rue 15.23)"
            value={dropoff.address}
            onChangeText={(t) => {
              autoAddress.current = null;
              updateDropoff({ address: t });
            }}
            error={errors.address}
            maxLength={200}
            testID="dropoff-address"
          />
          <Field
            label="Point de repère"
            placeholder="Ex. derrière la station Total, portail bleu"
            value={dropoff.landmark}
            onChangeText={(t) => updateDropoff({ landmark: t })}
            maxLength={200}
            testID="dropoff-landmark"
          />
          <SectionTitle>Destinataire</SectionTitle>
          <Field
            label="Nom du destinataire"
            placeholder="Ex. Awa Ouédraogo"
            value={form.recipientName}
            onChangeText={(t) => setForm((f) => ({ ...f, recipientName: t }))}
            error={errors.recipientName}
            maxLength={80}
            testID="recipient-name"
          />
          <Field
            label="Téléphone du destinataire"
            placeholder="70 12 34 56"
            keyboardType="phone-pad"
            value={form.recipientPhone}
            onChangeText={(t) => setForm((f) => ({ ...f, recipientPhone: t }))}
            error={errors.recipientPhone}
            hint="Il recevra le lien de suivi de son colis."
            maxLength={20}
            testID="recipient-phone"
          />
          <Row style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Le destinataire est une entreprise</Text>
              <Muted>Boutique, bureau, autre commerce…</Muted>
            </View>
            <Switch
              value={form.recipientIsBusiness}
              onValueChange={(v) => setForm((f) => ({ ...f, recipientIsBusiness: v }))}
              trackColor={{ true: colors.green, false: colors.border }}
              accessibilityLabel="Le destinataire est une entreprise"
              testID="recipient-business"
            />
          </Row>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <Button title="Continuer" color={colors.orange} onPress={onNext} testID="wizard-next" />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Colis et prix                                                    */
/* ------------------------------------------------------------------ */

function PackageStep({
  form,
  set,
  errors,
  quote,
  quoteError,
  quoteLoading,
  vehicle,
  fee,
}: {
  form: DeliveryForm;
  set: <K extends keyof DeliveryForm>(k: K, v: DeliveryForm[K]) => void;
  errors: FormErrors;
  quote: QuoteResponse | null;
  quoteError: string | null;
  quoteLoading: boolean;
  vehicle: DeliveryForm['vehicleType'];
  fee: number | null;
}) {
  const cash = parseAmount(form.cashToCollect) ?? 0;
  return (
    <>
      <Field
        label="Que livrez-vous ?"
        placeholder="Ex. 2 cartons, une enveloppe de documents"
        value={form.packageDescription}
        onChangeText={(t) => set('packageDescription', t)}
        error={errors.packageDescription}
        maxLength={200}
        testID="package-description"
      />
      <Row style={{ flexWrap: 'wrap' }} gap={6}>
        {PACKAGE_SUGGESTIONS.map((p) => (
          <Chip key={p} label={p} selected={form.packageDescription === p} color={colors.orange} onPress={() => set('packageDescription', p)} />
        ))}
      </Row>

      <SectionTitle>Véhicule</SectionTitle>
      {quoteLoading && !quote ? <Loading label="Calcul des prix…" /> : null}
      {quote ? <VehicleOptions options={quote.options} selected={vehicle} onSelect={(v) => set('vehicleType', v)} /> : null}
      {quote ? <Muted>Distance estimée : {formatKm(quote.distanceKm)} · retrait à votre adresse.</Muted> : null}
      {quoteError ? <Banner message={quoteError} /> : null}
      {errors.vehicleType ? <Banner message={errors.vehicleType} /> : null}

      <SectionTitle>Qui paie la livraison ?</SectionTitle>
      <View style={{ gap: spacing.sm }} accessibilityRole="radiogroup">
        {(['SENDER', 'RECIPIENT'] as FeePayer[]).map((p) => {
          const sel = form.feePaidBy === p;
          return (
            <Pressable
              key={p}
              accessibilityRole="radio"
              accessibilityState={{ selected: sel }}
              onPress={() => set('feePaidBy', p)}
              style={[styles.payer, sel && styles.payerSelected]}
              testID={`payer-${p}`}
            >
              <View style={[styles.radio, sel && styles.radioOn]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.payerTitle}>{FEE_PAYER_LABELS[p].title}</Text>
                <Muted>{p === 'SENDER' ? 'En espèces au livreur, au retrait du colis' : 'En espèces au livreur, à la livraison'}</Muted>
              </View>
              {fee !== null ? <Text style={styles.payerFee}>{formatFcfaShort(fee)}</Text> : null}
            </Pressable>
          );
        })}
      </View>

      <Field
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
        <View style={styles.collectBox} testID="recipient-pays">
          <Text style={styles.collectLabel}>Le destinataire paiera au livreur</Text>
          <Text style={styles.collectValue}>{formatFcfa(recipientPays(fee, form.feePaidBy, cash))}</Text>
        </View>
      ) : null}
      <Field
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
      <View style={styles.trip} testID="summary-trip">
        <View style={styles.tripRow}>
          <View style={[styles.tripDot, { backgroundColor: colors.orange, borderRadius: 4 }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tripTitle}>{storeName}</Text>
            <Muted numberOfLines={1}>Retrait · {storeAddress}</Muted>
          </View>
        </View>
        <View style={styles.tripLine} />
        <View style={styles.tripRow}>
          <View style={[styles.tripDot, { backgroundColor: colors.green }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.tripTitle}>
              {form.recipientName.trim()}
              {form.recipientIsBusiness ? '  🏢' : ''}
            </Text>
            <Muted>
              {d?.address}
              {d?.landmark ? ` · Repère : ${d.landmark}` : ''}
            </Muted>
            <Muted>📞 {formatPhone(form.recipientPhone.trim()) || form.recipientPhone}</Muted>
          </View>
        </View>
      </View>

      <View style={styles.summaryCard}>
        <KeyValue label="Colis" value={form.packageDescription.trim()} />
        {vehicle ? (
          <KeyValue
            label="Véhicule"
            value={`${VEHICLE_EMOJI[vehicle]} ${LABELS.vehicleType[vehicle]}${option ? ` · ~${option.estimatedMinutes} min` : ''}`}
          />
        ) : null}
        <KeyValue label="Frais de livraison" value={fee !== null ? formatFcfa(fee) : '…'} />
        <KeyValue label="Payés par" value={`${FEE_PAYER_LABELS[form.feePaidBy].title} (${FEE_PAYER_LABELS[form.feePaidBy].detail})`} />
        {cash > 0 ? <KeyValue label="Marchandise à encaisser" value={formatFcfa(cash)} /> : null}
        {form.notes.trim() ? <Muted>Instructions : {form.notes.trim()}</Muted> : null}
      </View>

      {form.feePaidBy === 'SENDER' && fee !== null ? (
        <View style={[styles.collectBox, { backgroundColor: colors.orangeLight }]}>
          <Text style={styles.collectLabel}>Vous payez au livreur au retrait</Text>
          <Text style={styles.collectValue}>{formatFcfa(fee)}</Text>
        </View>
      ) : null}
      <View style={styles.collectBox} testID="summary-recipient-pays">
        <Text style={styles.collectLabel}>Le destinataire paie à la livraison</Text>
        <Text style={styles.collectValue}>{formatFcfa(recipientPays(fee, form.feePaidBy, cash))}</Text>
      </View>
      <Muted>
        Après la demande, envoyez au destinataire son lien de suivi : il verra le livreur en direct et le code à lui donner.
      </Muted>
    </>
  );
}

const shadow = {
  shadowColor: '#0F2E22',
  shadowOpacity: 0.2,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
  elevation: 6,
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xl },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    backgroundColor: colors.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.white,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F1F3F5' },
  headerBtnText: { fontSize: 20, fontWeight: '800', color: colors.text },
  stepText: { fontSize: 12, color: colors.textMuted, fontWeight: '700' },
  headerTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  stepDots: { flexDirection: 'row', gap: 4 },
  dot: { width: 18, height: 5, borderRadius: 3, backgroundColor: colors.border },
  mapTop: { position: 'absolute', left: spacing.md, right: spacing.md, flexDirection: 'row', alignItems: 'center' },
  fab: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow },
  fabText: { fontSize: 18, fontWeight: '800', color: colors.text },
  mapTitle: { flex: 1, alignItems: 'center' },
  mapTitleText: {
    backgroundColor: colors.white,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    fontWeight: '800',
    color: colors.text,
    overflow: 'hidden',
  },
  sheet: {
    flex: 1,
    marginTop: -18,
    backgroundColor: colors.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    ...shadow,
    shadowOffset: { width: 0, height: -3 },
  },
  sheetContent: { padding: spacing.lg, gap: spacing.md },
  switchRow: { alignItems: 'center', gap: spacing.md },
  switchLabel: { fontSize: 15, fontWeight: '700', color: colors.text },
  payer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  payerSelected: { borderColor: colors.green, backgroundColor: colors.greenLight },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.border },
  radioOn: { borderColor: colors.green, borderWidth: 6 },
  payerTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  payerFee: { fontSize: 15, fontWeight: '900', color: colors.text },
  collectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.greenLight,
  },
  collectLabel: { flex: 1, fontSize: 14, fontWeight: '800', color: colors.text },
  collectValue: { fontSize: 18, fontWeight: '900', color: colors.text },
  trip: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  tripRow: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  tripDot: { width: 14, height: 14, borderRadius: 7, marginTop: 4 },
  tripLine: { width: 2, height: 18, backgroundColor: colors.border, marginLeft: 6, marginVertical: 2 },
  tripTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  summaryCard: { backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, gap: spacing.sm },
});
