import { describe, it, expect } from 'vitest';
import { parsePackText } from '../packParser';

describe('parsePackText', () => {
  it('parses "N x SIZEUNIT" as total pack size', () => {
    expect(parsePackText('12 x 330ml')).toEqual({ packSize: 3960, packUnit: 'ml' });
  });

  it('parses "N x SIZEUNIT" with a decimal size', () => {
    expect(parsePackText('6 x 0.5kg')).toEqual({ packSize: 3, packUnit: 'kg' });
  });

  it('parses a bare "SIZEUNIT"', () => {
    expect(parsePackText('1.36kg')).toEqual({ packSize: 1.36, packUnit: 'kg' });
  });

  it('parses a bare size in litres', () => {
    expect(parsePackText('2l')).toEqual({ packSize: 2, packUnit: 'l' });
  });

  it('parses "Case of N" as N eaches', () => {
    expect(parsePackText('Case of 1')).toEqual({ packSize: 1, packUnit: 'ea' });
  });

  it('parses "Case of N x ..." using the leading count', () => {
    expect(parsePackText('Case of 5 x 1pk')).toEqual({ packSize: 5, packUnit: 'ea' });
  });

  it('is case-insensitive and tolerates extra whitespace', () => {
    expect(parsePackText('  CASE OF 3  ')).toEqual({ packSize: 3, packUnit: 'ea' });
  });

  it('returns null for text it cannot parse', () => {
    expect(parsePackText('Ask in store')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parsePackText('')).toBeNull();
  });
});
