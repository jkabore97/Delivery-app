/**
 * Énumérations du domaine. Chaque énumération est exposée sous deux formes :
 * - un objet constant (ex. `Role.CLIENT`) utilisable à l'exécution ;
 * - un type union (ex. `Role`) pour le typage.
 * Les valeurs sont identiques aux enums Prisma de l'API.
 */

export const Role = {
  CLIENT: 'CLIENT',
  SELLER: 'SELLER',
  DRIVER: 'DRIVER',
  CONTROLLER: 'CONTROLLER',
  ADMIN: 'ADMIN',
} as const;
export type Role = (typeof Role)[keyof typeof Role];
export const ROLES = Object.values(Role) as Role[];
/** Rôles qu'un utilisateur peut choisir lui-même à l'inscription. */
export const SELF_SIGNUP_ROLES = [Role.CLIENT, Role.SELLER, Role.DRIVER] as const;
export type SelfSignupRole = (typeof SELF_SIGNUP_ROLES)[number];
/** Rôles ayant accès à la console de contrôle. */
export const BACK_OFFICE_ROLES = [Role.CONTROLLER, Role.ADMIN] as const;

export const VehicleType = {
  BIKE: 'BIKE',
  MOTO: 'MOTO',
  CAR: 'CAR',
} as const;
export type VehicleType = (typeof VehicleType)[keyof typeof VehicleType];
export const VEHICLE_TYPES = Object.values(VehicleType) as VehicleType[];

export const DriverStatus = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type DriverStatus = (typeof DriverStatus)[keyof typeof DriverStatus];
export const DRIVER_STATUSES = Object.values(DriverStatus) as DriverStatus[];

export const DocumentType = {
  CNIB: 'CNIB',
  PERMIS: 'PERMIS',
  CARTE_GRISE: 'CARTE_GRISE',
  ASSURANCE: 'ASSURANCE',
  SELFIE: 'SELFIE',
} as const;
export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];
export const DOCUMENT_TYPES = Object.values(DocumentType) as DocumentType[];

export const OrderType = {
  FOOD: 'FOOD',
  PARCEL: 'PARCEL',
} as const;
export type OrderType = (typeof OrderType)[keyof typeof OrderType];
export const ORDER_TYPES = Object.values(OrderType) as OrderType[];

