import type {
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
