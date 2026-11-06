import type {
  ApiErrorBody,
  AuthResponse,
  AvailabilityInput,
  CreateOrderInput,
  DeliverOrderInput,
  DocumentType,
  DocumentUploadInput,
  DriverEarningsDto,
  DriverProfileDto,
  DriverProfileInput,
  IncidentDto,
  LocationPingInput,
  OfferDto,
  OrderDto,
  OrderStatus,
  OrderType,
  OtpRequestResponse,
  Paginated,
  ProductCreateInput,
  ProductDto,
  ProductUpdateInput,
  QuoteInput,
  QuoteResponse,
  RatingDto,
  RatingInput,
  SavedAddressDto,
  SellerStatsDto,
  SosInput,
  StoreCreateInput,
  StoreDetailDto,
  StoreDto,
  StoreUpdateInput,
  UserDto,
  VerifyOtpInput,
} from '@yaar/shared';

/** Erreur renvoyée par l'API (`{ error: { code, message } }`) ou erreur réseau. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const NETWORK_ERROR_CODE = 'NETWORK_ERROR';

export function isApiError(e: unknown, code?: string): e is ApiError {
  return e instanceof ApiError && (code === undefined || e.code === code);
}

/**
 * Messages français adaptés à l'application pour les codes d'erreur dont le message serveur est trop
 * générique (ou trop technique). Les autres codes gardent le message de l'API, déjà en français
 * (ex. DELIVERY_CODE_INVALID indique le nombre d'essais restants).
 */
export const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  CONSENT_REQUIRED:
    'Acceptez le suivi de votre position pendant le service pour passer en ligne (Profil › Suivi GPS).',
  DRIVER_OFFLINE: 'Vous êtes hors ligne : votre position n’est plus transmise. Repassez en ligne pour reprendre.',
  DRIVER_BUSY: 'Vous avez une course en cours : terminez-la d’abord.',
  DRIVER_NOT_APPROVED: 'Votre dossier doit être validé par Yaar avant de passer en ligne.',
  UNSUPPORTED_FILE: 'Fichier non reconnu : envoyez une photo JPEG, PNG ou WebP (ou un PDF pour les documents).',
  PAYLOAD_TOO_LARGE: 'Fichier trop lourd (5 Mo maximum) : reprenez la photo en plus petit.',
  STORE_NOT_APPROVED: 'Cette boutique n’est pas encore validée par Yaar.',
  ORDER_NOT_ACTIVE: 'La course est terminée : la discussion est fermée.',
  DELIVERY_CODE_LOCKED: 'Trop de codes incorrects : appelez le support Yaar pour débloquer la livraison.',
  OFFER_EXPIRED: 'Cette course n’est plus disponible.',
  RATE_LIMITED: 'Trop de tentatives : patientez quelques minutes avant de réessayer.',
  OTP_RATE_LIMITED: 'Trop de codes demandés pour ce numéro : réessayez dans une heure.',
};

/** Message utilisateur (français) pour n'importe quelle erreur. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return ERROR_MESSAGES[e.code] ?? e.message;
  if (e instanceof Error && e.message) return e.message;
  return 'Une erreur inattendue est survenue.';
}

function isApiErrorBody(v: unknown): v is ApiErrorBody {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const err = (v as { error: unknown }).error;
  return typeof err === 'object' && err !== null && 'code' in err && 'message' in err;
}

type QueryValue = string | number | boolean | undefined | null;

export function buildQuery(params: Record<string, QueryValue | QueryValue[]>): string {
  const parts: string[] = [];
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined || raw === null) continue;
    const value = Array.isArray(raw) ? raw.filter((x) => x !== undefined && x !== null).join(',') : String(raw);
    if (value === '') continue;
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  }
  return parts.length ? `?${parts.join('&')}` : '';
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  /** Appelé sur 401 (jeton expiré) ou 403 ACCOUNT_SUSPENDED : retour à l'écran de connexion. */
  onAuthError?: (error: ApiError) => void;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface OrderListParams {
  status?: OrderStatus[];
  type?: OrderType;
  page?: number;
  pageSize?: number;
}

export interface StoreListParams {
  lat?: number;
  lng?: number;
  q?: string;
  openOnly?: boolean;
  page?: number;
  pageSize?: number;
}

