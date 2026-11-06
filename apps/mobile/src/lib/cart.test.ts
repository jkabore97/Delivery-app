import { cartCount, cartItemsTotal, cartReducer, cartToOrderItems, emptyCart, MAX_QUANTITY, quantityOf } from './cart';

const riz = { id: 'p1', name: 'Riz gras poulet', price: 2500 };
const bissap = { id: 'p2', name: 'Bissap 50 cl', price: 500 };
const add = (product: typeof riz, storeId = 's1') =>
  ({ type: 'add', storeId, storeName: storeId === 's1' ? 'Le Verdoyant' : 'Chez Tanti', product }) as const;

describe('cartReducer', () => {
  it('ajoute des articles et calcule le total', () => {
    let s = cartReducer(emptyCart, add(riz));
    s = cartReducer(s, add(riz));
    s = cartReducer(s, add(bissap));
    expect(s.storeId).toBe('s1');
    expect(quantityOf(s, 'p1')).toBe(2);
    expect(cartCount(s)).toBe(3);
    expect(cartItemsTotal(s)).toBe(5500);
    expect(cartToOrderItems(s)).toEqual([
      { productId: 'p1', quantity: 2 },
      { productId: 'p2', quantity: 1 },
    ]);
  });

  it('repart d’un panier vide quand on change de boutique', () => {
    let s = cartReducer(emptyCart, add(riz, 's1'));
    s = cartReducer(s, add(bissap, 's2'));
    expect(s.storeId).toBe('s2');
    expect(s.lines).toHaveLength(1);
    expect(quantityOf(s, 'p1')).toBe(0);
  });

  it('retire la ligne à zéro et vide le panier quand il ne reste rien', () => {
    let s = cartReducer(emptyCart, add(riz));
    s = cartReducer(s, { type: 'decrement', productId: 'p1' });
    expect(s).toEqual(emptyCart);
  });

  it('borne la quantité entre 0 et le maximum', () => {
    let s = cartReducer(emptyCart, add(riz));
    s = cartReducer(s, { type: 'setQuantity', productId: 'p1', quantity: 999 });
    expect(quantityOf(s, 'p1')).toBe(MAX_QUANTITY);
    s = cartReducer(s, add(riz));
    expect(quantityOf(s, 'p1')).toBe(MAX_QUANTITY);
    s = cartReducer(s, { type: 'setQuantity', productId: 'p1', quantity: -3 });
    expect(s).toEqual(emptyCart);
  });

  it('vide le panier', () => {
    const s = cartReducer(cartReducer(emptyCart, add(riz)), { type: 'clear' });
    expect(s).toEqual(emptyCart);
  });
});
