import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { avatarInitials } from '../map/markerArt';
import { formatFcfa } from '../../lib/format';
import { colors, dark, spacing } from '../../theme';
import { CallRoundButton, WhatsAppRoundButton } from './ContactButtons';
import { Icon, type IconName } from './Icon';
import { StatusChip, type ChipTone } from './Pill';
import type { Surface } from './RoundButton';

export interface PackageCardProps {
  /** Titre : destinataire (« Awa Kaboré ») ou entreprise. */
  name: string;
  /** Sur-titre en capitales (« COURSE #1052 », « 1 · RÉCUPÉRER »). */
  kicker?: string | null;
  /** Puce d'état (« EN LIVRAISON », « LIVRÉE »). */
  status?: { label: string; tone: ChipTone } | null;
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
   * Montant mis en avant (espèces à encaisser en ambre, gain en vert). `testID` (facultatif) : sur la ligne, et
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
  theme?: Surface;
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
 * Carte de colis (liste, course en cours, historique) : pastille aux initiales, nom, adresse et repère, puce d'état,
 * colis et instructions, montant, boutons ronds WhatsApp / Appeler facultatifs. Sombre par défaut (feuilles du
 * livreur), claire avec `theme="light"`.
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
  theme = 'dark',
  onPress,
  accessibilityLabel,
  compact = false,
  footer,
  testID,
}: PackageCardProps) {
  const d = theme === 'dark';
  const c = d
    ? { card: dark.raised, border: dark.border, text: dark.text, muted: dark.textMuted, faint: dark.textFaint, avatarBg: dark.greenSoft, avatarFg: dark.green }
    : { card: colors.white, border: colors.border, text: colors.text, muted: colors.textMuted, faint: colors.textMuted, avatarBg: colors.greenLight, avatarFg: colors.green };
  const letters = initials ?? avatarInitials(name) ?? '?';
  const amountColor = amount?.tone === 'green' ? (d ? dark.green : colors.green) : d ? dark.amber : '#9A4F00';
  const hasContacts = phone !== undefined;
  // Bouton de la carte et boutons de contact côte à côte (jamais l'un dans l'autre).
  const split = !!onPress && hasContacts;

  const avatar = (size: number) => (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.avatarBg }]}>
      {avatarIcon ? (
        <Icon name={avatarIcon} size={Math.round(size / 2)} color={c.avatarFg} testID={testID ? `${testID}-avatar-icon` : undefined} />
      ) : (
        <Text style={[styles.avatarText, size < 40 && styles.avatarTextSmall, { color: c.avatarFg }]}>{letters}</Text>
      )}
    </View>
  );
  const contacts = (vertical: boolean) => (
    <View style={vertical ? styles.rail : styles.contacts}>
      <WhatsAppRoundButton phone={phone} text={whatsappText} contactName={contactName} size="small" surface={theme} showLabel={false} />
      <CallRoundButton phone={phone} contactName={contactName} size="small" surface={theme} showLabel={false} />
    </View>
  );
  const kickerRow =
    kicker || status ? (
      <View style={[styles.kickerRow, compact && styles.kickerRowCompact]}>
        {kicker ? <Text style={[styles.kicker, { color: c.faint }]}>{kicker}</Text> : null}
        {status ? <StatusChip label={status.label} tone={status.tone} surface={theme} /> : null}
      </View>
    ) : null;
  const descriptionRow = description ? (
    <View style={styles.infoRow}>
      <Icon name={descriptionIcon} size={16} color={c.muted} strokeWidth={2.2} />
      <Text style={[styles.info, compact && styles.infoCompact, { color: c.text }]} numberOfLines={compact ? 2 : undefined}>
        {description}
      </Text>
    </View>
  ) : null;
  const amountRow = amount ? (
    <View style={styles.amountRow} testID={amount.testID}>
      <Text style={[styles.amountLabel, { color: c.muted }]}>{amount.label}</Text>
      <Text style={[styles.amount, { color: amountColor }]} testID={amount.testID ? `${amount.testID}-value` : undefined}>
        {formatFcfa(amount.value)}
      </Text>
    </View>
  ) : null;
  const metaRow = meta ? (
    <Text style={[styles.meta, { color: c.faint }]} numberOfLines={compact ? 1 : undefined}>
      {meta}
    </Text>
  ) : null;

  const content = compact ? (
    <View style={styles.compactBody}>
      {kickerRow}
      <View style={styles.nameRow}>
        {avatar(28)}
        <Text style={[styles.name, styles.nameCompact, { color: c.text }]} numberOfLines={2}>
          {name}
        </Text>
      </View>
      {descriptionRow}
      {address ? (
        <Text style={[styles.line, { color: c.muted }]} numberOfLines={1}>
          {address}
        </Text>
      ) : null}
      {landmark ? (
        // Repère : essentiel à Ouagadougou, jusqu'à deux lignes.
        <Text style={[styles.line, { color: c.muted }]} numberOfLines={2}>
          Repère : {landmark}
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
          <Text style={[styles.name, { color: c.text }]} numberOfLines={2}>
            {name}
          </Text>
          {address ? (
            <Text style={[styles.line, { color: c.muted }]} numberOfLines={2}>
              {address}
            </Text>
          ) : null}
          {landmark ? (
            <Text style={[styles.line, { color: c.muted }]} numberOfLines={2}>
              Repère : {landmark}
            </Text>
          ) : null}
        </View>
        {hasContacts && !split ? contacts(false) : null}
      </View>
      {descriptionRow}
      {notes ? <Text style={[styles.notes, { color: c.muted, borderLeftColor: c.border }]}>« {notes} »</Text> : null}
      {amountRow}
      {metaRow}
      {footer}
    </View>
  );

  const cardStyle = [styles.card, { backgroundColor: c.card, borderColor: c.border }];
  if (!onPress) {
    return (
      <View style={[cardStyle, styles.padded, compact && styles.paddedCompact]} testID={testID}>
        {content}
      </View>
    );
  }
  const main = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? name}
      style={({ pressed }) => [split ? styles.main : [cardStyle], styles.padded, compact && styles.paddedCompact, split && styles.mainSplit, pressed && { opacity: 0.9 }]}
      testID={testID}
    >
      {content}
    </Pressable>
  );
  if (!split) return main;
  return (
    <View style={[cardStyle, styles.split]} testID={testID ? `${testID}-card` : undefined}>
      {main}
      {contacts(true)}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  card: { borderRadius: 18, borderWidth: 1 },
  padded: { padding: 14 },
  paddedCompact: { padding: 12 },
  body: { gap: 10 },
  compactBody: { gap: 4 },
  split: { flexDirection: 'row', alignItems: 'center' },
  main: { flex: 1, borderRadius: 18 },
  // Pas de marge à droite : la colonne des boutons de contact prend le relais.
  mainSplit: { paddingRight: 8 },
  // Colonne des boutons de contact (disques de 48 px, zone tactile de 56 px : 4 px de chaque côté dans la colonne).
  rail: { paddingVertical: 8, paddingLeft: 4, paddingRight: 8, gap: 8, alignSelf: 'stretch', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  avatarTextSmall: { fontSize: 11, letterSpacing: 0.2 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 },
  kickerRowCompact: { marginBottom: 0 },
  kicker: { fontSize: 11.5, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  nameCompact: { flex: 1 },
  line: { fontSize: 13, lineHeight: 18 },
  contacts: { flexDirection: 'row', gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  info: { flex: 1, fontSize: 14, fontWeight: '600' },
  infoCompact: { fontWeight: '800', lineHeight: 19 },
  notes: { fontSize: 13, lineHeight: 18, fontStyle: 'italic', borderLeftWidth: 3, paddingLeft: 10 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  amountLabel: { fontSize: 13, fontWeight: '700' },
  amount: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  meta: { fontSize: 12, fontWeight: '600' },
});
