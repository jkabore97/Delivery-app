import { z } from 'zod';
import { fr } from 'zod/locales';
import { ORDER_MESSAGE_MAX_LENGTH, plateRequired } from './constants';
import {
  DOCUMENT_TYPES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHODS,
  ROLES,
  SELF_SIGNUP_ROLES,
  VEHICLE_TYPES,
  DRIVER_STATUSES,
  STORE_APPROVAL_STATUSES,
  type StoreApprovalStatus,
  type DocumentType,
  type DriverStatus,
  type IncidentStatus,
  type IncidentType,
  type OrderStatus,
  type OrderType,
  type PaymentMethod,
  type Role,
  type VehicleType,
} from './enums';

// Messages d'erreur zod par défaut en français pour tous les consommateurs (API, console, mobile).
z.config(fr());

/* ------------------------------------------------------------------ */
/* Briques de base                                                     */
/* ------------------------------------------------------------------ */

export const roleSchema = z.enum(ROLES as [Role, ...Role[]]);
export const vehicleTypeSchema = z.enum(VEHICLE_TYPES as [VehicleType, ...VehicleType[]]);
export const orderTypeSchema = z.enum(ORDER_TYPES as [OrderType, ...OrderType[]]);
export const orderStatusSchema = z.enum(ORDER_STATUSES as [OrderStatus, ...OrderStatus[]]);
export const paymentMethodSchema = z.enum(PAYMENT_METHODS as [PaymentMethod, ...PaymentMethod[]]);
export const documentTypeSchema = z.enum(DOCUMENT_TYPES as [DocumentType, ...DocumentType[]]);
export const driverStatusSchema = z.enum(DRIVER_STATUSES as [DriverStatus, ...DriverStatus[]]);
export const incidentTypeSchema = z.enum(INCIDENT_TYPES as [IncidentType, ...IncidentType[]]);
export const incidentStatusSchema = z.enum(INCIDENT_STATUSES as [IncidentStatus, ...IncidentStatus[]]);
export const storeApprovalStatusSchema = z.enum(STORE_APPROVAL_STATUSES as [StoreApprovalStatus, ...StoreApprovalStatus[]]);

/**
 * Numéro burkinabè. Accepte « 70 12 34 56 », « 70123456 », « +22670123456 », « 0022670123456 ».
 * Sortie normalisée E.164 : « +22670123456 ».
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s.\-()]/g, '');
  const m = /^(?:\+226|00226)?(\d{8})$/.exec(digits);
  return m ? `+226${m[1]}` : null;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Numéro de téléphone invalide (8 chiffres, Burkina Faso)' });
      return z.NEVER;
    }
    return n;
  });

export const idSchema = z.string().min(1).max(64);
export const fcfaSchema = z.number().int('Montant entier en FCFA').min(0).max(10_000_000);

export const latLngSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const addressSchema = latLngSchema.extend({
  address: z.string().trim().min(1, 'Adresse requise').max(200),
  landmark: z.string().trim().max(200).default(''),
});
export type AddressInput = z.input<typeof addressSchema>;

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
export const uploadMimeTypeSchema = z.enum(ALLOWED_MIME);
export type UploadMimeType = z.infer<typeof uploadMimeTypeSchema>;
/** Taille maximale d'un fichier envoyé (après décodage base64), API auto-hébergée. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/**
 * Plafond sur Vercel (et dans l'application mobile, quel que soit le serveur) : le corps d'une requête
 * Vercel est limité à 4,5 Mo ; 3 Mo une fois encodés en base64 font 4 Mo, ce qui laisse de la marge.
 */
export const VERCEL_MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Longueur de l'encodage base64 (avec remplissage) d'un contenu de `bytes` octets. */
export function base64Length(bytes: number): number {
  return Math.ceil(bytes / 3) * 4;
}

/** Fichier envoyé en JSON, encodé en base64 (sans préfixe `data:`). */
export const fileUploadSchema = z.object({
  mimeType: uploadMimeTypeSchema,
  dataBase64: z
    .string()
    .min(4)
    .max(Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + 8, 'Fichier trop volumineux (5 Mo max)')
    .regex(/^[A-Za-z0-9+/=\s]+$/, 'Base64 invalide'),
});
export type FileUploadInput = z.infer<typeof fileUploadSchema>;

/** Photo (produit) : images uniquement. */
export const imageUploadSchema = fileUploadSchema.extend({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
});
export type ImageUploadInput = z.infer<typeof imageUploadSchema>;

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Date ISO 8601 invalide (ex. 2027-03-31)');

/* ------------------------------------------------------------------ */
/* Pagination / requêtes                                               */
/* ------------------------------------------------------------------ */

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

/** Liste séparée par des virgules -> tableau de statuts. */
const statusListSchema = z
  .string()
  .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
  .pipe(z.array(orderStatusSchema));

