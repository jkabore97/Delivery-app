import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { LABELS } from '@yaar/shared';
import { OnlineToggle, SosButton } from '../../../components/DriverWidgets';
import { OrderMap } from '../../../components/OrderMap';
import {
  Badge,
  Banner,
  Button,
  Card,
  KeyValue,
  Loading,
  Muted,
  ProgressBar,
  Row,
  Screen,
  Subtitle,
  Title,
} from '../../../components/ui';
import { formatFcfa, formatOrderNumber } from '../../../lib/format';
import { hasTrackingConsent } from '../../../lib/consent';
import { documentChecklist, kycProgress } from '../../../lib/kyc';
import { useDriver } from '../../../state/driver';
import { colors, spacing } from '../../../theme';

export default function DriverHome() {
  const { profile, profileError, currentOrder, position, refreshProfile, orderNotice, clearOrderNotice } = useDriver();
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (profile === undefined) {
    return profileError ? (
      <Screen>
        <Banner message={profileError} />
        <Button title="Réessayer" color={colors.blue} onPress={() => void refreshProfile()} />
      </Screen>
    ) : (
      <Loading />
    );
  }
  if (profile === null) return <Redirect href="/driver/onboarding" />;

  const refresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  if (profile.status !== 'APPROVED') {
    const items = documentChecklist(profile.vehicleType, profile.documents);
    const { done, total } = kycProgress(items);
    return (
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <Title>Mon dossier livreur</Title>
        <Card highlight={profile.status === 'PENDING' ? colors.orange : colors.red}>
          <Subtitle>{LABELS.driverStatus[profile.status]}</Subtitle>
          {profile.status === 'PENDING' ? (
            <Muted>
              {profile.kycComplete
                ? 'Votre dossier est complet. Un contrôleur Yaar va le vérifier (généralement sous 24 h).'
                : 'Ajoutez les pièces manquantes pour que votre dossier soit examiné.'}
            </Muted>
          ) : null}
          {profile.rejectionReason ? <Muted>Motif du refus : {profile.rejectionReason}</Muted> : null}
          {profile.suspensionReason ? <Muted>Motif de la suspension : {profile.suspensionReason}</Muted> : null}
          {profile.status === 'REJECTED' ? <Muted>Corrigez vos pièces : le dossier repassera en vérification.</Muted> : null}
        </Card>
        <Card>
          <KeyValue label="Pièces fournies" value={`${done} / ${total}`} strong />
          <ProgressBar value={total ? done / total : 0} color={colors.blue} />
          <KeyValue label="Véhicule" value={`${LABELS.vehicleType[profile.vehicleType]}${profile.plate ? ` · ${profile.plate}` : ''}`} />
        </Card>
        {profile.status !== 'SUSPENDED' ? (
          <Button title="Compléter mes documents" color={colors.blue} onPress={() => router.navigate('/driver/documents')} />
        ) : null}
        <Button title="Actualiser" variant="outline" onPress={refresh} loading={refreshing} />
        <View style={styles.sosInline}>
          <SosButton />
        </View>
      </Screen>
    );
  }

  const cashRatio = profile.cashLimit > 0 ? profile.cashHeld / profile.cashLimit : 0;
  return (
    <View style={{ flex: 1 }}>
      <Screen refreshing={refreshing} onRefresh={refresh}>
        <OnlineToggle onError={setError} />
        {error ? <Banner message={error} /> : null}
        {orderNotice ? (
          <Pressable onPress={clearOrderNotice} accessibilityRole="button" accessibilityHint="Masquer le message">
            <Banner message={`${orderNotice} (toucher pour masquer)`} tone="orange" />
          </Pressable>
        ) : null}
        {profile.cashBlocked ? (
          <Banner
            message={`Plafond d’espèces atteint (${formatFcfa(profile.cashHeld)}). Déposez l’argent auprès de Yaar pour recevoir des courses.`}
          />
        ) : null}

        {profile.isOnline ? (
          <OrderMap
            me={position}
            pickup={currentOrder?.pickup ?? null}
            dropoff={currentOrder?.dropoff ?? null}
            height={260}
          />
        ) : (
          <Card>
            <Subtitle>Vous êtes hors ligne</Subtitle>
            <Muted>
              Passez en ligne pour recevoir des courses. Votre position n’est suivie et partagée que lorsque vous êtes en ligne.
            </Muted>
            {!hasTrackingConsent(profile) ? (
              <Muted>
                Avant votre premier passage en ligne, Yaar vous demandera d’accepter le suivi de votre position pendant le
                service.
              </Muted>
            ) : null}
          </Card>
        )}

        {currentOrder ? (
          <Pressable onPress={() => router.push('/driver/order')} accessibilityRole="button">
            <Card highlight={colors.blue}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Subtitle>Course {formatOrderNumber(currentOrder.number)}</Subtitle>
                <Badge label={LABELS.orderStatus[currentOrder.status]} tone="blue" />
              </Row>
              <Muted>
                {currentOrder.status === 'ASSIGNED'
                  ? `Récupérer : ${currentOrder.store?.name ?? currentOrder.pickup?.address ?? ''}`
                  : `Livrer : ${currentOrder.dropoff?.address ?? ''}`}
              </Muted>
              <Button title="Ouvrir la course" color={colors.blue} onPress={() => router.push('/driver/order')} />
            </Card>
          </Pressable>
        ) : profile.isOnline ? (
          <Card>
            <Subtitle>En attente de courses…</Subtitle>
            <Muted>Les nouvelles courses apparaissent ici avec 30 secondes pour accepter.</Muted>
          </Card>
        ) : null}

        <Card>
          <KeyValue label="Cash détenu" value={formatFcfa(profile.cashHeld)} strong />
          <ProgressBar value={cashRatio} color={cashRatio >= 0.8 ? colors.red : colors.orange} />
          <Muted>Plafond {formatFcfa(profile.cashLimit)} : à déposer avant de l’atteindre.</Muted>
        </Card>
        <View style={{ height: 70 }} />
      </Screen>
      <View style={styles.sosFloating}>
        <SosButton />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sosFloating: { position: 'absolute', right: spacing.lg, bottom: spacing.lg },
  sosInline: { alignItems: 'center', marginTop: spacing.lg },
});
