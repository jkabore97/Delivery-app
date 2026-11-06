import type { ProductDto } from '@yaar/shared';

/** Regroupe les produits par catégorie (ordre de l'API conservé). */
export function groupByCategory(products: ProductDto[]): { category: string; items: ProductDto[] }[] {
  const map = new Map<string, ProductDto[]>();
  for (const p of products) {
    const key = p.category.trim() || 'Autres';
    map.set(key, [...(map.get(key) ?? []), p]);
  }
  return [...map.entries()].map(([category, items]) => ({ category, items }));
}