export const orderListQuerySchema = paginationQuerySchema.extend({
  status: statusListSchema.optional(),
  type: orderTypeSchema.optional(),
  /** Recherche (numéro de commande, téléphone) : contrôleurs uniquement. */
  q: z.string().trim().max(100).optional(),
  /** Mode poll : seulement les commandes modifiées à partir de cette date (ISO 8601, incluse). */
  updatedSince: z.iso.datetime({ offset: true, message: 'Date ISO 8601 attendue' }).optional(),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

export const storeListQuerySchema = paginationQuerySchema.extend({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  q: z.string().trim().max(100).optional(),
  openOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

/* ------------------------------------------------------------------ */
/* Authentification                                                    */
/* ------------------------------------------------------------------ */

export const requestOtpSchema = z.object({ phone: phoneSchema });
export type RequestOtpInput = z.input<typeof requestOtpSchema>;

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, 'Le code comporte 6 chiffres'),
  /** Rôle choisi à la création du compte (ignoré si le compte existe déjà). */
  role: z.enum(SELF_SIGNUP_ROLES).optional(),
  name: z.string().trim().min(1).max(80).optional(),
});
export type VerifyOtpInput = z.input<typeof verifyOtpSchema>;

export const updateMeSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

/** Enregistrement du jeton de notification push de l'appareil (Expo ou FCM). */
export const pushTokenSchema = z.object({
  token: z.string().trim().min(10).max(300),
  platform: z.enum(['expo', 'fcm', 'apns']).default('expo'),
});
export type PushTokenInput = z.input<typeof pushTokenSchema>;
export const pushTokenDeleteSchema = z.object({ token: z.string().trim().min(10).max(300) });

export const savedAddressSchema = addressSchema.extend({
  label: z.string().trim().min(1).max(40),
});

/* ------------------------------------------------------------------ */
/* Boutiques et produits                                               */
/* ------------------------------------------------------------------ */

export const storeCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  phone: phoneSchema.optional(),
  address: z.string().trim().min(1).max(200),
  landmark: z.string().trim().max(200).default(''),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  prepTimeMinutes: z.number().int().min(1).max(180).default(15),
  openingHours: z.string().trim().max(200).default(''),
});
export type StoreCreateInput = z.input<typeof storeCreateSchema>;

export const storeUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500),
    phone: phoneSchema.nullable(),
    address: z.string().trim().min(1).max(200),
    landmark: z.string().trim().max(200),
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    prepTimeMinutes: z.number().int().min(1).max(180),
    openingHours: z.string().trim().max(200),
    isOpen: z.boolean(),
  })
  .partial();
export type StoreUpdateInput = z.input<typeof storeUpdateSchema>;

export const productCreateSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300).default(''),
  category: z.string().trim().max(40).default(''),
  price: fcfaSchema,
  isAvailable: z.boolean().default(true),
});
export type ProductCreateInput = z.input<typeof productCreateSchema>;

export const productUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(300),
    category: z.string().trim().max(40),
    price: fcfaSchema,
    isAvailable: z.boolean(),
  })
  .partial();
export type ProductUpdateInput = z.input<typeof productUpdateSchema>;

/* ------------------------------------------------------------------ */
/* Commandes                                                           */
/* ------------------------------------------------------------------ */

export const orderItemInputSchema = z.object({
  productId: idSchema,
  quantity: z.number().int().min(1).max(50),
});

const orderBase = z.object({
  type: orderTypeSchema,
  /** FOOD : boutique où récupérer la commande. */
  storeId: idSchema.optional(),
  /** FOOD : articles commandés. */
  items: z.array(orderItemInputSchema).max(50).optional(),
  /** PARCEL : point de retrait (A). Ignoré pour FOOD (c'est l'adresse de la boutique). */
  pickup: addressSchema.optional(),
  /** Point de livraison (B). */
  dropoff: addressSchema,
});

type OrderBaseShape = z.infer<typeof orderBase>;
function refineOrderShape(v: OrderBaseShape, ctx: z.RefinementCtx): void {
  if (v.type === 'FOOD') {
    if (!v.storeId) ctx.addIssue({ code: 'custom', path: ['storeId'], message: 'Boutique requise' });
    if (!v.items || v.items.length === 0)
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'Au moins un article' });
  } else if (!v.pickup) {
    ctx.addIssue({ code: 'custom', path: ['pickup'], message: 'Point de retrait requis' });
  }
}

export const quoteSchema = orderBase.superRefine(refineOrderShape);
export type QuoteInput = z.input<typeof quoteSchema>;

export const createOrderSchema = orderBase
  .extend({
    vehicleType: vehicleTypeSchema,
    paymentMethod: paymentMethodSchema.default('CASH'),
    recipientName: z.string().trim().max(80).optional(),
    recipientPhone: phoneSchema.optional(),
    parcelDescription: z.string().trim().max(300).optional(),
    notes: z.string().trim().max(300).optional(),
  })
  .superRefine(refineOrderShape);
export type CreateOrderInput = z.input<typeof createOrderSchema>;

export const cancelOrderSchema = z.object({ reason: z.string().trim().max(300).optional() });
export const acceptOrderSchema = z.object({ prepTimeMinutes: z.number().int().min(1).max(180).optional() });
export const rejectOrderSchema = z.object({ reason: z.string().trim().min(1).max(300) });

