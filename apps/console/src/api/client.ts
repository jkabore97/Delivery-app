import type {
  AuditLogDto,
  AuthResponse,
  CashDepositInput,
  CashLedgerEntryDto,
  CashOverviewDto,
  DashboardDto,
  DriverCandidateDto,
  DriverProfileDto,
  DriverStatus,
  ErrorCode,
  IncidentDto,
  IncidentStatus,
  IncidentType,
  MapDataDto,
  OrderDto,
  OrderStatus,
  OrderType,
  OtpRequestResponse,
  Paginated,
  PendingOrderDto,
  PricingRuleDto,
  PricingRuleUpdateInput,
  Role,
  StoreDto,
  UserDto,
  VehicleType,
} from '@yaar/shared';

/** Erreur renvoyée par l'API au format `{ error: { code, message, details } }`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ErrorCode | 'NETWORK_ERROR';
  readonly details: Record<string, string[]> | undefined;

  constructor(
    status: number,
    code: ErrorCode | 'NETWORK_ERROR',
    message: string,
    details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type QueryValue = string | number | boolean | null | undefined | readonly string[];

/** Construit une query string en ignorant les valeurs vides ; les tableaux sont joints par des virgules. */
export function buildQuery(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value)) {
      if (value.length === 0) continue;
      search.set(key, value.join(','));
    } else {
      search.set(key, String(value));
    }
  }
  const s = search.toString();
  return s ? `?${s}` : '';
}

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface OrderListParams extends PageQuery {
  status?: readonly OrderStatus[];
  type?: OrderType;
  q?: string;
}

export interface DriverListParams extends PageQuery {
  status?: DriverStatus;
  vehicleType?: VehicleType;
  online?: boolean;
  q?: string;
}

export interface UserListParams extends PageQuery {
  role?: Role;
  q?: string;
  suspended?: boolean;
}

export interface IncidentListParams extends PageQuery {
  status?: IncidentStatus;
  type?: IncidentType;
}

export interface AuditLogParams extends PageQuery {
  action?: string;
  actorId?: string;
  entityType?: string;
  entityId?: string;
}

