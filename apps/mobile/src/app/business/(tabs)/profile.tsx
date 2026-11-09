import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { AddressDto, StoreDto } from '@yaar/shared';
import { AddressPicker } from '../../../components/AddressPicker';
import { BUSINESS_ACCENT } from '../../../components/business/accent';
import { Icon } from '../../../components/design/Icon';
import { StatusChip, type ChipTone } from '../../../components/design/Pill';
import { avatarInitials } from '../../../components/map/markerArt';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { StoreApprovalBanner } from '../../../components/StoreApprovalBanner';
import { Banner, Button, Card, Chip, Field, Loading, Muted, Row, SectionTitle, Subtitle } from '../../../components/ui';
import { isAddressComplete, toAddressInput } from '../../../lib/address';
import { errorMessage } from '../../../lib/api';
import { formatPhone, normalizePhone } from '../../../lib/phone';
import { useApi } from '../../../state/auth';
import { useBusiness } from '../../../state/business';
import { colors, spacing, typeScale } from '../../../theme';

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

const APPROVAL_CHIP: Record<NonNullable<StoreDto['approvalStatus']>, { label: string; tone: ChipTone }> = {
  APPROVED: { label: 'VALIDÉE PAR YAAR', tone: 'green' },
  PENDING: { label: 'EN ATTENTE DE VALIDATION', tone: 'amber' },
  SUSPENDED: { label: 'SUSPENDUE', tone: 'red' },
};

/** En-tête : initiales de l'entreprise (comme son épingle chez ses clients), nom, adresse de retrait, validation. */
function BusinessIdentity({ store }: { store: StoreDto }) {
  const chip = APPROVAL_CHIP[store.approvalStatus ?? 'APPROVED'];
  return (
    <View style={styles.identity} testID="business-identity">
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{avatarInitials(store.name) ?? '?'}</Text>
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.name} numberOfLines={2}>
          {store.name}
        </Text>
        <View style={styles.addressRow}>
          <Icon name="pin" size={15} color={colors.textMuted} strokeWidth={2.2} />
          <Text style={styles.address} numberOfLines={2}>
            {store.address}
          </Text>
        </View>
        <StatusChip label={chip.label} tone={chip.tone} surface="light" />
      </View>
    </View>
  );
}

/** Profil de l'entreprise (nom, téléphone, adresse de retrait) + compte et déconnexion. */
function BusinessProfileCard() {
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
        setMessage({ text: 'Entreprise créée : Yaar la valide (généralement sous 24 h), puis vous pourrez demander des livraisons.', ok: true });
      }
    } catch (e) {
      setMessage({ text: errorMessage(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {stores.length > 1 && !creating ? (
        <Row style={{ flexWrap: 'wrap' }}>
          {stores.map((s) => (
            <Chip key={s.id} label={s.name} selected={s.id === store?.id} color={BUSINESS_ACCENT} onPress={() => selectStore(s.id)} />
          ))}
        </Row>
      ) : null}
      {editing ? <BusinessIdentity store={editing} /> : null}
      {editing ? <StoreApprovalBanner store={editing} /> : null}
      <Card>
        <Subtitle style={styles.cardTitle}>{editing ? 'Mon entreprise' : 'Nouvelle entreprise'}</Subtitle>
        <Muted>
          L’adresse de l’entreprise est le point de retrait des livreurs. Vos clients voient son nom sur le suivi de leur colis.
        </Muted>
        {message ? <Banner message={message.text} tone={message.ok ? 'green' : 'red'} /> : null}
        <Field label="Nom de l’entreprise" placeholder="Ex. Pharmacie du Centre" value={form.name} onChangeText={(t) => set('name', t)} maxLength={80} />
        <Field
          label="Activité (facultatif)"
          placeholder="Ex. pharmacie, boutique de vêtements"
          value={form.description}
          onChangeText={(t) => set('description', t)}
          maxLength={500}
        />
        <Field
          label="Téléphone de l’entreprise (facultatif)"
          keyboardType="phone-pad"
          value={form.phone}
          onChangeText={(t) => set('phone', t)}
          error={phoneValid ? null : 'Numéro invalide.'}
        />
        <Field
          label="Horaires de retrait (facultatif)"
          placeholder="Lun-Sam 8h-19h"
          value={form.openingHours}
          onChangeText={(t) => set('openingHours', t)}
          maxLength={200}
        />
        <SectionTitle>Adresse de retrait</SectionTitle>
        <AddressPicker value={form.location} onChange={(a) => set('location', a)} variant="pickup" addressLabel="Adresse de l’entreprise" />
        <Button
          title={editing ? 'Enregistrer' : 'Créer mon entreprise'}
          color={BUSINESS_ACCENT}
          onPress={save}
          loading={busy}
          disabled={!valid}
          testID="save-business"
        />
        {stores.length > 0 ? (
          <Button
            title={creating ? 'Annuler' : '＋ Ajouter un autre établissement'}
            variant="ghost"
            color={BUSINESS_ACCENT}
            onPress={() => setCreating((c) => !c)}
          />
        ) : null}
      </Card>
    </>
  );
}

export default function BusinessProfile() {
  return <ProfileScreen color={BUSINESS_ACCENT} top={<BusinessProfileCard />} />;
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: colors.orangeLight, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 22, fontWeight: '900', color: '#9A4F00', letterSpacing: 0.3 },
  name: { ...typeScale.subtitle, fontSize: 20, fontWeight: '900', color: colors.text },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  address: { flex: 1, fontSize: 13.5, color: colors.textMuted },
  cardTitle: { fontWeight: '900', letterSpacing: -0.2 },
});
