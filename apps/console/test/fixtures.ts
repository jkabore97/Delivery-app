import type {
  BusinessBalanceDto,
  CashOverviewDto,
  DashboardDto,
  DriverProfileDto,
  IncidentDto,
  MapDataDto,
  OrderDto,
  Paginated,
  PendingOrderDto,
  PricingRuleDto,
  UserDto,
} from '@yaar/shared';

export const dashboard: DashboardDto = {
  onlineDrivers: { total: 86, byVehicle: { BIKE: 14, MOTO: 61, CAR: 11 }, busy: 40 },
  activeOrders: 42,
  waitingForDriver: 4,
  waitingOver5Min: 1,
  deliveredToday: 318,
  cancelledToday: 3,
  avgDeliveryMinutesToday: 27,
  cashHeldTotal: 1_840_000,
  driversAtCashLimit: 3,
  pendingKyc: 7,
  openIncidents: 2,
  generatedAt: '2026-11-06T19:26:46.740Z',
};

export const sos: IncidentDto = {
  id: 'inc-1',
  type: 'SOS',
  status: 'OPEN',
  description: 'Crevaison, besoin d’assistance',
  lat: 12.3985,
  lng: -1.519,
  orderId: null,
  orderNumber: null,
  reporter: { id: 'drv-karim', name: 'Karim D.', phone: '+22673000002', role: 'DRIVER' },
  resolutionNote: null,
  resolvedBy: null,
  createdAt: '2026-11-06T19:23:16.215Z',
  resolvedAt: null,
};

export const mapData: MapDataDto = {
  center: { lat: 12.3714, lng: -1.5197 },
  drivers: [
    {
      id: 'drv-karim',
      name: 'Karim D.',
      vehicleType: 'MOTO',
      isBusy: false,
      lat: 12.3985,
      lng: -1.519,
      lastLocationAt: '2026-11-06T19:22:16.018Z',
      activeOrderId: null,
    },
    {
      id: 'drv-fati',
      name: 'Fatimata Z.',
      vehicleType: 'BIKE',
      isBusy: true,
      lat: 12.38,
      lng: -1.5,
      lastLocationAt: '2026-11-06T19:22:16.018Z',
      activeOrderId: 'ord-1',
    },
  ],
  orders: [],
  stores: [{ id: 'st-1', name: 'Le Verdoyant', lat: 12.3686, lng: -1.5275, isOpen: true }],
  openSos: [],
};

export const pendingOrder: PendingOrderDto = {
  id: 'ord-1052',
  number: 1052,
  type: 'PARCEL',
  status: 'SEARCHING_DRIVER',
  vehicleType: 'MOTO',
  pickupAddress: 'Zogona',
  dropoffAddress: 'Tampouy',
  total: 1950,
  waitingSeconds: 372,
  currentOffer: null,
  createdAt: '2026-11-06T19:17:16.018Z',
};

export function driverProfile(over: Partial<DriverProfileDto> = {}): DriverProfileDto {
  return {
    userId: 'drv-ousmane',
    name: 'Ousmane B.',
    phone: '+22673000006',
    vehicleType: 'MOTO',
    plate: '11 KM 2280',
    status: 'PENDING',
    isOnline: false,
    isBusy: false,
    isSuspendedUser: false,
    cashHeld: 0,
    cashLimit: 50000,
    cashBlocked: false,
    rejectionReason: null,
    suspensionReason: null,
    ratingAvg: null,
    ratingCount: 0,
    documents: [
      { id: 'd1', type: 'CNIB', mimeType: 'image/png', sizeBytes: 70, expiresAt: null, isExpired: false, uploadedAt: '2026-11-06T10:00:00.000Z' },
      { id: 'd2', type: 'PERMIS', mimeType: 'image/png', sizeBytes: 70, expiresAt: null, isExpired: false, uploadedAt: '2026-11-06T10:00:00.000Z' },
      { id: 'd3', type: 'CARTE_GRISE', mimeType: 'image/png', sizeBytes: 70, expiresAt: null, isExpired: false, uploadedAt: '2026-11-06T10:00:00.000Z' },
      { id: 'd4', type: 'ASSURANCE', mimeType: 'image/png', sizeBytes: 70, expiresAt: '2027-03-31T00:00:00.000Z', isExpired: false, uploadedAt: '2026-11-06T10:00:00.000Z' },
      { id: 'd5', type: 'SELFIE', mimeType: 'image/png', sizeBytes: 70, expiresAt: null, isExpired: false, uploadedAt: '2026-11-06T10:00:00.000Z' },
    ],
    requiredDocuments: ['CNIB', 'PERMIS', 'CARTE_GRISE', 'ASSURANCE', 'SELFIE'],
    missingDocuments: [],
    kycComplete: true,
    lastLocation: null,
    approvedAt: null,
    createdAt: '2026-11-06T10:00:00.000Z',
    ...over,
  };
}

