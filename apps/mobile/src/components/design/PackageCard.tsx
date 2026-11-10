import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../Text';
import { avatarInitials } from '../map/markerArt';
import { formatFcfa } from '../../lib/format';
import { palette, shadows, spacing } from '../../theme';
import { CallRoundButton, WhatsAppRoundButton } from './ContactButtons';
import { Icon, type IconName } from './Icon';
import { StatusChip, type ChipTone } from './Pill';

export interface PackageCardProps {
  /** Titre : destinataire (« Awa Kaboré ») ou entreprise. */
  name: string;
  /** Petite ligne au-dessus du nom (« #1052 », « 1 · Récupérer »), chiffres tabulaires. */
  kicker?: string | null;
  /** Puce d'état (« En livraison », « Livrée ») ; `dot` : petit point cobalt (recherche d'un livreur). */
  status?: { label: string; tone: ChipTone; dot?: boolean } | null;
  address?: string | null;
  /** Point de repère, affiché « Repère : … ». */
  landmark?: string | null;
  /** Colis (« 2 boîtes de médicaments »), ou autre ligne d'information avec `descriptionIcon`. */
  description?: string | null;
  /** Pictogramme de la ligne `description` (colis par défaut ; ex. « cash » pour « Encaissé … »). */
  descriptionIcon?: IconName;
  /** Instructions de l'expéditeur. */
  notes?: string | null;
  /** Ligne discrète (date, distance…). */
  meta?: string | null;
  /**
   * Montant mis en avant (espèces à encaisser : pastille soleil ; gain : vert). `testID` (facultatif) : sur la ligne, et
   * `<testID>-value` sur le montant (vérifications exactes, comme AmountRow).
   */
  amount?: { label: string; value: number; tone?: 'amber' | 'green'; testID?: string } | null;
  /** Numéro du contact : boutons ronds WhatsApp et Appeler ; null = boutons inactifs ; absent = pas de boutons. */
  phone?: string | null;
  /** Message prérempli du bouton WhatsApp. */
  whatsappText?: string | null;
  /** Nom du contact dans les libellés lus des boutons (« Appeler Awa Kaboré (+226…) ») ; par défaut aucun. */
  contactName?: string | null;
  /** Initiales de la pastille (par défaut celles de `name`). */
  initials?: string | null;
  /** Pictogramme de la pastille à la place des initiales (ex. « package » : colis sans entreprise ni nom). */
  avatarIcon?: IconName;
  /**
   * La carte (sauf ses boutons de contact) devient un bouton. Les boutons WhatsApp / Appeler sont alors posés À CÔTÉ de
   * ce bouton (colonne à droite), jamais dedans : un bouton dans un bouton est inaccessible aux lecteurs d'écran.
   */
  onPress?: () => void;
  /** Libellé lu de la partie qui ouvre (`onPress`), par défaut `name` : ex. « Awa Kaboré, en livraison, arrivée vers 14:29 ». */
  accessibilityLabel?: string;
  /**
   * Liste dense (accueil de l'entreprise) : numéro et état sur une ligne, nom (petite pastille aux initiales), ligne
   * `description` juste dessous, adresse (une ligne) et repère (deux lignes au plus), `meta` ; pas d'instructions.
   */
  compact?: boolean;
  /** Bloc en bas de la carte (ex. bouton « Ouvrir la course »). */
  footer?: ReactNode;
  /**
   * Sans `onPress` : sur la carte. Avec `onPress` : sur la partie qui ouvre (la carte entière moins ses boutons de
   * contact) ; la carte entière porte alors `<testID>-card`.
   */
  testID?: string;
}

/**
 * Carte de colis Cobalt (liste, course en cours, historique) : carte blanche (rayon 24, ombre douce, sans bordure),
 * pastille ronde aux initiales (cobaltTint), nom 16/700, adresse et repère, puce d'état, colis et instructions, montant
 * (pastille soleil pour les espèces), boutons ronds WhatsApp / Appeler facultatifs.
 */
