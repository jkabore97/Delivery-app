import { useEffect, useState } from 'react';
import type { AddressDto, StoreDto } from '@yaar/shared';
import { AddressPicker } from '../../../components/AddressPicker';
import { ProfileScreen } from '../../../components/ProfileScreen';
import { StoreApprovalBanner } from '../../../components/StoreApprovalBanner';
import { Banner, Button, Card, Chip, Field, Loading, Muted, Row, SectionTitle, Subtitle } from '../../../components/ui';
import { isAddressComplete, toAddressInput } from '../../../lib/address';
import { errorMessage } from '../../../lib/api';
import { formatPhone, normalizePhone } from '../../../lib/phone';
import { useApi } from '../../../state/auth';
import { useBusiness } from '../../../state/business';
import { colors } from '../../../theme';

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
            <Chip key={s.id} label={s.name} selected={s.id === store?.id} color={colors.orange} onPress={() => selectStore(s.id)} />
          ))}
        </Row>
      ) : null}
      {editing ? <StoreApprovalBanner store={editing} /> : null}
      <Card>
        <Subtitle>{editing ? `🏪 ${editing.name}` : '🏪 Mon entreprise'}</Subtitle>
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
          color={colors.orange}
          onPress={save}
          loading={busy}
          disabled={!valid}
          testID="save-business"
        />
        {stores.length > 0 ? (
          <Button
            title={creating ? 'Annuler' : '＋ Ajouter un autre établissement'}
            variant="ghost"
            color={colors.orange}
            onPress={() => setCreating((c) => !c)}
          />
        ) : null}
      </Card>
    </>
  );
}

export default function BusinessProfile() {
  return <ProfileScreen color={colors.orange} top={<BusinessProfileCard />} />;
}
