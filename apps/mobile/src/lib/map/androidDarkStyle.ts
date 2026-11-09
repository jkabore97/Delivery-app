/**
 * Style Google Maps (Android) du fond sombre, dans un module à part : seul LiveMap.tsx (natif) l'importe, il n'alourdit
 * donc pas la version web (page publique de suivi comprise).
 */
/** Google Maps (Android), fond sombre : style « de nuit » aux teintes de l'application, points d'intérêt masqués. */
export const ANDROID_MAP_STYLE_DARK = [
  { elementType: 'geometry', stylers: [{ color: '#1a201e' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8d9a93' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#131917' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#2b3531' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#1c2a23' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2a3330' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#1f2724' }] },
  { featureType: 'road.arterial', elementType: 'labels.text.fill', stylers: [{ color: '#9aa6a0' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#36423d' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#6f7b75' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0f1b20' }] },
];
