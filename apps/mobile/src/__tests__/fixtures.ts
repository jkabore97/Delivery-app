import type { DriverProfileDto, OfferDto, OrderDto, RouteDto, StoreDto, TrackingDto } from '@yaar/shared';

/** Données de test (pas de dépendance réseau). */
export function driverProfile(over: Partial<DriverProfileDto> = {}): DriverProfileDto {
  return {
    userId: 'u-driver',
    name: 'Issa',
    phone: '+22670000001',
    vehicleType: 'MOTO',
    plate: '11 AA 2222',
    status: 'APPROVED',
    isOnline: false,
    isBusy: false,
    isSuspendedUser: false,
    cashHeld: 0,
    cashLimit: 50000,
    cashBlocked: false,
    rejectionReason: null,
    suspensionReason: null,
    ratingAvg: 4.8,
    ratingCount: 12,
    documents: [],
    requiredDocuments: [],
    missingDocuments: [],
    kycComplete: true,
    lastLocation: null,
    approvedAt: '2026-11-01T08:00:00.000Z',
    trackingConsentAt: '2026-11-01T08:05:00.000Z',
    createdAt: '2026-10-01T08:00:00.000Z',
    ...over,
  };
}

export function offer(over: Partial<OfferDto> = {}): OfferDto {
  return {
    id: 'offer-1',
    orderId: 'order-1',
    orderNumber: 1048,
    orderType: 'FOOD',
    status: 'OFFERED',
    vehicleType: 'MOTO',
    offeredAt: '2026-11-06T09:43:00.000Z',
    expiresAt: '2026-11-06T09:43:30.000Z',
    pickup: {
      address: 'Avenue Kwame Nkrumah, centre-ville',
      name: 'Maquis Le Verdoyant',
      distanceFromDriverKm: 1.2,
      zone: 'Secteur Centre-ville',
    },
    dropoff: { address: 'Secteur Patte d’Oie', zone: 'Secteur Patte d’Oie' },
    distanceKm: 4.1,
    cashToCollect: 4500,
    driverEarning: 1200,
    ...over,
  };
}

export function order(over: Partial<OrderDto> = {}): OrderDto {
  return {
    id: 'order-1',
    number: 1048,
    type: 'FOOD',
    status: 'ASSIGNED',
    vehicleType: 'MOTO',
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    client: { id: 'u-client', name: 'Awa', phone: '+22670000002' },
    store: null,
    driver: null,
    pickup: { lat: 12.3803, lng: -1.4986, address: 'Zogona', landmark: 'Pharmacie' },
    dropoff: { lat: 12.3365, lng: -1.5284, address: 'Patte d’Oie', landmark: 'Station Total' },
    recipientName: null,
    recipientPhone: null,
    parcelDescription: null,
    notes: null,
    items: [],
    distanceKm: 4.1,
    itemsTotal: 3000,
    deliveryFee: 1500,
    total: 4500,
    commission: null,
    driverEarning: 1200,
    sellerPayout: null,
    deliveryCode: null,
    cashCollected: null,
    prepTimeMinutes: null,
    hasProofPhoto: false,
    cancelReason: null,
    createdAt: '2026-11-06T09:30:00.000Z',
    acceptedAt: null,
    readyAt: null,
    assignedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    cancelledAt: null,
    myRating: null,
    canRate: false,
    ...over,
  };
}

/** Itinéraire réaliste (centre-ville → Patte d'Oie), [lat, lng]. */
export const ROUTE_POINTS: Array<[number, number]> = [
  [12.3686, -1.5275],
  [12.3633, -1.5255],
  [12.3627, -1.521],
  [12.3538, -1.5191],
  [12.3502, -1.5209],
  [12.3436, -1.5198],
  [12.3395, -1.517],
];

export function route(over: Partial<RouteDto> = {}): RouteDto {
  return { target: 'DROPOFF', points: ROUTE_POINTS, distanceM: 4100, durationS: 780, source: 'osrm', computedAt: '2026-11-08T14:00:00.000Z', ...over };
}

