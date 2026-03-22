import { describe, it, expect } from 'vitest';
import { getConvertedQuantity, toGrams, calculateBatchTotal } from './units';

describe('getConvertedQuantity', () => {
  it('returns quantity unchanged when units are the same', () => {
    expect(getConvertedQuantity(500, 'g', 'g')).toBe(500);
    expect(getConvertedQuantity(1, 'kg', 'kg')).toBe(1);
    expect(getConvertedQuantity(200, 'ml', 'ml')).toBe(200);
  });

  it('converts g to kg', () => {
    expect(getConvertedQuantity(1000, 'g', 'kg')).toBe(1);
    expect(getConvertedQuantity(500, 'g', 'kg')).toBe(0.5);
  });

  it('converts kg to g', () => {
    expect(getConvertedQuantity(1, 'kg', 'g')).toBe(1000);
    expect(getConvertedQuantity(0.5, 'kg', 'g')).toBe(500);
  });

  it('converts ml to l', () => {
    expect(getConvertedQuantity(1000, 'ml', 'l')).toBe(1);
    expect(getConvertedQuantity(250, 'ml', 'l')).toBe(0.25);
  });

  it('converts l to ml', () => {
    expect(getConvertedQuantity(1, 'l', 'ml')).toBe(1000);
    expect(getConvertedQuantity(0.5, 'l', 'ml')).toBe(500);
  });

  it('cross-converts weight to volume (1g = 1ml assumption)', () => {
    expect(getConvertedQuantity(500, 'g', 'ml')).toBe(500);
    expect(getConvertedQuantity(1, 'kg', 'l')).toBe(1);
    expect(getConvertedQuantity(1000, 'ml', 'kg')).toBe(1);
  });

  it('returns quantity unchanged for ea conversions', () => {
    expect(getConvertedQuantity(3, 'ea', 'g')).toBe(3);
    expect(getConvertedQuantity(3, 'g', 'ea')).toBe(3);
    expect(getConvertedQuantity(5, 'ea', 'ea')).toBe(5);
  });
});

describe('toGrams', () => {
  it('returns g as-is', () => {
    expect(toGrams(250, 'g')).toBe(250);
  });

  it('converts kg to g', () => {
    expect(toGrams(1, 'kg')).toBe(1000);
    expect(toGrams(0.5, 'kg')).toBe(500);
  });

  it('treats ml as g (1:1)', () => {
    expect(toGrams(100, 'ml')).toBe(100);
  });

  it('treats l as kg (1:1)', () => {
    expect(toGrams(1, 'l')).toBe(1000);
  });

  it('returns 0 for ea', () => {
    expect(toGrams(5, 'ea')).toBe(0);
  });
});

describe('calculateBatchTotal', () => {
  it('sums items in same unit', () => {
    const items = [
      { quantity: 200, unit: 'g' as const },
      { quantity: 300, unit: 'g' as const },
    ];
    expect(calculateBatchTotal(items, 'g')).toBe(500);
  });

  it('converts mixed weight units to target', () => {
    const items = [
      { quantity: 500, unit: 'g' as const },
      { quantity: 1, unit: 'kg' as const },
    ];
    expect(calculateBatchTotal(items, 'g')).toBe(1500);
    expect(calculateBatchTotal(items, 'kg')).toBe(1.5);
  });

  it('skips ea items when target is weight', () => {
    const items = [
      { quantity: 200, unit: 'g' as const },
      { quantity: 2, unit: 'ea' as const },
    ];
    expect(calculateBatchTotal(items, 'g')).toBe(200);
  });

  it('skips weight items when target is ea', () => {
    const items = [
      { quantity: 200, unit: 'g' as const },
      { quantity: 4, unit: 'ea' as const },
    ];
    expect(calculateBatchTotal(items, 'ea')).toBe(4);
  });

  it('applies waste factor when wasteByItemId is provided', () => {
    const items = [
      { id: 'a', quantity: 1000, unit: 'g' as const },
      { id: 'b', quantity: 500, unit: 'g' as const },
    ];
    const waste = new Map([['a', 20]]); // 20% waste on item a
    // item a: 1000 * (80/100) = 800, item b: 500
    expect(calculateBatchTotal(items, 'g', waste)).toBe(1300);
  });

  it('returns 0 for empty items array', () => {
    expect(calculateBatchTotal([], 'g')).toBe(0);
  });
});