export function order(over: Partial<OrderDto> = {}): OrderDto {
  return {
    id: 'ord-1',
    number: 1052,
    type: 'PARCEL',
    status: 'SEARCHING_DRIVER',
    vehicleType: 'MOTO',
    paymentMethod: 'CASH',
    paymentStatus: 'PENDING',
    client: { id: 'cli-1', name: 'Aminata S.', phone: '+22670111111' },
    store: null,
    driver: null,
    pickup: { lat: 12.38, lng: -1.5, address: 'Zogona', landmark: 'Près de la pharmacie' },
    dropoff: { lat: 12.4, lng: -1.53, address: 'Tampouy', landmark: '' },
    recipientName: null,
    recipientPhone: null,
    parcelDescription: 'Documents',
    notes: null,
    items: [],
    distanceKm: 6,
    itemsTotal: 0,
    deliveryFee: 1950,
    total: 1950,
    commission: 293,
    driverEarning: 1657,
    sellerPayout: null,
    deliveryCode: null,
    cashCollected: null,
    prepTimeMinutes: null,
    hasProofPhoto: false,
    cancelReason: null,
    createdAt: '2026-11-06T19:17:16.018Z',
    acceptedAt: null,
    readyAt: null,
    assignedAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    cancelledAt: null,
    myRating: null,
    canRate: false,
    events: [],
    ...over,
  };
}

export const cashOverview: CashOverviewDto = {
  cashLimit: 50000,
  totalHeld: 62000,
  drivers: [
    {
      driverId: 'drv-karim',
      name: 'Karim D.',
      phone: '+22673000002',
      vehicleType: 'MOTO',
      cashHeld: 52000,
      cashBlocked: true,
      lastDepositAt: null,
    },
    {
      driverId: 'drv-fati',
      name: 'Fatimata Z.',
      phone: '+22673000003',
      vehicleType: 'BIKE',
      cashHeld: 10000,
      cashBlocked: false,
      lastDepositAt: null,
    },
  ],
};

export const pricingRules: PricingRuleDto[] = [
  { vehicleType: 'BIKE', baseFare: 500, perKm: 150, minimumFare: 1000, commissionPercent: 15, isActive: true, updatedAt: '2026-11-01T10:00:00.000Z' },
  { vehicleType: 'MOTO', baseFare: 700, perKm: 200, minimumFare: 1500, commissionPercent: 15, isActive: true, updatedAt: '2026-11-01T10:00:00.000Z' },
  { vehicleType: 'CAR', baseFare: 1500, perKm: 350, minimumFare: 3000, commissionPercent: 15, isActive: true, updatedAt: '2026-11-01T10:00:00.000Z' },
];

export function user(over: Partial<UserDto> = {}): UserDto {
  return {
    id: 'cli-1',
    phone: '+22670111111',
    name: 'Aminata S.',
    role: 'CLIENT',
    isSuspended: false,
    suspensionReason: null,
    createdAt: '2026-11-01T10:00:00.000Z',
    ...over,
  };
}

export function page<T>(items: T[]): Paginated<T> {
  return { items, total: items.length, page: 1, pageSize: 20 };
}

/* ------------------------------ Livraisons d'entreprise (B2B) ------------------------------ */

