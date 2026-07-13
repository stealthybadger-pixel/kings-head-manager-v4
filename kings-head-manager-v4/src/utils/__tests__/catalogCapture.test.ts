import { describe, it, expect } from 'vitest';
import { findExistingMatch, type CapturedProduct } from '../catalogCapture';
import type { SupplierProduct } from '../../types';

const existing: SupplierProduct[] = [
  {
    id: 'abc123',
    name: "Chef's Essentials Mild Coloured Cheddar",
    supplier: 'Booker',
    packCost: 27.45,
    packSize: 1,
    packUnit: 'ea',
    unitPrice: 27.45,
    bookerProductCode: '153093',
  },
  {
    id: 'def456',
    name: 'Beetroot - Candy',
    supplier: 'David Catt',
    packCost: 2.24,
    packSize: 1,
    packUnit: 'kg',
    unitPrice: 2.24,
  },
];

describe('findExistingMatch', () => {
  it('matches Booker items by bookerProductCode', () => {
    const captured: CapturedProduct = {
      supplier: 'Booker',
      name: "Chef's Essentials Mild Coloured Cheddar",
      packCost: 28.0,
      packSize: 1,
      packUnit: 'ea',
      productCode: '153093',
      sourceUrl: 'https://www.booker.co.uk/products/product?Code=153093',
    };
    expect(findExistingMatch(captured, existing)?.id).toBe('abc123');
  });

  it('does not match a Booker code against a different supplier', () => {
    const captured: CapturedProduct = {
      supplier: 'Urban',
      name: 'Something Else',
      packCost: 1,
      packSize: 1,
      packUnit: 'ea',
      productCode: '153093',
      sourceUrl: 'https://shop.urbanfoodservice.co.uk/#/products/detail/153093',
    };
    expect(findExistingMatch(captured, existing)).toBeNull();
  });

  it('falls back to normalized name + supplier when there is no product code', () => {
    const captured: CapturedProduct = {
      supplier: 'David Catt',
      name: '  beetroot - candy  ',
      packCost: 2.3,
      packSize: 1,
      packUnit: 'kg',
      sourceUrl: 'https://app.fresho.com/marketplace/products?search=beetroot',
    };
    expect(findExistingMatch(captured, existing)?.id).toBe('def456');
  });

  it('returns null when nothing matches', () => {
    const captured: CapturedProduct = {
      supplier: 'David Catt',
      name: 'Completely New Product',
      packCost: 5,
      packSize: 1,
      packUnit: 'kg',
      sourceUrl: 'https://app.fresho.com/marketplace/products?search=new',
    };
    expect(findExistingMatch(captured, existing)).toBeNull();
  });
});
