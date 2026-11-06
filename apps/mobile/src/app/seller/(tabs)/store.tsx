import { useEffect, useState } from 'react';
import { Switch } from 'react-native';
import { router } from 'expo-router';
import type { AddressDto, StoreDto } from '@yaar/shared';
import { AddressPicker } from '../../../components/AddressPicker';
import {
  Banner,

  Button,
  Card,
  Chip,
  Field,
  Loading,
  Muted,
  Row,
  Screen,
  SectionTitle,
  Subtitle,
  Title,
} from '../../../components/ui';
import { isAddressComplete, toAddressInput } from '../../../lib/address';
import { errorMessage } from '../../../lib/api';
import { formatPhone, normalizePhone } from '../../../lib/phone';
import { useApi } from '../../../state/auth';
import { useSeller } from '../../../state/seller';
import { colors } from '../../../theme';

interface StoreForm {
  name: string;
  description: string;
  phone: string;
  prepTime: string;
  openingHours: string;
  location: AddressDto | null;
}

function formFromStore(s: StoreDto | null): StoreForm {
  return {
    name: s?.name ?? '',
    description: s?.description ?? '',
    phone: s?.phone ? formatPhone(s.phone) : '',
    prepTime: String(s?.prepTimeMinutes ?? 15),
    openingHours: s?.openingHours ?? '',
    location: s ? { lat: s.lat, lng: s.lng, address: s.address, landmark: s.landmark } : null,
  };
}

/** Ouverture / fermeture de la boutique et informations (adresse, temps de préparation...). */
export default function SellerStoreScreen() {
  const api = useApi();
  const { stores, store, selectStore, upsertStore } = useSeller();
  const [creating, setCreating] = useState(false);
  const editing = creating ? null : store;
  const [form, setForm] = useState<StoreForm>(() => formFromStore(editing));
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);

  useEffect(() => {
    setForm(formFromStore(editing));
    setMessage(null);
  }, [editing?.id, creating]); // eslint-disable-line react-hooks/exhaustive-deps

  if (stores === undefined) return <Loading />;

  const prep = Number(form.prepTime);
  const prepValid = Number.isInteger(prep) && prep >= 1 && prep <= 180;
  const phoneValid = !form.phone.trim() || !!normalizePhone(form.phone);
  const valid = form.name.trim().length > 0 && isAddressComplete(form.location) && prepValid && phoneValid;

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
      prepTimeMinutes: prep,
      openingHours: form.openingHours.trim(),
    };
    try {
      if (editing) {
        upsertStore(await api.updateStore(editing.id, { ...base, phone: form.phone.trim() ? form.phone.trim() : null }));
        setMessage({ text: 'Boutique enregistrée.', ok: true });
      } else {
        const created = await api.createStore({ ...base, ...(form.phone.trim() ? { phone: form.phone.trim() } : {}) });
        upsertStore(created);
        setCreating(false);
        setMessage({ text: 'Boutique créée (fermée). Ajoutez votre menu puis ouvrez-la.', ok: true });
      }
    } catch (e) {
      setMessage({ text: errorMessage(e), ok: false });
    } finally {
      setBusy(false);
    }
  };

  const toggleOpen = async (isOpen: boolean) => {
    if (!store) return;
    setToggling(true);
    setMessage(null);
    try {
      upsertStore(await api.updateStore(store.id, { isOpen }));
    } catch (e) {
      setMessage({ text: errorMessage(e), ok: false });
    } finally {
      setToggling(false);
    }
  };

  const set = <K extends keyof StoreForm>(k: K, v: StoreForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Screen>
      <Title>{editing ? 'Ma boutique' : 'Nouvelle boutique'}</Title>
      {stores.length > 1 && !creating ? (
        <Row style={{ flexWrap: 'wrap' }}>
          {stores.map((s) => (
            <Chip key={s.id} label={s.name} selected={s.id === store?.id} color={colors.orange} onPress={() => selectStore(s.id)} />
          ))}
        </Row>
      ) : null}

      {editing ? (
        <Card highlight={editing.isOpen ? colors.green : undefined}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Subtitle style={{ color: editing.isOpen ? colors.green : colors.red }}>
              ● {editing.isOpen ? 'Ouvert' : 'Fermé'}
            </Subtitle>
            <Switch
              value={editing.isOpen}
              disabled={toggling}
              onValueChange={(v) => void toggleOpen(v)}
              trackColor={{ true: colors.green, false: colors.border }}
              accessibilityLabel="Ouvrir ou fermer la boutique"
            />
          </Row>
          <Muted>
            {editing.isOpen
              ? 'Les clients peuvent commander. Fermez la boutique en cas de rupture ou en fin de service.'
              : 'Fermée : la boutique est visible mais les clients ne peuvent pas commander.'}
          </Muted>
          <Muted>Commission Yaar : {editing.commissionPercent} % (fixée par Yaar)</Muted>
        </Card>
      ) : null}

      {message ? <Banner message={message.text} tone={message.ok ? 'green' : 'red'} /> : null}

      <SectionTitle>Informations</SectionTitle>
      <Field label="Nom de la boutique" value={form.name} onChangeText={(t) => set('name', t)} maxLength={80} />
      <Field label="Description" value={form.description} onChangeText={(t) => set('description', t)} maxLength={500} />
      <Field
        label="Téléphone de la boutique (facultatif)"
        keyboardType="phone-pad"
        value={form.phone}
        onChangeText={(t) => set('phone', t)}
        error={phoneValid ? null : 'Numéro invalide.'}
      />
      <Row>
        <Field
          label="Préparation (min)"
          keyboardType="number-pad"
          value={form.prepTime}
          onChangeText={(t) => set('prepTime', t.replace(/\D/g, ''))}
          error={prepValid ? null : '1 à 180'}
          style={{ minWidth: 120 }}
        />
      </Row>
      <Field
        label="Horaires"
        placeholder="Lun-Dim 10h-23h"
        value={form.openingHours}
        onChangeText={(t) => set('openingHours', t)}
        maxLength={200}
      />
      <SectionTitle>Emplacement (point de retrait des livreurs)</SectionTitle>
      <AddressPicker value={form.location} onChange={(a) => set('location', a)} pinColor={colors.orange} />
      <Button
        title={editing ? 'Enregistrer' : 'Créer la boutique'}
        color={colors.orange}
        onPress={save}
        loading={busy}
        disabled={!valid}
      />
      {stores.length > 0 ? (
        <Button
          title={creating ? 'Annuler la création' : '＋ Ajouter une autre boutique'}
          variant="ghost"
          color={colors.orange}
          onPress={() => setCreating((c) => !c)}
        />
      ) : null}

      <SectionTitle>Compte</SectionTitle>
      <Button title="👤 Mon compte / déconnexion" variant="outline" onPress={() => router.push('/seller/profile')} />
    </Screen>
  );
}