export function businessStore(over: Partial<StoreDto> = {}): StoreDto {
  return {
    id: 'store-1',
    ownerId: 'u-biz',
    name: 'Pharmacie du Centre',
    description: 'Pharmacie',
    phone: '+22671000001',
    address: 'Avenue Kwame Nkrumah',
    landmark: 'En face de la BCEAO',
    lat: 12.3686,
    lng: -1.5275,
    isOpen: true,
    prepTimeMinutes: 15,
    openingHours: '',
    commissionPercent: 10,
    distanceKm: null,
    approvalStatus: 'APPROVED',
    approvalNote: null,
    createdAt: '2026-10-01T08:00:00.000Z',
    ...over,
  };
}

/** Livraison d'entreprise vue par l'entreprise (jamais de code de livraison côté API). */
export function delivery(over: Partial<OrderDto> = {}): OrderDto {
  return order({
    id: 'del-1',
    number: 1052,
    type: 'PARCEL',
    status: 'PICKED_UP',
    client: { id: 'u-biz', name: 'Awa Ouédraogo', phone: '+22671000001' },
    store: { id: 'store-1', name: 'Pharmacie du Centre', phone: '+22671000001' },
    driver: {
      id: 'd-1',
      name: 'Issouf Sawadogo',
      phone: '+22673000001',
      vehicleType: 'MOTO',
      plate: '11 JJ 4521',
      ratingAvg: 4.9,
      lastLocation: { lat: 12.3627, lng: -1.521, at: '2026-11-08T14:10:00.000Z', heading: 170 },
    },
    pickup: { lat: 12.3686, lng: -1.5275, address: 'Avenue Kwame Nkrumah', landmark: 'En face de la BCEAO' },
    dropoff: { lat: 12.3395, lng: -1.517, address: 'Patte d’Oie, rue 15.23', landmark: 'Station Total' },
    recipientName: 'Awa Kaboré',
    recipientPhone: '+22670112233',
    parcelDescription: '2 boîtes de médicaments',
    itemsTotal: 0,
    deliveryFee: 1500,
    total: 1500,
    driverEarning: null,
    feePaidBy: 'RECIPIENT',
    cashToCollect: 15000,
    recipientIsBusiness: false,
    trackingUrl: 'https://yaar-livraison.vercel.app/suivi/tok-abc',
    route: route(),
    etaMinutes: 9,
    ...over,
  });
}

export function tracking(over: Partial<TrackingDto> = {}): TrackingDto {
  return {
    number: 1052,
    status: 'PICKED_UP',
    vehicleType: 'MOTO',
    sender: { name: 'Pharmacie du Centre', phone: '+22671000001' },
    recipientName: 'Awa Kaboré',
    packageDescription: '2 boîtes de médicaments',
    pickup: { lat: 12.3686, lng: -1.5275, address: 'Avenue Kwame Nkrumah' },
    dropoff: { lat: 12.3395, lng: -1.517, address: 'Patte d’Oie, rue 15.23', landmark: 'Station Total' },
    amountToPay: 16500,
    driver: {
      firstName: 'Issouf',
      vehicleType: 'MOTO',
      plate: '11 JJ 4521',
      phone: '+22673000001',
      ratingAvg: 4.9,
      lastLocation: { lat: 12.3627, lng: -1.521, at: '2026-11-08T14:10:00.000Z', heading: 170 },
    },
    route: route(),
    etaMinutes: 9,
    deliveryCode: '4821',
    createdAt: '2026-11-08T13:50:00.000Z',
    assignedAt: '2026-11-08T13:55:00.000Z',
    pickedUpAt: '2026-11-08T14:05:00.000Z',
    deliveredAt: null,
    cancelledAt: null,
    updatedAt: '2026-11-08T14:05:00.000Z',
    ...over,
  };
}
