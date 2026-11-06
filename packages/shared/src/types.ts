/**
 * Contrat des réponses JSON de l'API (DTO). Les dates sont des chaînes ISO 8601,
 * les montants des entiers en FCFA, les distances des kilomètres (1 décimale).
 * Voir docs/API.md pour les routes qui renvoient chaque type.
 */
import type {
  CashEntryType,
  DocumentType,
  DriverStatus,
  ErrorCode,
  IncidentStatus,
  IncidentType,
  OfferStatus,
  OrderStatus,
  OrderType,
  StoreApprovalStatus,
  PaymentMethod,
  PaymentStatus,
  Role,
  VehicleType,
} from './enums';

export type IsoDateString = string;

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    /** Détails de validation zod (chemin -> messages), le cas échéant. */
    details?: Record<string, string[]>;
  };
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

/* ---------------------------- Utilisateurs ---------------------------- */

export interface UserDto {
  id: string;
  phone: string;
  name: string | null;
  role: Role;
  isSuspended: boolean;
  suspensionReason: string | null;
  createdAt: IsoDateString;
}

export interface AuthResponse {
  accessToken: string;
  tokenType: 'Bearer';
  /** Durée de validité en secondes. */
  expiresIn: number;
  isNewUser: boolean;
  user: UserDto;
}

export interface OtpRequestResponse {
  sent: true;
  expiresInSeconds: number;
}

export interface AddressDto {
  lat: number;
  lng: number;
  address: string;
  landmark: string;
}

export interface SavedAddressDto extends AddressDto {
  id: string;
  label: string;
  createdAt: IsoDateString;
}

/* ---------------------------- Boutiques ---------------------------- */

export interface StoreDto {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  phone: string | null;
  address: string;
  landmark: string;
  lat: number;
  lng: number;
  isOpen: boolean;
  prepTimeMinutes: number;
  openingHours: string;
  /** Vendeur propriétaire et console uniquement (null pour les autres). */
  commissionPercent: number | null;
  /** Distance à vol d'oiseau depuis (lat,lng) de la requête, sinon null. */
  distanceKm: number | null;
  /** Validation par la console : seules les boutiques APPROVED sont visibles des clients. */
  approvalStatus?: StoreApprovalStatus;
  /** Motif de suspension / remarque de la console (vendeur propriétaire et console). */
  approvalNote?: string | null;
  createdAt: IsoDateString;
}

export interface ProductDto {
  id: string;
  storeId: string;
  name: string;
  description: string;
  category: string;
  price: number;
  isAvailable: boolean;
  /** Chemin relatif de la photo (GET /products/:id/photo), null sans photo. */
  photoUrl?: string | null;
}

export interface StoreDetailDto extends StoreDto {
  products: ProductDto[];
}

export interface SellerStatsDto {
  storeId: string;
  /** Statistiques du jour (fuseau Africa/Ouagadougou = UTC). */
  today: {
    orders: number;
    delivered: number;
    cancelled: number;
    sales: number;
    commission: number;
    payout: number;
    avgPrepMinutes: number | null;
  };
  pendingOrders: number;
}

/* ---------------------------- Commandes ---------------------------- */

export interface QuoteOptionDto {
  vehicleType: VehicleType;
  available: boolean;
  deliveryFee: number;
  total: number;
  estimatedMinutes: number;
}

export interface QuoteResponse {
  type: OrderType;
  distanceKm: number;
  itemsTotal: number;
  pickup: AddressDto;
  dropoff: AddressDto;
  paymentMethods: PaymentMethod[];
  options: QuoteOptionDto[];
}