export interface ApiClientOptions {
  baseUrl: string;
  getToken: () => string | null;
  /** Appelé sur une réponse 401 (session expirée) ou 403 ACCOUNT_SUSPENDED. */
  onUnauthorized?: (error: ApiError) => void;
  fetchImpl?: typeof fetch;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

function isErrorBody(v: unknown): v is { error: { code: ErrorCode; message: string; details?: Record<string, string[]> } } {
  if (typeof v !== 'object' || v === null || !('error' in v)) return false;
  const e = (v as { error: unknown }).error;
  return typeof e === 'object' && e !== null && 'code' in e && 'message' in e;
}

/** Client HTTP typé de l'API (cf. docs/API.md §3 et §6-8). */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly getToken: () => string | null;
  private readonly onUnauthorized: ((error: ApiError) => void) | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ApiClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.getToken = opts.getToken;
    this.onUnauthorized = opts.onUnauthorized;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
  }

  private async raw(method: Method, path: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = this.getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, init);
    } catch {
      throw new ApiError(0, 'NETWORK_ERROR', 'Impossible de joindre le serveur. Vérifiez votre connexion.');
    }
    if (!res.ok) {
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        payload = null;
      }
      const err = isErrorBody(payload)
        ? new ApiError(res.status, payload.error.code, payload.error.message, payload.error.details)
        : new ApiError(res.status, res.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL_ERROR', `Erreur serveur (${res.status})`);
      if (res.status === 401 || err.code === 'ACCOUNT_SUSPENDED') this.onUnauthorized?.(err);
      throw err;
    }
    return res;
  }

  async request<T>(method: Method, path: string, body?: unknown): Promise<T> {
    const res = await this.raw(method, path, body);
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  /** Téléchargement binaire authentifié (pièces KYC, photo de preuve). */
  async blob(path: string): Promise<Blob> {
    const res = await this.raw('GET', path);
    return res.blob();
  }

  /* ------------------------------ Auth ------------------------------ */

  requestOtp(phone: string): Promise<OtpRequestResponse> {
    return this.request('POST', '/auth/otp/request', { phone });
  }

  verifyOtp(phone: string, code: string): Promise<AuthResponse> {
    return this.request('POST', '/auth/otp/verify', { phone, code });
  }

  me(): Promise<UserDto> {
    return this.request('GET', '/me');
  }

  /* ------------------------------ Tableau de bord ------------------------------ */

  dashboard(): Promise<DashboardDto> {
    return this.request('GET', '/controller/dashboard');
  }

  map(): Promise<MapDataDto> {
    return this.request('GET', '/controller/map');
  }

  /* ------------------------------ Commandes ------------------------------ */

  listOrders(params: OrderListParams = {}): Promise<Paginated<OrderDto>> {
    return this.request('GET', `/orders${buildQuery({ ...params })}`);
  }

  getOrder(id: string): Promise<OrderDto> {
    return this.request('GET', `/orders/${encodeURIComponent(id)}`);
  }

  cancelOrder(id: string, reason?: string): Promise<OrderDto> {
    return this.request('POST', `/orders/${encodeURIComponent(id)}/cancel`, reason ? { reason } : {});
  }

  proofPhoto(id: string): Promise<Blob> {
    return this.blob(`/orders/${encodeURIComponent(id)}/proof-photo`);
  }

  pendingOrders(): Promise<PendingOrderDto[]> {
    return this.request('GET', '/controller/orders/pending');
  }

  candidates(orderId: string): Promise<DriverCandidateDto[]> {
    return this.request('GET', `/controller/orders/${encodeURIComponent(orderId)}/candidates`);
  }

  assignOrder(orderId: string, driverId: string): Promise<OrderDto> {
    return this.request('POST', `/controller/orders/${encodeURIComponent(orderId)}/assign`, { driverId });
  }

  /* ------------------------------ Livreurs / KYC ------------------------------ */

  listDrivers(params: DriverListParams = {}): Promise<Paginated<DriverProfileDto>> {
    return this.request('GET', `/controller/drivers${buildQuery({ ...params })}`);
  }

  getDriver(id: string): Promise<DriverProfileDto> {
    return this.request('GET', `/controller/drivers/${encodeURIComponent(id)}`);
  }

  driverDocument(driverId: string, documentId: string): Promise<Blob> {
    return this.blob(`/controller/drivers/${encodeURIComponent(driverId)}/documents/${encodeURIComponent(documentId)}`);
  }

  approveDriver(id: string): Promise<DriverProfileDto> {
    return this.request('POST', `/controller/drivers/${encodeURIComponent(id)}/approve`, {});
  }

  rejectDriver(id: string, reason: string): Promise<DriverProfileDto> {
    return this.request('POST', `/controller/drivers/${encodeURIComponent(id)}/reject`, { reason });
  }

  suspendDriver(id: string, reason: string): Promise<DriverProfileDto> {
    return this.request('POST', `/controller/drivers/${encodeURIComponent(id)}/suspend`, { reason });
  }

  reinstateDriver(id: string): Promise<DriverProfileDto> {
    return this.request('POST', `/controller/drivers/${encodeURIComponent(id)}/reinstate`, {});
  }

  /* ------------------------------ Utilisateurs ------------------------------ */

  listUsers(params: UserListParams = {}): Promise<Paginated<UserDto>> {
    return this.request('GET', `/controller/users${buildQuery({ ...params })}`);
  }

  suspendUser(id: string, reason: string): Promise<UserDto> {
    return this.request('POST', `/controller/users/${encodeURIComponent(id)}/suspend`, { reason });
  }

  unsuspendUser(id: string): Promise<UserDto> {
    return this.request('POST', `/controller/users/${encodeURIComponent(id)}/unsuspend`, {});
  }

  createStaff(input: { phone: string; name: string; role: 'CONTROLLER' | 'ADMIN' }): Promise<UserDto> {
    return this.request('POST', '/controller/staff', input);
  }

  /* ------------------------------ Boutiques ------------------------------ */

  listStores(params: PageQuery = {}): Promise<Paginated<StoreDto>> {
    return this.request('GET', `/controller/stores${buildQuery({ ...params })}`);
  }

  updateStore(id: string, input: { commissionPercent?: number; isOpen?: boolean }): Promise<StoreDto> {
    return this.request('PATCH', `/controller/stores/${encodeURIComponent(id)}`, input);
  }

  /* ------------------------------ Tarifs ------------------------------ */

  pricingRules(): Promise<PricingRuleDto[]> {
    return this.request('GET', '/controller/pricing-rules');
  }

  updatePricingRule(vehicleType: VehicleType, input: PricingRuleUpdateInput): Promise<PricingRuleDto> {
    return this.request('PUT', `/controller/pricing-rules/${vehicleType}`, input);
  }

  /* ------------------------------ Caisse ------------------------------ */

  cashOverview(): Promise<CashOverviewDto> {
    return this.request('GET', '/controller/cash');
  }

  cashLedger(params: PageQuery & { driverId?: string } = {}): Promise<Paginated<CashLedgerEntryDto>> {
    return this.request('GET', `/controller/cash/ledger${buildQuery({ ...params })}`);
  }

  recordDeposit(driverId: string, input: CashDepositInput): Promise<CashLedgerEntryDto> {
    return this.request('POST', `/controller/drivers/${encodeURIComponent(driverId)}/cash-deposits`, input);
  }

  /* ------------------------------ Incidents ------------------------------ */

  listIncidents(params: IncidentListParams = {}): Promise<Paginated<IncidentDto>> {
    return this.request('GET', `/controller/incidents${buildQuery({ ...params })}`);
  }

  updateIncident(id: string, input: { status: IncidentStatus; resolutionNote?: string }): Promise<IncidentDto> {
    return this.request('PATCH', `/controller/incidents/${encodeURIComponent(id)}`, input);
  }

  /* ------------------------------ Audit ------------------------------ */

  auditLogs(params: AuditLogParams = {}): Promise<Paginated<AuditLogDto>> {
    return this.request('GET', `/controller/audit-logs${buildQuery({ ...params })}`);
  }
}

/** Message lisible pour n'importe quelle erreur (les messages de l'API sont déjà en français). */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error && err.message) return err.message;
  return 'Une erreur inattendue est survenue.';
}