export function createApiClient(opts: ApiClientOptions) {
  const fetchFn = opts.fetchFn ?? fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;

  async function request<T>(method: Method, path: string, body?: unknown, auth = true): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const token = auth ? opts.getToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchFn(`${opts.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError(0, NETWORK_ERROR_CODE, 'Connexion impossible. Vérifiez votre connexion Internet.');
    } finally {
      clearTimeout(timer);
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown = undefined;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
    }
    if (!res.ok) {
      const err = isApiErrorBody(json)
        ? new ApiError(res.status, json.error.code, json.error.message, json.error.details)
        : new ApiError(res.status, 'HTTP_ERROR', `Erreur du serveur (${res.status}).`);
      if (auth && (res.status === 401 || err.code === 'ACCOUNT_SUSPENDED')) opts.onAuthError?.(err);
      throw err;
    }
    return json as T;
  }

  return {
    request,
    // Auth et profil
    requestOtp: (phone: string) => request<OtpRequestResponse>('POST', '/auth/otp/request', { phone }, false),
    verifyOtp: (input: VerifyOtpInput) => request<AuthResponse>('POST', '/auth/otp/verify', input, false),
    me: () => request<UserDto>('GET', '/me'),
    updateMe: (name: string) => request<UserDto>('PATCH', '/me', { name }),
    listAddresses: () => request<SavedAddressDto[]>('GET', '/me/addresses'),
    createAddress: (input: { label: string; lat: number; lng: number; address: string; landmark?: string }) =>
      request<SavedAddressDto>('POST', '/me/addresses', input),
    deleteAddress: (id: string) => request<void>('DELETE', `/me/addresses/${encodeURIComponent(id)}`),

    // Boutiques
    listStores: (p: StoreListParams = {}) =>
      request<Paginated<StoreDto>>('GET', `/stores${buildQuery({ ...p })}`),
    getStore: (id: string) => request<StoreDetailDto>('GET', `/stores/${encodeURIComponent(id)}`),

    // Vendeur
    sellerStores: () => request<StoreDto[]>('GET', '/seller/stores'),
    createStore: (input: StoreCreateInput) => request<StoreDto>('POST', '/seller/stores', input),
    updateStore: (id: string, input: StoreUpdateInput) =>
      request<StoreDto>('PATCH', `/seller/stores/${encodeURIComponent(id)}`, input),
    sellerProducts: (storeId: string) =>
      request<ProductDto[]>('GET', `/seller/stores/${encodeURIComponent(storeId)}/products`),
    createProduct: (storeId: string, input: ProductCreateInput) =>
      request<ProductDto>('POST', `/seller/stores/${encodeURIComponent(storeId)}/products`, input),
    updateProduct: (id: string, input: ProductUpdateInput) =>
      request<ProductDto>('PATCH', `/seller/products/${encodeURIComponent(id)}`, input),
    deleteProduct: (id: string) => request<void>('DELETE', `/seller/products/${encodeURIComponent(id)}`),
    sellerStats: (storeId: string) =>
      request<SellerStatsDto>('GET', `/seller/stores/${encodeURIComponent(storeId)}/stats`),
    acceptOrder: (id: string, prepTimeMinutes?: number) =>
      request<OrderDto>('POST', `/orders/${encodeURIComponent(id)}/accept`, prepTimeMinutes ? { prepTimeMinutes } : {}),
    rejectOrder: (id: string, reason: string) =>
      request<OrderDto>('POST', `/orders/${encodeURIComponent(id)}/reject`, { reason }),
    markReady: (id: string) => request<OrderDto>('POST', `/orders/${encodeURIComponent(id)}/ready`, {}),

    // Commandes
    quote: (input: QuoteInput) => request<QuoteResponse>('POST', '/orders/quote', input),
    createOrder: (input: CreateOrderInput) => request<OrderDto>('POST', '/orders', input),
    listOrders: (p: OrderListParams = {}) =>
      request<Paginated<OrderDto>>('GET', `/orders${buildQuery({ ...p, status: p.status })}`),
    getOrder: (id: string) => request<OrderDto>('GET', `/orders/${encodeURIComponent(id)}`),
    cancelOrder: (id: string, reason?: string) =>
      request<OrderDto>('POST', `/orders/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {}),
    pickupOrder: (id: string) => request<OrderDto>('POST', `/orders/${encodeURIComponent(id)}/pickup`, {}),
    deliverOrder: (id: string, input: DeliverOrderInput) =>
      request<OrderDto>('POST', `/orders/${encodeURIComponent(id)}/deliver`, input),
    rateOrder: (id: string, input: RatingInput) =>
      request<RatingDto>('POST', `/orders/${encodeURIComponent(id)}/rating`, input),
    disputeOrder: (id: string, description: string) =>
      request<IncidentDto>('POST', `/orders/${encodeURIComponent(id)}/dispute`, { description }),

    // Livreur
    driverProfile: () => request<DriverProfileDto>('GET', '/driver/profile'),
    saveDriverProfile: (input: DriverProfileInput) => request<DriverProfileDto>('PUT', '/driver/profile', input),
    uploadDocument: (type: DocumentType, input: DocumentUploadInput) =>
      request<DriverProfileDto>('PUT', `/driver/documents/${type}`, input),
    /** Consentement éclairé au suivi GPS (obligatoire avant le premier passage en ligne, §7.2). */
    giveTrackingConsent: () => request<DriverProfileDto>('POST', '/driver/consent', {}),
    /** Retrait du consentement : le livreur passe hors ligne et sa dernière position est effacée. */
    withdrawTrackingConsent: () => request<DriverProfileDto>('DELETE', '/driver/consent'),
    setAvailability: (input: AvailabilityInput) =>
      request<DriverProfileDto>('PATCH', '/driver/availability', input),
    sendLocation: (input: LocationPingInput) => request<void>('POST', '/driver/location', input),
    driverOffers: () => request<OfferDto[]>('GET', '/driver/offers'),
    acceptOffer: (id: string) => request<OrderDto>('POST', `/driver/offers/${encodeURIComponent(id)}/accept`, {}),
    rejectOffer: (id: string) => request<void>('POST', `/driver/offers/${encodeURIComponent(id)}/reject`, {}),
    currentOrder: () => request<{ order: OrderDto | null }>('GET', '/driver/current-order'),
    driverEarnings: () => request<DriverEarningsDto>('GET', '/driver/earnings'),
    sos: (input: SosInput) => request<IncidentDto>('POST', '/driver/sos', input),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