export function PackageCard({
  name,
  kicker,
  status,
  address,
  landmark,
  description,
  descriptionIcon = 'package',
  notes,
  meta,
  amount,
  phone,
  whatsappText,
  contactName,
  initials,
  avatarIcon,
  onPress,
  accessibilityLabel,
  compact = false,
  footer,
  testID,
}: PackageCardProps) {
  const letters = initials ?? avatarInitials(name) ?? '?';
  const hasContacts = phone !== undefined;
  // Bouton de la carte et boutons de contact côte à côte (jamais l'un dans l'autre).
  const split = !!onPress && hasContacts;

  const avatar = (size: number) => (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      {avatarIcon ? (
        <Icon name={avatarIcon} size={Math.round(size / 2)} color={palette.cobaltText} testID={testID ? `${testID}-avatar-icon` : undefined} />
      ) : (
        <Text style={[styles.avatarText, size < 40 && styles.avatarTextSmall]}>{letters}</Text>
      )}
    </View>
  );
  const contacts = (vertical: boolean) => (
    <View style={vertical ? styles.rail : styles.contacts}>
      <WhatsAppRoundButton phone={phone} text={whatsappText} contactName={contactName} size="small" showLabel={false} />
      <CallRoundButton phone={phone} contactName={contactName} size="small" showLabel={false} />
    </View>
  );
  const kickerRow =
    kicker || status ? (
      <View style={[styles.kickerRow, compact && styles.kickerRowCompact]}>
        {kicker ? <Text style={styles.kicker}>{kicker}</Text> : null}
        {status ? <StatusChip label={status.label} tone={status.tone} dot={status.dot} /> : null}
      </View>
    ) : null;
  const descriptionRow = description ? (
    <View style={styles.infoRow}>
      <Icon name={descriptionIcon} size={16} color={palette.inkMuted} strokeWidth={2.2} />
      <Text style={[styles.info, compact && styles.infoCompact]} numberOfLines={compact ? 2 : undefined}>
        {description}
      </Text>
    </View>
  ) : null;
  const amountRow = amount ? (
    <View style={styles.amountRow} testID={amount.testID}>
      <Text style={styles.amountLabel}>{amount.label}</Text>
      <View style={[styles.amountPill, amount.tone === 'green' ? styles.amountPillGreen : styles.amountPillSun]}>
        <Text style={[styles.amount, amount.tone === 'green' && { color: palette.mintText }]} testID={amount.testID ? `${amount.testID}-value` : undefined}>
          {formatFcfa(amount.value)}
        </Text>
      </View>
    </View>
  ) : null;
  const metaRow = meta ? (
    <Text style={styles.meta} numberOfLines={compact ? 1 : undefined}>
      {meta}
    </Text>
  ) : null;

  const content = compact ? (
    <View style={styles.compactBody}>
      {kickerRow}
      <View style={styles.nameRow}>
        {avatar(32)}
        <Text style={[styles.name, styles.nameCompact]} numberOfLines={2}>
          {name}
        </Text>
      </View>
      {descriptionRow}
      {address ? (
        <Text style={styles.line} numberOfLines={1}>
          {address}
        </Text>
      ) : null}
      {landmark ? (
        // Repère : essentiel à Ouagadougou, jusqu'à deux lignes.
        <Text style={styles.line} numberOfLines={2}>
          Repère : {landmark}
        </Text>
      ) : null}
      {amountRow}
      {metaRow}
      {footer}
    </View>
  ) : (
    <View style={styles.body}>
      <View style={styles.header}>
        {avatar(44)}
        <View style={styles.flex}>
          {kickerRow}
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          {address ? (
            <Text style={styles.line} numberOfLines={2}>
              {address}
            </Text>
          ) : null}
          {landmark ? (
            <Text style={styles.line} numberOfLines={2}>
              Repère : {landmark}
            </Text>
          ) : null}
        </View>
        {hasContacts && !split ? contacts(false) : null}
      </View>
      {descriptionRow}
      {notes ? (
        <View style={styles.notes}>
          <Icon name="chat" size={16} color={palette.inkMuted} strokeWidth={2.1} />
          <Text style={styles.notesText}>« {notes} »</Text>
        </View>
      ) : null}
      {amountRow}
      {metaRow}
      {footer}
    </View>
  );

  if (!onPress) {
    return (
      <View style={[styles.card, shadows.tile, styles.padded, compact && styles.paddedCompact]} testID={testID}>
        {content}
      </View>
    );
  }
  const main = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      style={({ pressed }) => [split ? styles.main : [styles.card, shadows.tile], styles.padded, compact && styles.paddedCompact, split && styles.mainSplit, pressed && styles.pressed]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
  if (!split) return main;
  return (
    <View style={[styles.card, shadows.tile, styles.split]} testID={testID ? `${testID}-card` : undefined}>
      {main}
      {contacts(true)}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  card: { borderRadius: 24, backgroundColor: palette.card },
  padded: { padding: spacing.lg },
  paddedCompact: { paddingVertical: 14, paddingHorizontal: spacing.lg },
  pressed: { backgroundColor: palette.raised },
  body: { gap: 12 },
  compactBody: { gap: 4 },
  split: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, borderRadius: 24 },
  // Pas de marge à droite : la colonne des boutons de contact prend le relais.
  mainSplit: { paddingRight: 8 },
  // Colonne des boutons de contact (disques de 48 px, zone tactile de 56 px : 4 px de chaque côté dans la colonne).
  rail: { paddingVertical: 10, paddingLeft: 4, paddingRight: 12, gap: 10, alignSelf: 'stretch', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  avatar: { alignItems: 'center', justifyContent: 'center', backgroundColor: palette.cobaltTint },
  avatarText: { fontSize: 15, fontWeight: '800', letterSpacing: 0.2, color: palette.cobaltText },
  avatarTextSmall: { fontSize: 12, letterSpacing: 0.1 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 },
  kickerRowCompact: { marginBottom: 2 },
  kicker: { fontSize: 13, lineHeight: 17, fontWeight: '700', color: palette.inkMuted, fontVariant: ['tabular-nums'] },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { fontSize: 16, lineHeight: 21, fontWeight: '700', letterSpacing: -0.15, color: palette.ink },
  nameCompact: { flex: 1 },
  line: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: palette.inkMuted },
  contacts: { flexDirection: 'row', gap: 10 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  info: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: '600', color: palette.ink },
  infoCompact: { fontWeight: '700', fontVariant: ['tabular-nums'] },
  notes: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: 16, backgroundColor: palette.raised, paddingVertical: 10, paddingHorizontal: 12 },
  notesText: { flex: 1, fontSize: 13.5, lineHeight: 19, fontWeight: '500', color: palette.ink },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  amountLabel: { flexShrink: 1, fontSize: 13, lineHeight: 18, fontWeight: '600', color: palette.inkMuted },
  amountPill: { borderRadius: 16, minHeight: 32, paddingHorizontal: 12, justifyContent: 'center' },
  amountPillSun: { backgroundColor: palette.sun },
  amountPillGreen: { backgroundColor: palette.mintTint },
  amount: { fontSize: 15, lineHeight: 19, fontWeight: '800', letterSpacing: -0.15, color: palette.ink, fontVariant: ['tabular-nums'] },
  meta: { fontSize: 12, lineHeight: 16, fontWeight: '600', color: palette.inkMuted },
});
