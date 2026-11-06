import { useEffect, useState } from 'react';
import { Alert, Switch } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Banner, Body, Button, Field, Loading, Row, Screen } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { parsePrice } from '../../lib/sellerOrders';
import { useApi } from '../../state/auth';
import { useSeller } from '../../state/seller';
import { colors } from '../../theme';

/** Création / modification d'un produit (params.id présent = modification). */
export default function ProductFormScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const api = useApi();
  const { store } = useSeller();
  const [loaded, setLoaded] = useState(!id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [price, setPrice] = useState('');
  const [isAvailable, setIsAvailable] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !store) return;
    api.sellerProducts(store.id).then(
      (list) => {
        const p = list.find((x) => x.id === id);
        if (p) {
          setName(p.name);
          setDescription(p.description);
          setCategory(p.category);
          setPrice(String(p.price));
          setIsAvailable(p.isAvailable);
        } else setError('Produit introuvable.');
        setLoaded(true);
      },
      (e: unknown) => {
        setError(errorMessage(e));
        setLoaded(true);
      },
    );
  }, [api, id, store]);

  if (!store) return <Loading />;
  if (!loaded) return <Loading />;

  const parsed = parsePrice(price);
  const save = async () => {
    if (!parsed || !name.trim()) return;
    setBusy(true);
    setError(null);
    const body = { name: name.trim(), description: description.trim(), category: category.trim(), price: parsed, isAvailable };
    try {
      if (id) await api.updateProduct(id, body);
      else await api.createProduct(store.id, body);
      router.back();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (!id) return;
    Alert.alert('Supprimer', `Supprimer « ${name} » du menu ?`, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteProduct(id);
            router.back();
          } catch (e) {
            setError(errorMessage(e));
          }
        },
      },
    ]);
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: id ? 'Modifier le produit' : 'Nouveau produit' }} />
      <Field label="Nom" placeholder="Ex. Riz gras poulet" value={name} onChangeText={setName} maxLength={80} />
      <Field
        label="Prix (FCFA)"
        placeholder="2500"
        keyboardType="number-pad"
        value={price}
        onChangeText={setPrice}
        error={price && !parsed ? 'Prix invalide (nombre entier en FCFA).' : null}
      />
      <Field label="Catégorie" placeholder="Plats, Boissons, Grillades…" value={category} onChangeText={setCategory} maxLength={40} />
      <Field label="Description (facultatif)" value={description} onChangeText={setDescription} maxLength={300} multiline />
      <Row style={{ justifyContent: 'space-between' }}>
        <Body>Disponible à la commande</Body>
        <Switch value={isAvailable} onValueChange={setIsAvailable} trackColor={{ true: colors.orange, false: colors.border }} />
      </Row>
      {error ? <Banner message={error} /> : null}
      <Button title="Enregistrer" color={colors.orange} onPress={save} loading={busy} disabled={!parsed || !name.trim()} />
      {id ? <Button title="Supprimer le produit" variant="outline" onPress={remove} /> : null}
    </Screen>
  );
}
