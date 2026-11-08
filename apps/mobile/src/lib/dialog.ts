import { Alert, Platform } from 'react-native';

/**
 * Boîtes de dialogue multiplateformes. `Alert.alert` ne fait rien sur le web (react-native-web) :
 * une confirmation critique (annuler une commande, envoyer un SOS, se déconnecter) y serait perdue.
 * Sur le web on utilise donc window.confirm / window.alert.
 */

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Libellé du bouton de confirmation (natif). */
  confirmText?: string;
  /** Libellé du bouton d'annulation (natif). */
  cancelText?: string;
  /** Bouton de confirmation en rouge (iOS). */
  destructive?: boolean;
}

interface WebDialogs {
  confirm?: (message?: string) => boolean;
  alert?: (message?: string) => void;
}

function webDialogs(): WebDialogs {
  return typeof window !== 'undefined' ? (window as unknown as WebDialogs) : {};
}

function webText(title: string, message?: string): string {
  return message ? `${title}\n\n${message}` : title;
}

/** Demande une confirmation ; résout `true` si l'utilisateur confirme. */
export function confirmAsync(opts: ConfirmOptions, platformOs: string = Platform.OS): Promise<boolean> {
  if (platformOs === 'web') {
    const w = webDialogs();
    return Promise.resolve(typeof w.confirm === 'function' ? w.confirm(webText(opts.title, opts.message)) : true);
  }
  return new Promise((resolve) => {
    Alert.alert(
      opts.title,
      opts.message,
      [
        { text: opts.cancelText ?? 'Annuler', style: 'cancel', onPress: () => resolve(false) },
        {
          text: opts.confirmText ?? 'Confirmer',
          style: opts.destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

/** Message d'information (un seul bouton OK). */
export function notify(title: string, message?: string, platformOs: string = Platform.OS): void {
  if (platformOs === 'web') {
    const w = webDialogs();
    if (typeof w.alert === 'function') w.alert(webText(title, message));
    return;
  }
  Alert.alert(title, message);
}