/** Livraison demandée par une entreprise (Tech Plus) pour une entreprise destinataire, livreur en route vers le retrait. */
export function businessOrder(over: Partial<OrderDto> = {}): OrderDto {
  return order({
    id: 'ord-b2b',
    number: 1004,
    type: 'PARCEL',
    status: 'ASSIGNED',
    vehicleType: 'CAR',
    client: { id: 'u-biz', name: 'Boukary Compaoré', phone: '+22671000004' },
    store: { id: 'st-tech', name: 'Tech Plus Électronique', phone: '+22671000004' },
    driver: {
      id: 'drv-abdoul',
      name: 'Abdoul T.',
      phone: '+22673000004',
      vehicleType: 'CAR',
      plate: '11 HH 0917',
      ratingAvg: null,
      lastLocation: { lat: 12.392, lng: -1.545, at: '2026-11-08T21:50:00.000Z', heading: 314 },
    },
    pickup: { lat: 12.405, lng: -1.559, address: 'Tampouy, marché', landmark: 'Entrée principale du marché' },
    dropoff: { lat: 12.375, lng: -1.47, address: 'Dassasgho, route de Fada', landmark: 'Immeuble bleu, 2e étage' },
    recipientName: 'Bureau Faso Conseil',
    recipientPhone: '+22625370000',
    recipientIsBusiness: true,
    parcelDescription: 'Téléphone Tecno Camon (boîte scellée)',
    distanceKm: 12.3,
    itemsTotal: 85_000,
    deliveryFee: 5800,
    total: 90_800,
    commission: 1160,
    driverEarning: 4640,
    sellerPayout: 85_000,
    feePaidBy: 'SENDER',
    cashToCollect: 85_000,
    trackingUrl: 'https://yaar-livraison.vercel.app/suivi/AbCdEfGhIjKlMnOpQrStUvWx',
    etaMinutes: 49,
    route: {
      target: 'PICKUP',
      points: [
        [12.392, -1.545],
        [12.3982, -1.5517],
        [12.405, -1.559],
      ],
      distanceM: 2620,
      durationS: 429,
      source: 'osrm',
      computedAt: '2026-11-08T21:50:01.000Z',
    },
    createdAt: '2026-11-08T21:40:00.000Z',
    assignedAt: '2026-11-08T21:48:00.000Z',
    events: [
      { id: 'e1', fromStatus: null, toStatus: 'PENDING', actorRole: 'SELLER', note: null, createdAt: '2026-11-08T21:40:00.000Z' },
      { id: 'e2', fromStatus: 'PENDING', toStatus: 'SEARCHING_DRIVER', actorRole: null, note: null, createdAt: '2026-11-08T21:40:00.000Z' },
      { id: 'e3', fromStatus: 'SEARCHING_DRIVER', toStatus: 'ASSIGNED', actorRole: null, note: null, createdAt: '2026-11-08T21:48:00.000Z' },
    ],
    ...over,
  });
}

/** Ancienne commande repas (parcours client abandonné), avec ses articles. */
export function legacyFoodOrder(over: Partial<OrderDto> = {}): OrderDto {
  return order({
    id: 'ord-food',
    number: 990,
    type: 'FOOD',
    status: 'DELIVERED',
    store: { id: 'st-1', name: 'Le Verdoyant', phone: '+22671000001' },
    items: [{ productId: 'p1', name: 'Riz gras', unitPrice: 2500, quantity: 2, lineTotal: 5000 }],
    itemsTotal: 5000,
    deliveryFee: 1500,
    total: 6500,
    sellerPayout: 4250,
    feePaidBy: null,
    cashToCollect: null,
    trackingUrl: null,
    ...over,
  });
}

