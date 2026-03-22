import { describe, it, expect } from 'vitest';
import { getProduceYield } from './yields';

describe('getProduceYield', () => {
  it('returns known yield for exact name match', () => {
    expect(getProduceYield('carrot')).toBe(82);
    expect(getProduceYield('spinach')).toBe(92);
    expect(getProduceYield('potato')).toBe(81);
  });

  it('is case-insensitive', () => {
    expect(getProduceYield('Carrot')).toBe(82);
    expect(getProduceYield('SPINACH')).toBe(92);
    expect(getProduceYield('Potato')).toBe(81);
  });

  it('strips common prefixes before matching', () => {
    expect(getProduceYield('fresh carrot')).toBe(82);
    expect(getProduceYield('organic spinach')).toBe(92);
    expect(getProduceYield('baby spinach')).toBe(92);
    expect(getProduceYield('frozen peas')).toBe(38);
  });

  it('strips parenthetical suffixes before matching', () => {
    expect(getProduceYield('carrot (peeled)')).toBe(82);
  });

  it('uses partial matching when prefix stripping fails', () => {
    // "cherry tomatoes" contains "cherry tomatoes" key
    expect(getProduceYield('cherry tomatoes')).toBe(95);
    // partial: "lemons" should match "lemons" key
    expect(getProduceYield('lemons')).toBe(30);
  });

  it('returns null for unknown ingredients', () => {
    expect(getProduceYield('salt')).toBeNull();
    expect(getProduceYield('chicken breast')).toBeNull();
    expect(getProduceYield('plain flour')).toBeNull();
  });

  it('handles trailing whitespace', () => {
    expect(getProduceYield('  carrot  ')).toBe(82);
  });

  it('returns known yields for fruit', () => {
    expect(getProduceYield('apple')).toBe(76);
    expect(getProduceYield('banana')).toBe(67);
    expect(getProduceYield('lemon')).toBe(30);
    expect(getProduceYield('mango')).toBe(68);
  });
});
