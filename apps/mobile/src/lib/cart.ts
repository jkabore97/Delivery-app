import type { ProductDto } from '@yaar/shared';

/** Panier d'une seule boutique (une commande FOOD = une boutique). */
export interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  quantity: number;
}

export interface CartState {
  storeId: string | null;
  storeName: string | null;
  lines: CartLine[];
}

export const MAX_QUANTITY = 50;

export const emptyCart: CartState = { storeId: null, storeName: null, lines: [] };

export type CartAction =
  | { type: 'add'; storeId: string; storeName: string; product: Pick<ProductDto, 'id' | 'name' | 'price'> }
  | { type: 'decrement'; productId: string }
  | { type: 'setQuantity'; productId: string; quantity: number }
  | { type: 'clear' };

export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'add': {
      // Ajouter un article d'une autre boutique repart d'un panier vide.
      const base = state.storeId && state.storeId !== action.storeId ? emptyCart : state;
      const existing = base.lines.find((l) => l.productId === action.product.id);
      const lines = existing
        ? base.lines.map((l) =>
            l.productId === action.product.id ? { ...l, quantity: Math.min(MAX_QUANTITY, l.quantity + 1) } : l,
          )
        : [
            ...base.lines,
            { productId: action.product.id, name: action.product.name, unitPrice: action.product.price, quantity: 1 },
          ];
      return { storeId: action.storeId, storeName: action.storeName, lines };
    }
    case 'decrement':
      return normalize({
        ...state,
        lines: state.lines.map((l) => (l.productId === action.productId ? { ...l, quantity: l.quantity - 1 } : l)),
      });
    case 'setQuantity':
      return normalize({
        ...state,
        lines: state.lines.map((l) =>
          l.productId === action.productId
            ? { ...l, quantity: Math.min(MAX_QUANTITY, Math.max(0, Math.floor(action.quantity))) }
            : l,
        ),
      });
    case 'clear':
      return emptyCart;
  }
}

function normalize(state: CartState): CartState {
  const lines = state.lines.filter((l) => l.quantity > 0);
  return lines.length === 0 ? emptyCart : { ...state, lines };
}

export function cartItemsTotal(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);
}

export function cartCount(state: CartState): number {
  return state.lines.reduce((sum, l) => sum + l.quantity, 0);
}

export function quantityOf(state: CartState, productId: string): number {
  return state.lines.find((l) => l.productId === productId)?.quantity ?? 0;
}

/** Articles au format attendu par POST /orders/quote et POST /orders. */
export function cartToOrderItems(state: CartState): { productId: string; quantity: number }[] {
  return state.lines.map((l) => ({ productId: l.productId, quantity: l.quantity }));
}
