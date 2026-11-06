import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { StoreDto } from '@yaar/shared';
import { errorMessage } from '../lib/api';
import { useApi } from './auth';

interface SellerContextValue {
  /** undefined = chargement. */
  stores: StoreDto[] | undefined;
  store: StoreDto | null;
  error: string | null;
  selectStore: (id: string) => void;
  refreshStores: () => Promise<void>;
  /** Remplace la boutique dans la liste après une modification. */
  upsertStore: (s: StoreDto) => void;
}

const SellerContext = createContext<SellerContextValue | null>(null);

/** Un vendeur peut avoir plusieurs boutiques : l'application travaille sur la boutique sélectionnée. */
export function SellerProvider({ children }: { children: ReactNode }) {
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

  const value = useMemo<SellerContextValue>(
    () => ({ stores, store, error, selectStore: setSelectedId, refreshStores, upsertStore }),
    [stores, store, error, refreshStores, upsertStore],
  );
  return <SellerContext.Provider value={value}>{children}</SellerContext.Provider>;
}

export function useSeller(): SellerContextValue {
  const ctx = useContext(SellerContext);
  if (!ctx) throw new Error('useSeller doit être utilisé dans <SellerProvider>');
  return ctx;
}