export interface OrderItemDto {
  productId: string | null;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderEventDto {
  id: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  actorRole: Role | null;
  note: string | null;
  createdAt: IsoDateString;
}

export interface OrderPartyDto {
  id: string;
  name: string | null;
  /** null quand la règle de confidentialité masque le numéro. */
  phone: string | null;
}

export interface OrderDriverDto {
  id: string;
  name: string | null;
  phone: string | null;
  vehicleType: VehicleType;
  plate: string | null;
  ratingAvg: number | null;
  /** Dernière position connue (uniquement pendant ASSIGNED / PICKED_UP). */
  lastLocation: { lat: number; lng: number; at: IsoDateString } | null;
}

export interface OrderStoreDto {
  id: string;
  name: string;
  phone: string | null;
}

/**
 * Commande vue par l'utilisateur courant. Certains champs sont masqués (null)
 * selon le rôle et le statut, cf. docs/API.md § « Visibilité ».
 */
export interface OrderDto {
  id: string;
  /** Numéro lisible (#1048). */
  number: number;
  type: OrderType;
  status: OrderStatus;
  vehicleType: VehicleType;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  client: OrderPartyDto | null;
  store: OrderStoreDto | null;
  driver: OrderDriverDto | null;
  pickup: AddressDto | null;
  dropoff: AddressDto | null;
  recipientName: string | null;
  recipientPhone: string | null;
  parcelDescription: string | null;
  notes: string | null;
  items: OrderItemDto[];
  distanceKm: number;
  itemsTotal: number;
  deliveryFee: number;
  total: number;
  /** Contrôleurs uniquement. */
  commission: number | null;
  /** Livreur affecté et contrôleurs. */
  driverEarning: number | null;
  /** Vendeur et contrôleurs. */
  sellerPayout: number | null;
  /** Client uniquement (code à 4 chiffres à donner au livreur). */
  deliveryCode: string | null;
  cashCollected: number | null;
  prepTimeMinutes: number | null;
  hasProofPhoto: boolean;
  cancelReason: string | null;
  createdAt: IsoDateString;
  acceptedAt: IsoDateString | null;
  readyAt: IsoDateString | null;
  assignedAt: IsoDateString | null;
  pickedUpAt: IsoDateString | null;
  deliveredAt: IsoDateString | null;
  cancelledAt: IsoDateString | null;
  /** Note déjà donnée par l'utilisateur courant pour cette commande. */
  myRating: number | null;
  canRate: boolean;
  /**
   * Estimation d'arrivée en minutes (ASSIGNED : jusqu'au retrait puis à la livraison ; PICKED_UP : jusqu'à
   * la livraison), calculée depuis la dernière position du livreur. Client, vendeur et console.
   */
  etaMinutes?: number | null;
  /** Historique des statuts : présent sur GET /orders/:id uniquement. */
  events?: OrderEventDto[];
}

/* ---------------------------- Livreurs ---------------------------- */

export interface DriverDocumentDto {
  id: string;
  type: DocumentType;
  mimeType: string;
  sizeBytes: number;
  expiresAt: IsoDateString | null;
  isExpired: boolean;
  uploadedAt: IsoDateString;
}

export interface DriverProfileDto {
  userId: string;
  name: string | null;
  phone: string;
  vehicleType: VehicleType;
  plate: string | null;
  status: DriverStatus;
  isOnline: boolean;
  isBusy: boolean;
  isSuspendedUser: boolean;
  cashHeld: number;
  cashLimit: number;
  cashBlocked: boolean;
  rejectionReason: string | null;
  suspensionReason: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  documents: DriverDocumentDto[];
  requiredDocuments: DocumentType[];
  missingDocuments: DocumentType[];
  kycComplete: boolean;
  lastLocation: { lat: number; lng: number; at: IsoDateString } | null;
  approvedAt: IsoDateString | null;
  /** Date du consentement au suivi GPS ; null = pas de consentement (passage en ligne refusé). */
  trackingConsentAt?: IsoDateString | null;
  createdAt: IsoDateString;
}

export interface OfferDto {
  id: string;
  orderId: string;
  orderNumber: number;
  orderType: OrderType;
  status: OfferStatus;
  vehicleType: VehicleType;
  offeredAt: IsoDateString;
  expiresAt: IsoDateString;
  /**
   * Avant acceptation, aucune adresse du client n'est transmise : `address` vaut l'adresse de la boutique
   * (FOOD) ou une zone approximative « Secteur … » (colis, livraison). `zone` reprend cette zone.
   */
  pickup: { address: string; name: string | null; distanceFromDriverKm: number | null; zone?: string };
  dropoff: { address: string; zone?: string };
  distanceKm: number;
  cashToCollect: number;
  driverEarning: number;
}

export interface CashLedgerEntryDto {
  id: string;
  driverId: string;
  driverName: string | null;
  type: CashEntryType;
  /** Positif pour un encaissement, négatif pour un versement. */
  amount: number;
  balanceAfter: number;
  orderId: string | null;
  orderNumber: number | null;
  note: string | null;
  recordedBy: { id: string; name: string | null } | null;
  createdAt: IsoDateString;
}

export interface DriverEarningsDto {
  today: { deliveries: number; earnings: number; cashCollected: number };
  allTime: { deliveries: number; earnings: number };
  cashHeld: number;
  cashLimit: number;
  cashBlocked: boolean;
  recentLedger: CashLedgerEntryDto[];
}

/* ---------------------------- Incidents / notes ---------------------------- */

export interface IncidentDto {
  id: string;
  type: IncidentType;
  status: IncidentStatus;
  description: string;
  lat: number | null;
  lng: number | null;
  orderId: string | null;
  orderNumber: number | null;
  reporter: { id: string; name: string | null; phone: string; role: Role };
  resolutionNote: string | null;
  resolvedBy: { id: string; name: string | null } | null;
  createdAt: IsoDateString;
  resolvedAt: IsoDateString | null;
}

export interface RatingDto {
  id: string;
  orderId: string;
  fromUserId: string;
  toUserId: string;
  score: number;
  comment: string | null;
  createdAt: IsoDateString;
}

/* ---------------------------- Console ---------------------------- */

export interface DashboardDto {
  onlineDrivers: { total: number; byVehicle: Record<VehicleType, number>; busy: number };
  activeOrders: number;
  waitingForDriver: number;
  /** Commandes en recherche de livreur depuis plus de 5 minutes. */
  waitingOver5Min: number;
  deliveredToday: number;
  cancelledToday: number;
  /** Durée moyenne création -> livraison des commandes livrées aujourd'hui. */
  avgDeliveryMinutesToday: number | null;
  cashHeldTotal: number;
  driversAtCashLimit: number;
  pendingKyc: number;
  openIncidents: number;
  generatedAt: IsoDateString;
}

export interface MapDriverDto {
  id: string;
  name: string | null;
  vehicleType: VehicleType;
  isBusy: boolean;
  lat: number;
  lng: number;
  lastLocationAt: IsoDateString | null;
  activeOrderId: string | null;
}

export interface MapOrderDto {
  id: string;
  number: number;
  type: OrderType;
  status: OrderStatus;
  vehicleType: VehicleType;
  pickup: { lat: number; lng: number; address: string };
  dropoff: { lat: number; lng: number; address: string };
  driverId: string | null;
  createdAt: IsoDateString;
}

export interface MapStoreDto {
  id: string;
  name: string;
  lat: number;
  lng: number;
  isOpen: boolean;
}

export interface MapDataDto {
  center: { lat: number; lng: number };
  drivers: MapDriverDto[];
  orders: MapOrderDto[];
  stores: MapStoreDto[];
  openSos: IncidentDto[];
}

export interface PendingOrderDto {
  id: string;
  number: number;
  type: OrderType;
  status: OrderStatus;
  vehicleType: VehicleType;
  pickupAddress: string;
  dropoffAddress: string;
  total: number;
  /** Secondes écoulées depuis le passage en SEARCHING_DRIVER. */
  waitingSeconds: number;
  currentOffer: { driverId: string; driverName: string | null; expiresAt: IsoDateString } | null;
  createdAt: IsoDateString;
}

export interface DriverCandidateDto {
  id: string;
  name: string | null;
  phone: string;
  vehicleType: VehicleType;
  isOnline: boolean;
  isBusy: boolean;
  cashBlocked: boolean;
  distanceKm: number | null;
}

export interface PricingRuleDto {
  vehicleType: VehicleType;
  baseFare: number;
  perKm: number;
  minimumFare: number;
  commissionPercent: number;
  isActive: boolean;
  updatedAt: IsoDateString;
}

export interface CashOverviewDto {
  cashLimit: number;
  totalHeld: number;
  drivers: Array<{
    driverId: string;
    name: string | null;
    phone: string;
    vehicleType: VehicleType;
    cashHeld: number;
    cashBlocked: boolean;
    lastDepositAt: IsoDateString | null;
  }>;
}

export interface AuditLogDto {
  id: string;
  actor: { id: string; name: string | null; role: Role } | null;
  action: string;
  entityType: string;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: IsoDateString;
}

export interface OrderMessageDto {
  id: string;
  orderId: string;
  sender: { id: string; name: string | null; role: Role };
  body: string;
  createdAt: IsoDateString;
}

/* ---------------------------- Temps réel (Socket.IO) ---------------------------- */

export interface OrderUpdatedEvent {
  orderId: string;
  number: number;
  status: OrderStatus;
  driverId: string | null;
  updatedAt: IsoDateString;
}

export interface DriverLocationEvent {
  driverId: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  /** Commande active du livreur (null si libre). */
  orderId: string | null;
  at: IsoDateString;
}

export interface OfferClosedEvent {
  offerId: string;
  orderId: string;
  status: OfferStatus;
}

export interface SosEvent {
  incident: IncidentDto;
}

export interface IncidentEvent {
  incident: IncidentDto;
}

export interface DriverStatusEvent {
  driverId: string;
  isOnline: boolean;
  isBusy: boolean;
}

export interface ServerToClientEvents {
  'order.updated': (e: OrderUpdatedEvent) => void;
  'driver.location': (e: DriverLocationEvent) => void;
  'driver.status': (e: DriverStatusEvent) => void;
  'offer.new': (e: OfferDto) => void;
  'offer.closed': (e: OfferClosedEvent) => void;
  sos: (e: SosEvent) => void;
  'incident.updated': (e: IncidentEvent) => void;
  'order.message': (e: OrderMessageDto) => void;
}

export interface SubscribeAck {
  ok: boolean;
  error?: { code: ErrorCode; message: string };
}

export interface ClientToServerEvents {
  'order.subscribe': (p: { orderId: string }, ack: (r: SubscribeAck) => void) => void;
  'order.unsubscribe': (p: { orderId: string }, ack?: (r: SubscribeAck) => void) => void;
}
