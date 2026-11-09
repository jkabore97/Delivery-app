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
  /** Montant mis en avant (espèces à encaisser en ambre, gain en vert). */
  amount?: { label: string; value: number; tone?: 'amber' | 'green' } | null;
  /** Numéro du contact : boutons ronds WhatsApp et Appeler ; null = boutons inactifs ; absent = pas de boutons. */
  phone?: string | null;
  /** Message prérempli du bouton WhatsApp. */
  whatsappText?: string | null;
  /** Initiales de la pastille (par défaut celles de `name`). */
  initials?: string | null;
  theme?: Surface;
  /** Toute la carte devient un bouton. */
  onPress?: () => void;
  /** Bloc en bas de la carte (ex. bouton « Ouvrir la course »). */
  footer?: ReactNode;
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
  initials,
  theme = 'dark',
  onPress,
  footer,
  testID,
}: PackageCardProps) {
  const d = theme === 'dark';
  const c = d
    ? { card: dark.raised, border: dark.border, text: dark.text, muted: dark.textMuted, faint: dark.textFaint, avatarBg: dark.greenSoft, avatarFg: dark.green }
    : { card: colors.white, border: colors.border, text: colors.text, muted: colors.textMuted, faint: colors.textMuted, avatarBg: colors.greenLight, avatarFg: colors.green };
  const letters = initials ?? avatarInitials(name) ?? '?';
  const amountColor = amount?.tone === 'green' ? (d ? dark.green : colors.green) : d ? dark.amber : '#9A4F00';

  const body = (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: c.avatarBg }]}>
          <Text style={[styles.avatarText, { color: c.avatarFg }]}>{letters}</Text>
        </View>
        <View style={styles.flex}>
          {kicker || status ? (
            <View style={styles.kickerRow}>
              {kicker ? <Text style={[styles.kicker, { color: c.faint }]}>{kicker}</Text> : null}
              {status ? <StatusChip label={status.label} tone={status.tone} surface={theme} /> : null}
            </View>
          ) : null}
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
        {phone !== undefined ? (
          <View style={styles.contacts}>
            <WhatsAppRoundButton phone={phone} text={whatsappText} size="small" surface={theme} showLabel={false} />
            <CallRoundButton phone={phone} size="small" surface={theme} showLabel={false} />
          </View>
        ) : null}
      </View>
      {description ? (
        <View style={styles.infoRow}>
          <Icon name={descriptionIcon} size={16} color={c.muted} strokeWidth={2.2} />
          <Text style={[styles.info, { color: c.text }]}>{description}</Text>
        </View>
      ) : null}
      {notes ? <Text style={[styles.notes, { color: c.muted, borderLeftColor: c.border }]}>« {notes} »</Text> : null}
      {amount ? (
        <View style={styles.amountRow}>
          <Text style={[styles.amountLabel, { color: c.muted }]}>{amount.label}</Text>
          <Text style={[styles.amount, { color: amountColor }]}>{formatFcfa(amount.value)}</Text>
        </View>
      ) : null}
      {meta ? <Text style={[styles.meta, { color: c.faint }]}>{meta}</Text> : null}
      {footer}
    </View>
  );

  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name} style={({ pressed }) => pressed && { opacity: 0.9 }} testID={testID}>
      {body}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  kickerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 },
  kicker: { fontSize: 11.5, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  name: { fontSize: 17, fontWeight: '900', letterSpacing: -0.2 },
  line: { fontSize: 13, lineHeight: 18 },
  contacts: { flexDirection: 'row', gap: 8 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  info: { flex: 1, fontSize: 14, fontWeight: '600' },
  notes: { fontSize: 13, lineHeight: 18, fontStyle: 'italic', borderLeftWidth: 3, paddingLeft: 10 },
  amountRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  amountLabel: { fontSize: 13, fontWeight: '700' },
  amount: { fontSize: 18, fontWeight: '900', fontVariant: ['tabular-nums'] },
  meta: { fontSize: 12, fontWeight: '600' },
});
