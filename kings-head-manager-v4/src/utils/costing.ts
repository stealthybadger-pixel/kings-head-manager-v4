import { Ingredient, Unit } from '../types';

export const getBaseRate = (cost: number, size: number, unit: string): number => {
  if (unit === 'kg' || unit === 'l') {
    return cost / (size * 1000);
  }
  return cost / size;
};

export const getBaseUnit = (unit: string): 'g' | 'ml' | 'ea' => {
  if (unit === 'kg' || unit === 'g') return 'g';
  if (unit === 'l' || unit === 'ml') return 'ml';
  return 'ea';
};

export const calculateIngredientCost = (
  ingredient: Ingredient,
  quantity: number,
  unit: Unit
): number => {
  const pref = ingredient.suppliers?.find(s => s.isPreferred) || ingredient.suppliers?.[0];
  if (!pref) return 0;

  // Standardize supplier package details
  const packSize = pref.packSize;
  const packCost = pref.packCost;
  const packUnit = pref.packUnit;

  // Conversions
  const ingBaseUnit = getBaseUnit(packUnit);
  const itemBaseUnit = getBaseUnit(unit);

  let packQtyBase = packSize;
  if (packUnit === 'kg' || packUnit === 'l') packQtyBase *= 1000;

  let itemQtyBase = quantity;
  if (unit === 'kg' || unit === 'l') itemQtyBase *= 1000;

  let finalCost = 0;

  if (ingBaseUnit === itemBaseUnit) {
    // Weight-to-Weight, Volume-to-Volume, or Count-to-Count
    const rate = packCost / packQtyBase;
    finalCost = rate * itemQtyBase;
  } else if (ingBaseUnit === 'ea' && (itemBaseUnit === 'g' || itemBaseUnit === 'ml')) {
    // Package is count ('ea'), but recipe is weight/volume ('g' or 'ml')
    // We need pieceWeight or eaWeight (grams per piece)
    const pieceWeight = ingredient.pieceWeight || ingredient.eaWeight || 1;
    const packQtyInWeight = packQtyBase * pieceWeight;
    const rate = packCost / packQtyInWeight;
    finalCost = rate * itemQtyBase;
  } else if ((ingBaseUnit === 'g' || ingBaseUnit === 'ml') && itemBaseUnit === 'ea') {
    // Package is weight/volume, but recipe is count ('ea')
    // We need pieceWeight or eaWeight to convert recipe quantity to weight
    const pieceWeight = ingredient.pieceWeight || ingredient.eaWeight || 1;
    const itemQtyInWeight = itemQtyBase * pieceWeight;
    const rate = packCost / packQtyBase;
    finalCost = rate * itemQtyInWeight;
  } else {
    // Incompatible (e.g. Volume vs Weight, with no density - default fallback to straight rate)
    const rate = packCost / packQtyBase;
    finalCost = rate * itemQtyBase;
  }

  // Adjust for waste
  return finalCost * (1 + (ingredient.wastePercent || 0) / 100);
};
