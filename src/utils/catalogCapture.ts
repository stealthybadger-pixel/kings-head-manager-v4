import type { SupplierProduct } from '../types';

export type CaptureSupplier = 'Booker' | 'David Catt' | 'Urban';

export interface CapturedProduct {
  supplier: CaptureSupplier;
  name: string;
  packCost: number;
  packSize: number;
  packUnit: SupplierProduct['packUnit'];
  productCode?: string;
  sourceUrl: string;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function codeFieldFor(supplier: CaptureSupplier): keyof SupplierProduct | null {
  if (supplier === 'Booker') return 'bookerProductCode';
  if (supplier === 'Urban') return 'urbanProductId';
  return null; // David Catt / Fresho has no stable product code
}

/**
 * Finds an existing catalogue entry that matches a freshly captured product,
 * preferring an exact product-code match (Booker/Urban) and falling back to
 * normalized name + supplier equality (needed for David Catt/Fresho, which
 * has no stable per-product code).
 */
export function findExistingMatch(
  captured: CapturedProduct,
  existing: SupplierProduct[]
): SupplierProduct | null {
  const codeField = codeFieldFor(captured.supplier);
  if (codeField && captured.productCode) {
    const byCode = existing.find(
      (p) => p.supplier === captured.supplier && p[codeField] === captured.productCode
    );
    if (byCode) return byCode;
  }

  const capturedNameNorm = normalizeName(captured.name);
  return (
    existing.find(
      (p) => p.supplier === captured.supplier && normalizeName(p.name) === capturedNameNorm
    ) ?? null
  );
}
