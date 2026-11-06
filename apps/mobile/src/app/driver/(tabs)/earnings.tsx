import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { Banner, Card, KeyValue, Loading, Muted, ProgressBar, Row, Screen, SectionTitle, Stat, Title } from '../../../components/ui';
import { useAsync } from '../../../hooks/useAsync';
import { formatDateTime, formatFcfa, formatFcfaShort } from '../../../lib/format';
import { useApi } from '../../../state/auth';
import { colors } from '../../../theme';

/** Gains du jour, cumul, cash détenu vs plafond et derniers mouvements de caisse. */
export default function DriverEarnings() {
  const api = useApi();
  const earnings = useAsync(() => api.driverEarnings(), [api]);
  const { reload } = earnings;
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
  const e = earnings.data;

  return (
    <Screen refreshing={earnings.loading} onRefresh={earnings.reload}>
      <Title>Mes gains</Title>
      {earnings.error ? <Banner message={earnings.error} /> : null}
      {!e ? <Loading /> : null}
      {e ? (
        <>
          <Row>
            <Stat value={formatFcfaShort(e.today.earnings)} label={`Gains du jour · ${e.today.deliveries} course(s)`} color={colors.green} />
            <Stat value={formatFcfaShort(e.allTime.earnings)} label={`Total · ${e.allTime.deliveries} course(s)`} />
          </Row>
          <Card highlight={e.cashBlocked ? colors.red : undefined}>
            <KeyValue label="Cash détenu" value={formatFcfa(e.cashHeld)} strong />
            <ProgressBar value={e.cashLimit ? e.cashHeld / e.cashLimit : 0} color={e.cashBlocked ? colors.red : colors.orange} />
            <Muted>
              Plafond {formatFcfa(e.cashLimit)}.{' '}
              {e.cashBlocked
                ? 'Plafond atteint : déposez les espèces auprès de Yaar pour reprendre les courses.'
                : `Encore ${formatFcfa(Math.max(0, e.cashLimit - e.cashHeld))} avant blocage.`}
            </Muted>
            <KeyValue label="Encaissé aujourd’hui" value={formatFcfa(e.today.cashCollected)} />
          </Card>
          <SectionTitle>Mouvements de caisse</SectionTitle>
          {e.recentLedger.length === 0 ? <Muted>Aucun mouvement.</Muted> : null}
          {e.recentLedger.map((l) => (
            <Card key={l.id} style={{ paddingVertical: 10, gap: 2 }}>
              <KeyValue
                label={l.type === 'COLLECTION' ? `Encaissement${l.orderNumber ? ` #${l.orderNumber}` : ''}` : 'Dépôt chez Yaar'}
                value={`${l.amount > 0 ? '+' : '−'} ${formatFcfa(Math.abs(l.amount))}`}
                valueColor={l.amount > 0 ? colors.orange : colors.green}
              />
              <Muted>
                {formatDateTime(l.createdAt)} · solde {formatFcfa(l.balanceAfter)}
                {l.note && l.type === 'DEPOSIT' ? ` · ${l.note}` : ''}
              </Muted>
            </Card>
          ))}
        </>
      ) : null}
    </Screen>
  );
}
