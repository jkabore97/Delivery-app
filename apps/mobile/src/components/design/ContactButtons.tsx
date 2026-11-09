import { Linking } from 'react-native';
import { telUrl, whatsappUrl } from '../../lib/tel';
import { RoundButton, type RoundButtonSize, type Surface } from './RoundButton';

interface ContactButtonProps {
  /** Numéro (E.164 de l'API, ou local à 8 chiffres) ; absent = bouton inactif. */
  phone: string | null | undefined;
  label?: string;
  size?: RoundButtonSize;
  surface?: Surface;
  /** false : bouton icône seul (le libellé reste lu par les lecteurs d'écran). */
  showLabel?: boolean;
  /** Hauteur réservée au disque, pour aligner les centres dans une rangée (voir RoundButton). */
  slot?: number;
  testID?: string;
}

/** Ouvre le lien sans jamais lever d'erreur (application absente : rien ne se passe). */
function open(url: string) {
  try {
    void Promise.resolve(Linking.openURL(url)).catch(() => undefined);
  } catch {
    /* lien refusé par la plateforme */
  }
}

/** « Appeler » : bouton rond qui ouvre le composeur (lien `tel:` de lib/tel.ts). */
export function CallRoundButton({ phone, label = 'Appeler', size = 'medium', surface = 'dark', showLabel = true, slot, testID }: ContactButtonProps) {
  return (
    <RoundButton
      label={label}
      icon="phone"
      size={size}
      surface={surface}
      tone="neutral"
      showLabel={showLabel}
      slot={slot}
      disabled={!phone}
      onPress={() => phone && open(telUrl(phone))}
      accessibilityLabel={phone ? `${label} (${phone})` : `${label} : numéro indisponible`}
      testID={testID}
    />
  );
}

/**
 * « WhatsApp » : bouton rond qui ouvre une discussion (https://wa.me/…, `whatsappUrl` de lib/tel.ts), avec un message
 * prérempli facultatif. Pictogramme de bulle générique (pas le logo de la marque).
 */
export function WhatsAppRoundButton({
  phone,
  text,
  label = 'WhatsApp',
  size = 'medium',
  surface = 'dark',
  showLabel = true,
  slot,
  testID,
}: ContactButtonProps & { text?: string | null }) {
  return (
    <RoundButton
      label={label}
      icon="chat"
      size={size}
      surface={surface}
      tone="neutral"
      showLabel={showLabel}
      slot={slot}
      disabled={!phone}
      onPress={() => phone && open(whatsappUrl(phone, text))}
      accessibilityLabel={phone ? `Écrire sur WhatsApp (${phone})` : 'WhatsApp : numéro indisponible'}
      testID={testID}
    />
  );
}
