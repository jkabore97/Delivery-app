import { createContext, useContext, useMemo, useReducer, useState, type Dispatch, type ReactNode } from 'react';
import type { AddressDto } from '@yaar/shared';
import { cartReducer, emptyCart, type CartAction, type CartState } from '../lib/cart';

interface ClientOrderContextValue {
  cart: CartState;
  dispatch: Dispatch<CartAction>;
  /** Adresse de livraison choisie sur l'accueil (épingle + adresse + repère). */
  dropoff: AddressDto | null;
  setDropoff: (a: AddressDto | null) => void;
}

const ClientOrderContext = createContext<ClientOrderContextValue | null>(null);

export function ClientOrderProvider({ children }: { children: ReactNode }) {
  const [cart, dispatch] = useReducer(cartReducer, emptyCart);
  const [dropoff, setDropoff] = useState<AddressDto | null>(null);
  const value = useMemo(() => ({ cart, dispatch, dropoff, setDropoff }), [cart, dropoff]);
  return <ClientOrderContext.Provider value={value}>{children}</ClientOrderContext.Provider>;
}

export function useClientOrder(): ClientOrderContextValue {
  const ctx = useContext(ClientOrderContext);
  if (!ctx) throw new Error('useClientOrder doit être utilisé dans <ClientOrderProvider>');
  return ctx;
}
