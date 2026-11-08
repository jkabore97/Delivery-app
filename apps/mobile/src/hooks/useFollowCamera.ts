import { useCallback, useEffect, useReducer, useRef } from 'react';
import { followReducer, INITIAL_FOLLOW, shouldShowRecenter } from '../lib/mapCamera';

/**
 * État de la caméra d'une carte de suivi. `stageKey` change à chaque nouvelle étape (statut de la course) :
 * la carte recadre alors et reprend le suivi, même si l'utilisateur l'avait déplacée.
 */
export function useFollowCamera(stageKey: string, fitPointCount: number) {
  const [state, dispatch] = useReducer(followReducer, INITIAL_FOLLOW);
  const previous = useRef(stageKey);
  useEffect(() => {
    if (previous.current === stageKey) return;
    previous.current = stageKey;
    dispatch({ type: 'stageChanged' });
  }, [stageKey]);
  const onUserGesture = useCallback(() => dispatch({ type: 'gesture' }), []);
  const recenter = useCallback(() => dispatch({ type: 'recenter' }), []);
  return {
    follow: state.following,
    recenterKey: state.recenterKey,
    showRecenter: shouldShowRecenter(state, fitPointCount),
    onUserGesture,
    recenter,
  };
}