export const businessBalances: BusinessBalanceDto[] = [
  {
    storeId: 'st-kaya',
    storeName: 'Kaya Market',
    ownerId: 'u-kaya',
    ownerName: 'Salimata Traoré',
    phone: '+22671000005',
    owedTotal: 17_000,
    deliveries: 2,
    lastDeliveredAt: '2026-11-08T14:03:00.000Z',
  },
  {
    storeId: 'st-pharma',
    storeName: 'Pharmacie du Progrès',
    ownerId: 'u-pharma',
    ownerName: 'Dr Moussa Sawadogo',
    phone: '+22671000002',
    owedTotal: 8500,
    deliveries: 1,
    lastDeliveredAt: '2026-11-08T09:12:00.000Z',
  },
];

/** Carte en direct B2B : une livraison en route (itinéraire routier), une vers le retrait (ligne droite), une en attente. */
export const b2bMapData: MapDataDto = {
  center: { lat: 12.3714, lng: -1.5197 },
  drivers: [
    { id: 'drv-issouf', name: 'Issouf S.', vehicleType: 'MOTO', isBusy: true, lat: 12.3372, lng: -1.5141, lastLocationAt: '2026-11-08T21:50:00.000Z', activeOrderId: 'ord-1003', heading: 135 },
    { id: 'drv-abdoul', name: 'Abdoul T.', vehicleType: 'CAR', isBusy: true, lat: 12.392, lng: -1.545, lastLocationAt: '2026-11-08T21:50:00.000Z', activeOrderId: 'ord-1004', heading: null },
    { id: 'drv-fati', name: 'Fatimata Z.', vehicleType: 'BIKE', isBusy: false, lat: 12.379, lng: -1.501, lastLocationAt: '2026-11-08T21:50:00.000Z', activeOrderId: null, heading: 90 },
  ],
  orders: [
    {
      id: 'ord-1003', number: 1003, type: 'PARCEL', status: 'PICKED_UP', vehicleType: 'MOTO',
      pickup: { lat: 12.3686, lng: -1.5275, address: 'Avenue Kwame Nkrumah' },
      dropoff: { lat: 12.3226, lng: -1.4977, address: 'Ouaga 2000' },
      driverId: 'drv-issouf', createdAt: '2026-11-08T21:25:00.000Z',
      route: {
        target: 'DROPOFF',
        points: [[12.3395, -1.517], [12.3349, -1.5112], [12.331, -1.5101], [12.3248, -1.5021], [12.3226, -1.4977]],
        distanceM: 3100, durationS: 520, source: 'osrm', computedAt: '2026-11-08T21:49:00.000Z',
      },
    },
    {
      id: 'ord-1004', number: 1004, type: 'PARCEL', status: 'ASSIGNED', vehicleType: 'CAR',
      pickup: { lat: 12.405, lng: -1.559, address: 'Tampouy, marché' },
      dropoff: { lat: 12.375, lng: -1.47, address: 'Dassasgho' },
      driverId: 'drv-abdoul', createdAt: '2026-11-08T21:40:00.000Z',
      route: { target: 'PICKUP', points: [[12.392, -1.545], [12.405, -1.559]], distanceM: 2620, durationS: 429, source: 'straight', computedAt: '2026-11-08T21:49:00.000Z' },
    },
    {
      id: 'ord-1005', number: 1005, type: 'PARCEL', status: 'SEARCHING_DRIVER', vehicleType: 'BIKE',
      pickup: { lat: 12.3805, lng: -1.4975, address: 'Zogona' },
      dropoff: { lat: 12.3765, lng: -1.4855, address: 'Wemtenga' },
      driverId: null, createdAt: '2026-11-08T21:58:00.000Z', route: null,
    },
  ],
  stores: [
    { id: 'st-verdoyant', name: 'Le Verdoyant', lat: 12.3686, lng: -1.5275, isOpen: true },
    { id: 'st-tech', name: 'Tech Plus Électronique', lat: 12.405, lng: -1.559, isOpen: true },
    { id: 'st-mode', name: 'Faso Mode Boutique', lat: 12.3805, lng: -1.4975, isOpen: true },
    { id: 'st-pissy', name: 'Grillades de Pissy', lat: 12.34, lng: -1.57, isOpen: false },
  ],
  openSos: [sos, { ...sos, id: 'inc-nolatlng', lat: null, lng: null }],
};