export const deliverOrderSchema = z.object({
  code: z.string().regex(/^\d{4}$/, 'Le code de livraison comporte 4 chiffres'),
  proofPhoto: fileUploadSchema.optional(),
});
export type DeliverOrderInput = z.input<typeof deliverOrderSchema>;

export const ratingSchema = z.object({
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(300).optional(),
});
export type RatingInput = z.input<typeof ratingSchema>;

export const disputeSchema = z.object({
  description: z.string().trim().min(3).max(1000),
});

/** Message client ↔ livreur pendant la course. */
export const orderMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message vide').max(ORDER_MESSAGE_MAX_LENGTH),
});
export type OrderMessageInput = z.input<typeof orderMessageSchema>;

/* ------------------------------------------------------------------ */
/* Livreurs                                                            */
/* ------------------------------------------------------------------ */

export const driverProfileSchema = z
  .object({
    vehicleType: vehicleTypeSchema,
    plate: z
      .string()
      .trim()
      .toUpperCase()
      .min(4)
      .max(15)
      .optional(),
    /** Consentement explicite au suivi GPS pendant le service (enregistré avec sa date). */
    trackingConsent: z.literal(true).optional(),
  })
  .superRefine((v, ctx) => {
    if (plateRequired(v.vehicleType) && !v.plate)
      ctx.addIssue({ code: 'custom', path: ['plate'], message: 'Immatriculation requise pour ce véhicule' });
  });
export type DriverProfileInput = z.input<typeof driverProfileSchema>;

export const documentUploadSchema = fileUploadSchema.extend({
  /** Obligatoire pour ASSURANCE. */
  expiresAt: isoDate.optional(),
});
export type DocumentUploadInput = z.input<typeof documentUploadSchema>;

export const availabilitySchema = z.object({
  online: z.boolean(),
  /** Permet de donner le consentement au suivi GPS au moment du premier passage en ligne. */
  trackingConsent: z.literal(true).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});
export type AvailabilityInput = z.input<typeof availabilitySchema>;

export const locationPingSchema = latLngSchema.extend({
  accuracy: z.number().min(0).max(10_000).optional(),
  heading: z.number().min(0).max(360).optional(),
  /** m/s */
  speed: z.number().min(0).max(100).optional(),
});
export type LocationPingInput = z.input<typeof locationPingSchema>;

export const sosSchema = latLngSchema.extend({
  orderId: idSchema.optional(),
  message: z.string().trim().max(500).optional(),
});
export type SosInput = z.input<typeof sosSchema>;

/* ------------------------------------------------------------------ */
/* Console contrôleur                                                  */
/* ------------------------------------------------------------------ */

export const assignDriverSchema = z.object({ driverId: idSchema });
export const reasonSchema = z.object({ reason: z.string().trim().min(1).max(500) });
export const optionalReasonSchema = z.object({ reason: z.string().trim().min(1).max(500).optional() });

export const pricingRuleUpdateSchema = z.object({
  baseFare: fcfaSchema,
  perKm: fcfaSchema,
  minimumFare: fcfaSchema,
  commissionPercent: z.number().min(0).max(100),
  isActive: z.boolean().default(true),
});
export type PricingRuleUpdateInput = z.input<typeof pricingRuleUpdateSchema>;

export const cashDepositSchema = z.object({
  amount: z.number().int().min(1).max(10_000_000),
  note: z.string().trim().max(300).optional(),
});
export type CashDepositInput = z.input<typeof cashDepositSchema>;

export const incidentUpdateSchema = z.object({
  status: incidentStatusSchema,
  resolutionNote: z.string().trim().max(1000).optional(),
});

export const createStaffSchema = z.object({
  phone: phoneSchema,
  name: z.string().trim().min(1).max(80),
  role: z.enum(['CONTROLLER', 'ADMIN']),
});

export const driverListQuerySchema = paginationQuerySchema.extend({
  status: driverStatusSchema.optional(),
  vehicleType: vehicleTypeSchema.optional(),
  online: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  q: z.string().trim().max(100).optional(),
});

export const userListQuerySchema = paginationQuerySchema.extend({
  role: roleSchema.optional(),
  q: z.string().trim().max(100).optional(),
  suspended: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

export const incidentListQuerySchema = paginationQuerySchema.extend({
  /** Un statut ou une liste séparée par des virgules (ex. `OPEN,IN_PROGRESS`). */
  status: z
    .string()
    .transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean))
    .pipe(z.array(incidentStatusSchema))
    .optional(),
  type: incidentTypeSchema.optional(),
});

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(60).optional(),
  actorId: idSchema.optional(),
  entityType: z.string().trim().max(40).optional(),
  entityId: idSchema.optional(),
});

export const controllerStoreListQuerySchema = paginationQuerySchema.extend({
  approvalStatus: storeApprovalStatusSchema.optional(),
});

/** Exports CSV : période optionnelle (dates ISO), 10 000 lignes max. */
export const exportQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const cashLedgerQuerySchema = paginationQuerySchema.extend({
  driverId: idSchema.optional(),
});
