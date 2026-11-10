import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../components/Text';
import type { AddressDto, StoreDto } from '@yaar/shared';
import { AddressPicker } from '../../../components/AddressPicker';
import { PAGE_PADDING, TILE_GAP, useIsDesktop } from '../../../components/business/desktop/layout';
import { PageHeader } from '../../../components/business/desktop/PageHeader';
import { BusinessMark, NewDeliveryButton, POINTER, type WebPressState } from '../../../components/business/parts';
import { Icon } from '../../../components/design/Icon';
import { StatusChip, type ChipTone } from '../../../components/design/Pill';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { StoreApprovalBanner } from '../../../components/StoreApprovalBanner';
import { Banner, Button, Card, Field, Loading, Muted, SectionTitle, Subtitle } from '../../../components/ui';
import { isAddressComplete, toAddressInput } from '../../../lib/address';
import { errorMessage } from '../../../lib/api';
import { formatPhone, normalizePhone } from '../../../lib/phone';
import { useApi } from '../../../state/auth';
import { useBusiness } from '../../../state/business';
import { palette, shadows, spacing, typography } from '../../../theme';

interface BusinessForm {
  name: string;
  description: string;
  phone: string;
  openingHours: string;
  location: AddressDto | null;
}

function formFromStore(s: StoreDto | null): BusinessForm {
  return {
    name: s?.name ?? '',
    description: s?.description ?? '',
    phone: s?.phone ? formatPhone(s.phone) : '',
    openingHours: s?.openingHours ?? '',
    location: s ? { lat: s.lat, lng: s.lng, address: s.address, landmark: s.landmark } : null,
  };
}

/** État de validation par Yaar, en minuscules (Cobalt) : validée (mint), en attente (soleil), suspendue (corail). */
const APPROVAL_CHIP: Record<NonNullable<StoreDto['approvalStatus']>, { label: string; tone: ChipTone }> = {
  APPROVED: { label: 'Validée par Yaar', tone: 'green' },
  PENDING: { label: 'En attente de validation', tone: 'amber' },
  SUSPENDED: { label: 'Suspendue', tone: 'red' },
};

/** En-tête : initiales de l'entreprise (carré encre, comme son marqueur sur les cartes), nom, adresse, validation. */
function BusinessIdentity({ store }: { store: StoreDto }) {
  const chip = APPROVAL_CHIP[store.approvalStatus ?? 'APPROVED'];
  return (
    <View style={[styles.identity, shadows.tile]} testID="business-identity">
      <BusinessMark name={store.name} size={56} />
      <View style={styles.identityText}>
        <Text style={styles.name} numberOfLines={2}>
          {store.name}
        </Text>
        <View style={styles.addressRow}>
          <Icon name="pin" size={15} color={palette.inkMuted} strokeWidth={2.2} />
          <Text style={styles.address} numberOfLines={2}>
            {store.address}
          </Text>
        </View>
        <StatusChip label={chip.label} tone={chip.tone} />
      </View>
    </View>
  );
}

