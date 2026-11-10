import { useRef } from 'react';
import { Platform } from 'react-native';

/** Élément focalisable du DOM (web) : ce que reçoit la `ref` d'un Pressable sur le web. */
type Focusable = { focus?: () => void } | null;

/** Événement clavier du web (React DOM) reçu par `onKeyDown` d'un Pressable. */
interface WebKeyEvent {
  key: string;
  preventDefault: () => void;
}

/**
 * Clavier d'un groupe de boutons radio sur le web (motif WAI-ARIA « radio group », tabulation itinérante) : seul
 * l'élément choisi est un arrêt de tabulation (le premier si rien n'est choisi), les flèches déplacent le choix ET le
 * focus (en boucle), Début / Fin vont aux extrémités, Espace choisit l'élément focalisé (Entrée est déjà géré par
 * Pressable). Sans effet en natif (TalkBack et VoiceOver ont leurs propres gestes).
 *
 *   const keys = useRadioGroupKeys(options, value, setValue);
 *   options.map((o, i) => <Pressable accessibilityRole="radio" {...keys(i)} … />)
 */
export function useRadioGroupKeys<T>(options: readonly T[], value: T, onChange: (v: T) => void) {
  const refs = useRef<Focusable[]>([]);
  const selected = options.indexOf(value);
  return (i: number): Record<string, unknown> => {
    if (Platform.OS !== 'web') return {};
    const n = options.length;
    const move = (next: number, e: WebKeyEvent) => {
      e.preventDefault();
      onChange(options[next] as T);
      refs.current[next]?.focus?.();
    };
    return {
      ref: (el: Focusable) => {
        refs.current[i] = el;
      },
      tabIndex: i === (selected >= 0 ? selected : 0) ? 0 : -1,
      onKeyDown: (e: WebKeyEvent) => {
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowDown':
            return move((i + 1) % n, e);
          case 'ArrowLeft':
          case 'ArrowUp':
            return move((i - 1 + n) % n, e);
          case 'Home':
            return move(0, e);
          case 'End':
            return move(n - 1, e);
          case ' ':
          case 'Spacebar':
            e.preventDefault();
            onChange(options[i] as T);
            return undefined;
          default:
            return undefined;
        }
      },
    };
  };
}