export const OrderStatus = {
  PENDING: 'PENDING',
  ACCEPTED: 'ACCEPTED',
  READY: 'READY',
  SEARCHING_DRIVER: 'SEARCHING_DRIVER',
  ASSIGNED: 'ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];
export const ORDER_STATUSES = Object.values(OrderStatus) as OrderStatus[];

export const PaymentMethod = {
  CASH: 'CASH',
  /** Réservé au Lot 2 : refusé par l'API en Lot 1. */
  MOBILE_MONEY: 'MOBILE_MONEY',
} as const;
export type PaymentMethod = (typeof PaymentMethod)[keyof typeof PaymentMethod];
export const PAYMENT_METHODS = Object.values(PaymentMethod) as PaymentMethod[];

export const PaymentStatus = {
  PENDING: 'PENDING',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

export const OfferStatus = {
  OFFERED: 'OFFERED',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CANCELLED: 'CANCELLED',
} as const;
export type OfferStatus = (typeof OfferStatus)[keyof typeof OfferStatus];

export const CashEntryType = {
  /** Espèces encaissées par le livreur à la livraison (+). */
  COLLECTION: 'COLLECTION',
  /** Versement du livreur enregistré par un contrôleur (-). */
  DEPOSIT: 'DEPOSIT',
} as const;
export type CashEntryType = (typeof CashEntryType)[keyof typeof CashEntryType];

export const IncidentType = {
  SOS: 'SOS',
  DISPUTE: 'DISPUTE',
  OTHER: 'OTHER',
} as const;
export type IncidentType = (typeof IncidentType)[keyof typeof IncidentType];
export const INCIDENT_TYPES = Object.values(IncidentType) as IncidentType[];

export const IncidentStatus = {
  OPEN: 'OPEN',
  IN_PROGRESS: 'IN_PROGRESS',
  RESOLVED: 'RESOLVED',
} as const;
export type IncidentStatus = (typeof IncidentStatus)[keyof typeof IncidentStatus];
export const INCIDENT_STATUSES = Object.values(IncidentStatus) as IncidentStatus[];

export const StoreApprovalStatus = {
  /** Boutique créée par un vendeur, en attente de validation par la console (invisible des clients). */
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  SUSPENDED: 'SUSPENDED',
} as const;
export type StoreApprovalStatus = (typeof StoreApprovalStatus)[keyof typeof StoreApprovalStatus];
export const STORE_APPROVAL_STATUSES = Object.values(StoreApprovalStatus) as StoreApprovalStatus[];

/** Codes d'erreur renvoyés par l'API dans `{ error: { code, message } }`. */
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  OTP_INVALID: 'OTP_INVALID',
  OTP_RATE_LIMITED: 'OTP_RATE_LIMITED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  DRIVER_NOT_APPROVED: 'DRIVER_NOT_APPROVED',
  DRIVER_OFFLINE: 'DRIVER_OFFLINE',
  DRIVER_BUSY: 'DRIVER_BUSY',
  CASH_LIMIT_REACHED: 'CASH_LIMIT_REACHED',
  KYC_INCOMPLETE: 'KYC_INCOMPLETE',
  STORE_CLOSED: 'STORE_CLOSED',
  PRODUCT_UNAVAILABLE: 'PRODUCT_UNAVAILABLE',
  PRICING_UNAVAILABLE: 'PRICING_UNAVAILABLE',
  PAYMENT_METHOD_UNAVAILABLE: 'PAYMENT_METHOD_UNAVAILABLE',
  OFFER_EXPIRED: 'OFFER_EXPIRED',
  DELIVERY_CODE_INVALID: 'DELIVERY_CODE_INVALID',
  DELIVERY_CODE_LOCKED: 'DELIVERY_CODE_LOCKED',
  ALREADY_RATED: 'ALREADY_RATED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  CONSENT_REQUIRED: 'CONSENT_REQUIRED',
  STORE_NOT_APPROVED: 'STORE_NOT_APPROVED',
  RATE_LIMITED: 'RATE_LIMITED',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  ORDER_NOT_ACTIVE: 'ORDER_NOT_ACTIVE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Libellés français pour l'interface. */
export const LABELS = {
  vehicleType: { BIKE: 'Vélo', MOTO: 'Moto', CAR: 'Voiture' } satisfies Record<VehicleType, string>,
  orderStatus: {
    PENDING: 'En attente du vendeur',
    ACCEPTED: 'En préparation',
    READY: 'Prête',
    SEARCHING_DRIVER: 'Recherche d’un livreur',
    ASSIGNED: 'Livreur en route',
    PICKED_UP: 'En livraison',
    DELIVERED: 'Livrée',
    CANCELLED: 'Annulée',
  } satisfies Record<OrderStatus, string>,
  driverStatus: {
    PENDING: 'En attente de validation',
    APPROVED: 'Validé',
    REJECTED: 'Refusé',
    SUSPENDED: 'Suspendu',
  } satisfies Record<DriverStatus, string>,
  documentType: {
    CNIB: 'CNIB',
    PERMIS: 'Permis de conduire',
    CARTE_GRISE: 'Carte grise',
    ASSURANCE: 'Assurance',
    SELFIE: 'Selfie de contrôle',
  } satisfies Record<DocumentType, string>,
  orderType: { FOOD: 'Repas / boutique', PARCEL: 'Colis' } satisfies Record<OrderType, string>,
  paymentMethod: { CASH: 'Espèces', MOBILE_MONEY: 'Mobile money (Lot 2)' } satisfies Record<PaymentMethod, string>,
  incidentType: { SOS: 'SOS', DISPUTE: 'Litige', OTHER: 'Autre' } satisfies Record<IncidentType, string>,
  incidentStatus: { OPEN: 'Ouvert', IN_PROGRESS: 'En cours', RESOLVED: 'Résolu' } satisfies Record<IncidentStatus, string>,
  storeApprovalStatus: {
    PENDING: 'En attente de validation',
    APPROVED: 'Validée',
    SUSPENDED: 'Suspendue',
  } satisfies Record<StoreApprovalStatus, string>,
  role: {
    CLIENT: 'Client',
    SELLER: 'Vendeur',
    DRIVER: 'Livreur',
    CONTROLLER: 'Contrôleur',
    ADMIN: 'Administrateur',
  } satisfies Record<Role, string>,
} as const;
