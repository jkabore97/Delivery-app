import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { createBaseMap, loadMaplibre, webglSupported, type BaseMap } from '../../lib/map/maplibre.web';
import { MAP_PALETTE } from '../../lib/map/style';
import { Text } from '../Text';
import { MapAttribution } from './MapAttribution';
import type { PickerMapHandle, PickerMapProps } from './types';

export type { PickerMapHandle, PickerMapProps } from './types';

/** Carte du choix d'adresse « épingle fixe au centre » (web, MapLibre, fond Cobalt) : on déplace la carte sous l'épingle. */
export const PickerMap = forwardRef<PickerMapHandle, PickerMapProps>(function PickerMap(
  { initial, initialZoom = 15, onCenterChange, onMoveStart, style, testID = 'address-map' },
  ref,
) {
  const el = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<BaseMap | null>(null);
  const pending = useRef<{ lat: number; lng: number; zoom?: number } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unsupported'>('loading');
  const onChange = useRef(onCenterChange);
  onChange.current = onCenterChange;
  const onStart = useRef(onMoveStart);
  onStart.current = onMoveStart;
  const initialRef = useRef(initial);
  const zoomRef = useRef(initialZoom);

  useEffect(() => {
    let cancelled = false;
    if (!webglSupported()) {
      setStatus('unsupported');
      return;
    }
    loadMaplibre()
      .then((ml) => {
        if (cancelled || !el.current) return;
        const base = createBaseMap(ml, el.current, { center: initialRef.current, zoom: zoomRef.current });
        base.map.on('movestart', () => onStart.current?.());
        base.map.on('moveend', () => {
          const c = base.map.getCenter();
          onChange.current(c.lat, c.lng);
        });
        baseRef.current = base;
        const p = pending.current;
        if (p) base.map.jumpTo({ center: [p.lng, p.lat], ...(p.zoom ? { zoom: p.zoom } : {}) });
        pending.current = null;
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('unsupported');
      });
    return () => {
      cancelled = true;
      baseRef.current?.destroy();
      baseRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    centerOn(lat, lng, zoom) {
      const map = baseRef.current?.map;
      if (!map) {
        pending.current = { lat, lng, zoom };
        return;
      }
      map.easeTo({ center: [lng, lat], zoom: zoom ?? Math.max(map.getZoom(), 15), duration: 650 });
    },
  }));

  return (
    <View style={[styles.wrap, style]}>
      <div ref={el} data-testid={testID} style={{ position: 'absolute', inset: 0, zIndex: 0 }} />
      {status !== 'ready' ? (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayText}>
            {status === 'loading' ? 'Chargement de la carte…' : 'Carte indisponible : indiquez l’adresse et le repère.'}
          </Text>
        </View>
      ) : null}
      <MapAttribution />
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', backgroundColor: MAP_PALETTE.background },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  overlayText: { color: MAP_PALETTE.overlayText, fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