/** Choix de l'établissement (plusieurs boutiques) : pastilles, l'établissement choisi en cobaltTint. */
function StorePicker({ stores, current, onSelect }: { stores: StoreDto[]; current: string | null; onSelect: (id: string) => void }) {
  return (
    <View style={styles.storePicker} accessibilityRole="radiogroup">
      {stores.map((s) => {
        const on = s.id === current;
        return (
          <Pressable
            key={s.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            aria-checked={on}
            onPress={() => onSelect(s.id)}
            style={(st: WebPressState) => [styles.storeChip, on && styles.storeChipOn, POINTER, !on && (st.hovered || st.pressed) && styles.storeChipHover]}
          >
            <BusinessMark name={s.name} size={28} />
            <Text style={[styles.storeChipText, on && styles.storeChipTextOn]} numberOfLines={1}>
              {s.name}
            </Text>
            {on ? <Icon name="check" size={16} color={palette.cobaltText} strokeWidth={2.6} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Profil de l'entreprise (nom, téléphone, horaires, adresse de retrait) ; plusieurs établissements : choix et ajout.
 * `wide` (ordinateur) : champs sur deux colonnes, carte de l'adresse plus grande.
 */
function BusinessProfileCard({ wide = false }: { wide?: boolean }) {
  const api = useApi();
  const { stores, store, selectStore, upsertStore } = useBusiness();
  const [creating, setCreating] = useState(false);
  const editing = creating ? null : store;
  const [form, setForm] = useState<BusinessForm>(() => formFromStore(editing));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    setForm(formFromStore(editing));
    setMessage(null);
  }, [editing?.id, creating]); // eslint-disable-line react-hooks/exhaustive-deps

  if (stores === undefined) return <Loading />;

  const phoneValid = !form.phone.trim() || !!normalizePhone(form.phone);
  const valid = form.name.trim().length > 0 && isAddressComplete(form.location) && phoneValid;
  const set = <K extends keyof BusinessForm>(k: K, v: BusinessForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!valid || !form.location) return;
    setBusy(true);
    setMessage(null);
    const loc = toAddressInput(form.location);
    const base = {
      name: form.name.trim(),
      description: form.description.trim(),
      address: loc.address,
      landmark: loc.landmark,
      lat: loc.lat,
      lng: loc.lng,
      openingHours: form.openingHours.trim(),
    };
    try {
      if (editing) {
        upsertStore(await api.updateStore(editing.id, { ...base, phone: form.phone.trim() ? form.phone.trim() : null }));
        setMessage({ text: 'Profil de l’entreprise enregistré.', ok: true });
      } else {
        const created = await api.createStore({ ...base, ...(form.phone.trim() ? { phone: form.phone.trim() } : {}) });
        upsertStore(created);
        setCreating(false);
        setMessage({ text: 'Entreprise créée : Yaar la valide (généralement sous 24 h), puis vous pourrez demander des livraisons.', ok: true });
      }
    } catch (e) {
      setMessage({ text: errorMessage(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const nameField = <Field label="Nom de l’entreprise" placeholder="Ex. Pharmacie du Centre" value={form.name} onChangeText={(t) => set('name', t)} maxLength={80} />;
  const activityField = (
    <Field label="Activité (facultatif)" placeholder="Ex. pharmacie, boutique de vêtements" value={form.description} onChangeText={(t) => set('description', t)} maxLength={500} />
  );
  const phoneField = (
    <Field
      label="Téléphone de l’entreprise (facultatif)"
      keyboardType="phone-pad"
      value={form.phone}
      onChangeText={(t) => set('phone', t)}
      error={phoneValid ? null : 'Numéro invalide.'}
    />
  );
  const hoursField = (
    <Field label="Horaires de retrait (facultatif)" placeholder="Lun-Sam 8h-19h" value={form.openingHours} onChangeText={(t) => set('openingHours', t)} maxLength={200} />
  );

  return (
    <>
      {stores.length > 1 && !creating ? <StorePicker stores={stores} current={store?.id ?? null} onSelect={selectStore} /> : null}
      {editing ? <BusinessIdentity store={editing} /> : null}
      {editing ? <StoreApprovalBanner store={editing} /> : null}
      <Card>
        <Subtitle style={styles.cardTitle}>{editing ? 'Mon entreprise' : 'Nouvelle entreprise'}</Subtitle>
        <Muted>L’adresse de l’entreprise est le point de retrait des livreurs. Vos clients voient son nom sur le suivi de leur colis.</Muted>
        {message ? <Banner message={message.text} tone={message.ok ? 'green' : 'red'} /> : null}
        {wide ? (
          <>
            <View style={styles.twoCols}>
              <View style={styles.col}>{nameField}</View>
              <View style={styles.col}>{activityField}</View>
            </View>
            <View style={styles.twoCols}>
              <View style={styles.col}>{phoneField}</View>
              <View style={styles.col}>{hoursField}</View>
            </View>
          </>
        ) : (
          <>
            {nameField}
            {activityField}
            {phoneField}
            {hoursField}
          </>
        )}
        <SectionTitle>Adresse de retrait</SectionTitle>
        <AddressPicker value={form.location} onChange={(a) => set('location', a)} variant="pickup" addressLabel="Adresse de l’entreprise" mapHeight={wide ? 300 : 220} />
        <View style={wide ? styles.actionsWide : styles.actions}>
          <Button title={editing ? 'Enregistrer' : 'Créer mon entreprise'} onPress={save} loading={busy} disabled={!valid} testID="save-business" />
          {stores.length > 0 ? (
            <Button
              title={creating ? 'Annuler' : 'Ajouter un autre établissement'}
              variant="ghost"
              color={palette.cobalt}
              icon={creating ? undefined : (c) => <Icon name="plus" size={18} color={c} strokeWidth={2.6} />}
              onPress={() => setCreating((c) => !c)}
              testID="add-store"
            />
          ) : null}
        </View>
      </Card>
    </>
  );
}

/**
 * Profil de l'entreprise. Téléphone : l'écran de profil commun (compte, déconnexion) avec l'entreprise en tête.
 * Ordinateur : page « Établissements » (entreprise, établissements, adresse de retrait) à gauche, le compte (« Mon
 * profil ») dans une colonne à droite.
 */
export default function BusinessProfile() {
  const desktop = useIsDesktop();
  const { stores, store } = useBusiness();
  if (!desktop) return <ProfileScreen color={palette.cobalt} buttonTextColor={palette.onCobalt} top={<BusinessProfileCard />} />;
  return (
    <View style={styles.page} testID="profile-desktop">
      <ScrollView style={styles.flex} contentContainerStyle={styles.pageContent} keyboardShouldPersistTaps="handled">
        <PageHeader
          title="Établissements"
          subtitle="Votre entreprise, ses points de retrait et son adresse"
          actions={<NewDeliveryButton stores={stores} store={store} variant="desktop" />}
        />
        <View style={styles.deskBody}>
          <BusinessProfileCard wide />
        </View>
      </ScrollView>
      <View style={[styles.account, shadows.tile]}>
        <ProfileScreen color={palette.cobalt} buttonTextColor={palette.onCobalt} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: 24, backgroundColor: palette.card },
  identityText: { flex: 1, gap: 4 },
  name: { fontSize: 20, lineHeight: 25, fontWeight: '800', letterSpacing: -0.3, color: palette.ink },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '500', color: palette.inkMuted },
  cardTitle: { ...typography.title, fontSize: 18, lineHeight: 23 },
  storePicker: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  storeChip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 10, paddingRight: 14, borderRadius: 999, backgroundColor: palette.card, maxWidth: '100%' },
  storeChipOn: { backgroundColor: palette.cobaltTint },
  storeChipHover: { backgroundColor: palette.raised },
  storeChipText: { flexShrink: 1, fontSize: 14, lineHeight: 18, fontWeight: '600', color: palette.ink },
  storeChipTextOn: { color: palette.cobaltText, fontWeight: '700' },
  twoCols: { flexDirection: 'row', gap: spacing.lg },
  col: { flex: 1, minWidth: 0 },
  actions: { gap: spacing.sm },
  actionsWide: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  page: { flex: 1, flexDirection: 'row', backgroundColor: palette.canvas },
  pageContent: { padding: PAGE_PADDING, paddingRight: TILE_GAP },
  deskBody: { marginTop: 16, gap: spacing.md, maxWidth: 880 },
  account: { width: 400, marginVertical: PAGE_PADDING, marginRight: PAGE_PADDING, borderRadius: 24, overflow: 'hidden', backgroundColor: palette.canvas },
});
