import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useNow } from '../../hooks/useNow';
import { COUNTDOWN_WARNING_SECONDS, countdownColor, isCountdownWarning, remainingFraction, ringArcPath, secondsLeft } from '../../lib/countdown';
import { dark } from '../../theme';

export interface CountdownState {
  /** Secondes restantes (arrondi supérieur, 0 à la fin). */
  secondsLeft: number;
  /** Part restante du délai (1 → 0). */
  fraction: number;
  /** Dernières secondes (anneau rouge). */
  warning: boolean;
}

export interface CountdownRingProps {
  /** Début du délai (ISO, ex. `offer.offeredAt`) : anneau plein. */
  startAt: string;
  /** Fin du délai (ISO, ex. `offer.expiresAt`) : anneau vide. */
  endAt: string;
  /** Côté de l'anneau (px). */
  size: number;
  strokeWidth?: number;
  color?: string;
  /** Couleur des `warningSeconds` dernières secondes. */
  warningColor?: string;
  trackColor?: string;
  warningSeconds?: number;
  /** Images par seconde de l'anneau (10 à 20 suffisent : le trait avance de façon fluide). */
  fps?: number;
  /** Contenu centré dans l'anneau (ex. le bouton « Accepter »), ou fonction de l'état du compte à rebours. */
  children?: ReactNode | ((state: CountdownState) => ReactNode);
  testID?: string;
}

/**
 * Anneau de compte à rebours (SVG) qui se vide de `startAt` à `endAt` et passe au rouge pendant les dernières
 * secondes. Il a sa propre horloge (`fps` images par seconde) : seul l'anneau et son contenu sont redessinés à chaque
 * image, jamais l'écran qui le contient (ni sa carte).
 */
export function CountdownRing({
  startAt,
  endAt,
  size,
  strokeWidth = 8,
  color = dark.green,
  warningColor = dark.red,
  trackColor = 'rgba(255,255,255,0.16)',
  warningSeconds = COUNTDOWN_WARNING_SECONDS,
  fps = 15,
  children,
  testID,
}: CountdownRingProps) {
  const now = useNow(Math.round(1000 / Math.min(30, Math.max(1, fps))));
  const fraction = remainingFraction(startAt, endAt, now);
  const secs = secondsLeft(endAt, now);
  const warning = isCountdownWarning(secs, warningSeconds);
  const total = Math.max(1, Math.round((Date.parse(endAt) - Date.parse(startAt)) / 1000));
  const c = size / 2;
  const r = Math.max(0, (size - strokeWidth) / 2);
  const d = ringArcPath(fraction, c, c, r);
  const content = typeof children === 'function' ? children({ secondsLeft: secs, fraction, warning }) : children;
  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="progressbar"
      // aria-value* : compris par Android / iOS (accessibilityValue) et par le navigateur (react-native-web).
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={secs}
      aria-valuetext={warning ? `${secs} s, dernières secondes` : `${secs} s`}
      testID={testID}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <Circle cx={c} cy={c} r={r} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
          {d ? (
            <Path
              d={d}
              stroke={countdownColor(secs, { color, warningColor, warningSeconds })}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              fill="none"
              testID={testID ? `${testID}-arc` : undefined}
            />
          ) : null}
        </Svg>
      </View>
      {content}
    </View>
  );
}
