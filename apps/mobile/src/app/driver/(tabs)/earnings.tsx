import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { FitAmount } from '../../../components/design/FitAmount';
import { Text } from '../../../components/Text';
import { IconDisc, ListRow, Meter, ScreenTitle, SectionHeading, shortDateTime, WhiteCard } from '../../../components/driver/DriverKit';
import { Banner, Loading, Screen } from '../../../components/ui';
import { useAsync } from '../../../hooks/useAsync';
import { cashRatio } from '../../../lib/driverStatus';
import { formatFcfa } from '../../../lib/format';
import { useApi } from '../../../state/auth';
import { alpha, palette, radii, shadows, spacing } from '../../../theme';

const courses = (n: number) => `${n} course${n > 1 ? 's' : ''}`;

/**
 * Gains (Cobalt) : gains du jour en tuile héros cobalt (grand chiffre blanc), cumul en tuile blanche, espèces détenues
 * en tuile SOLEIL (jauge encre jusqu'au plafond), derniers mouvements de caisse en liste à filets.
 */
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
  const left = e ? Math.max(0, e.cashLimit - e.cashHeld) : 0;

  return (
    <Screen refreshing={earnings.loading} onRefresh={earnings.reload}>
      <ScreenTitle title="Mes gains" />
      {earnings.error ? <Banner message={earnings.error} /> : null}
      {!e ? <Loading /> : null}
      {e ? (
        <>
          <View style={[styles.hero, shadows.hero]} testID="earnings-today">
            <View style={styles.heroTop}>
              <Text style={styles.heroLabel}>Aujourd’hui</Text>
              <View style={styles.heroChip}>
                <Text style={styles.heroChipText}>{courses(e.today.deliveries)}</Text>
              </View>
            </View>
            <FitAmount amount={e.today.earnings} size={48} color={palette.white} />
            <Text style={styles.heroSub}>{`Encaissé aujourd’hui : ${formatFcfa(e.today.cashCollected)}`}</Text>
          </View>

          <View style={styles.tiles}>
            <WhiteCard style={styles.tile} testID="earnings-total">
              <IconDisc icon="chart" tone="cobalt" size={32} />
              <FitAmount amount={e.allTime.earnings} size={24} />
              <Text style={styles.tileLabel}>Gains totaux</Text>
            </WhiteCard>
            <WhiteCard style={styles.tile}>
              <IconDisc icon="package" tone="cobalt" size={32} />
              <Text style={styles.count}>{e.allTime.deliveries}</Text>
              <Text style={styles.tileLabel}>{e.allTime.deliveries > 1 ? 'Courses livrées' : 'Course livrée'}</Text>
            </WhiteCard>
          </View>

          {/* Espèces : tuile soleil pleine, texte encre (12,2:1) ; plafond atteint : bandeau rouge sous la tuile. */}
          <View style={[styles.cash, shadows.sun]} testID="earnings-cash">
            <View style={styles.cashTop}>
              <Text style={styles.cashLabel}>Espèces détenues</Text>
              <Text style={styles.cashLimit}>{`Plafond ${formatFcfa(e.cashLimit)}`}</Text>
            </View>
            <FitAmount amount={e.cashHeld} size={36} />
            <Meter value={cashRatio(e.cashHeld, e.cashLimit)} color={palette.ink} track={alpha(palette.ink, 0.12)} label="Espèces détenues par rapport au plafond" />
            <Text style={styles.cashNote}>
              {e.cashBlocked
                ? 'Plafond atteint : déposez les espèces auprès de Yaar pour reprendre les courses.'
                : `Encore ${formatFcfa(left)} avant blocage. Déposez les espèces auprès de Yaar.`}
            </Text>
          </View>
          {e.cashBlocked ? <Banner message="Plafond d’espèces atteint : vous ne recevez plus de courses avant le dépôt." /> : null}

          <SectionHeading>Mouvements de caisse</SectionHeading>
          <WhiteCard style={styles.list}>
            {e.recentLedger.length === 0 ? <Text style={styles.emptyText}>Aucun mouvement.</Text> : null}
            {e.recentLedger.map((l, i) => {
              const collection = l.type === 'COLLECTION';
              return (
                <ListRow
                  key={l.id}
                  first={i === 0}
                  leading={<IconDisc icon={collection ? 'cash' : 'check'} tone={collection ? 'sun' : 'mint'} size={40} />}
                  title={collection ? (l.orderNumber ? `Course #${l.orderNumber}` : 'Encaissement') : 'Dépôt chez Yaar'}
                  subtitle={`${shortDateTime(l.createdAt)}${!collection && l.note ? ` · ${l.note}` : ''}\nSolde ${formatFcfa(l.balanceAfter)}`}
                  amount={{ value: Math.abs(l.amount), sign: l.amount > 0 ? '+' : '−', color: l.amount > 0 ? palette.amberText : palette.mintText }}
                />
              );
            })}
          </WhiteCard>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radii.hero, padding: 24, gap: 6, backgroundColor: palette.cobalt },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroLabel: { fontSize: 15, lineHeight: 20, fontWeight: '700', color: palette.onCobalt2 },
  heroChip: { minHeight: 28, paddingHorizontal: 12, borderRadius: 14, justifyContent: 'center', backgroundColor: alpha(palette.white, 0.16) },
  heroChipText: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.white, fontVariant: ['tabular-nums'] },
  heroSub: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: palette.onCobalt2, fontVariant: ['tabular-nums'] },
  tiles: { flexDirection: 'row', gap: spacing.md, alignItems: 'stretch' },
  tile: { flex: 1, padding: spacing.lg, gap: 8 },
  tileLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted },
  count: { fontSize: 24, lineHeight: 27, fontWeight: '800', letterSpacing: -0.7, color: palette.ink, fontVariant: ['tabular-nums'] },
  cash: { borderRadius: radii.card, padding: 20, gap: 10, backgroundColor: palette.sun },
  cashTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  cashLabel: { fontSize: 15, lineHeight: 20, fontWeight: '800', color: palette.ink },
  cashLimit: { fontSize: 13, lineHeight: 18, fontWeight: '700', color: palette.onSun2, fontVariant: ['tabular-nums'] },
  cashNote: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.onSun2 },
  list: { paddingVertical: 4, gap: 0 },
  emptyText: { fontSize: 15, lineHeight: 21, fontWeight: '600', color: palette.inkMuted, paddingVertical: spacing.lg, textAlign: 'center' },
});
