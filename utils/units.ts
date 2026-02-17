
import { Unit } from '../types';

/**
 * Convert a quantity from one unit to another.
 * Supports weight (g/kg), volume (ml/l), and cross-group (1ml ≈ 1g).
 * Returns the quantity unchanged for incompatible conversions involving 'ea'.
 */
export const getConvertedQuantity = (quantity: number, fromUnit: Unit, toUnit: Unit): number => {
  if (fromUnit === toUnit) return quantity;

  // Normalize to base units first (g for weight, ml for volume)
  const toBase: Record<Unit, { base: 'g' | 'ml' | 'ea'; factor: number }> = {
    g:  { base: 'g',  factor: 1 },
    kg: { base: 'g',  factor: 1000 },
    ml: { base: 'ml', factor: 1 },
    l:  { base: 'ml', factor: 1000 },
    ea: { base: 'ea', factor: 1 },
  };

  const from = toBase[fromUnit];
  const to = toBase[toUnit];

  // Guard: unknown unit
  if (!from || !to) return quantity;

  // ea cannot convert to/from weight or volume
  if (from.base === 'ea' || to.base === 'ea') return quantity;

  // Convert to base, then cross-group if needed (1ml = 1g), then to target
  const inBase = quantity * from.factor; // now in g or ml
  // Cross-group: g ↔ ml treated as 1:1
  return inBase / to.factor;
};

/**
 * Calculate total batch size by summing all item quantities converted to the target unit.
 * Skips 'ea' items when target is weight/volume and vice versa.
 */
export const calculateBatchTotal = (
  items: { quantity: number; unit: Unit }[],
  targetUnit: Unit,
  wasteByItemId?: Map<string, number> // item id -> wastePercent (0-100)
): number => {
  const isTargetEa = targetUnit === 'ea';

  return items.reduce((sum, item) => {
    // Skip ea items when summing weight/volume, and skip weight/volume when summing ea
    if (isTargetEa && item.unit !== 'ea') return sum;
    if (!isTargetEa && item.unit === 'ea') return sum;

    const converted = getConvertedQuantity(item.quantity, item.unit, targetUnit);

    // Apply waste/yield factor if available
    const itemId = (item as any).id;
    if (wasteByItemId && itemId) {
      const waste = wasteByItemId.get(itemId);
      if (waste !== undefined && waste > 0) {
        return sum + converted * ((100 - waste) / 100);
      }
    }

    return sum + converted;
  }, 0);
};
