import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StoreDto } from '@yaar/shared';
import { errorMessage } from '../lib/api';
import { useApi } from './auth';

interface BusinessContextValue {
  /** undefined = chargement. Profil d'entreprise = boutique validée par Yaar (API : /seller/stores). */
  stores: StoreDto[] | undefined;
  /** Entreprise sélectionnée (point de retrait par défaut des livraisons). */
  store: StoreDto | null;
  error: string | null;
  selectStore: (id: string) => void;
  refreshStores: () => Promise<void>;
  /** Remplace la boutique dans la liste après une modification. */
  upsertStore: (s: StoreDto) => void;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

/**
 * Profil de l'entreprise (compte « Entreprise » = rôle SELLER de l'API) : son adresse est le point de retrait
 * par défaut des livraisons. Un compte peut avoir plusieurs établissements : l'application travaille sur le
 * premier, ou celui choisi dans le profil.
 */
export function BusinessProvider({ children }: { children: ReactNode }) {
  const api = useApi();
  const [stores, setStores] = useState<StoreDto[] | undefined>(undefined);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshStores = useCallback(async () => {
    try {
      const list = await api.sellerStores();
      setStores(list);
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
      setStores((prev) => prev ?? []);
    }
  }, [api]);

  useEffect(() => {
    void refreshStores();
  }, [refreshStores]);

  const upsertStore = useCallback((s: StoreDto) => {
    setStores((prev) => {
      const list = prev ?? [];
      return list.some((x) => x.id === s.id) ? list.map((x) => (x.id === s.id ? s : x)) : [...list, s];
    });
    setSelectedId(s.id);
  }, []);

  const store = useMemo(() => {
    if (!stores || stores.length === 0) return null;
    return stores.find((s) => s.id === selectedId) ?? stores[0] ?? null;
  }, [stores, selectedId]);

  const value = useMemo<BusinessContextValue>(
    () => ({ stores, store, error, selectStore: setSelectedId, refreshStores, upsertStore }),
    [stores, store, error, refreshStores, upsertStore],
  );
  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}

export function useBusiness(): BusinessContextValue {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness doit être utilisé dans <BusinessProvider>');
  return ctx;
}

/** Une entreprise peut demander des livraisons une fois validée par Yaar. */
export function isBusinessApproved(store: Pick<StoreDto, 'approvalStatus'> | null | undefined): boolean {
  return !!store && (store.approvalStatus === undefined || store.approvalStatus === 'APPROVED');
}
