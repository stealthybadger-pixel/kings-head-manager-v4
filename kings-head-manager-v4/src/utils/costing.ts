import { Ingredient, Unit, Recipe, RecipeItem, DishItem } from '../types';

const GRAMS_PER_OZ = 28.3495231;

// Converts a quantity in its given unit to the base unit's numeric value
// (g for weight, ml for volume, ea for count).
export const toBaseQuantity = (quantity: number, unit: string): number => {
  if (unit === 'kg' || unit === 'l') return quantity * 1000;
  if (unit === 'oz') return quantity * GRAMS_PER_OZ;
  return quantity;
};

export const getBaseRate = (cost: number, size: number, unit: string): number => {
  return cost / toBaseQuantity(size, unit);
};

export const getBaseUnit = (unit: string): 'g' | 'ml' | 'ea' => {
  if (unit === 'kg' || unit === 'g' || unit === 'oz') return 'g';
  if (unit === 'l' || unit === 'ml') return 'ml';
  return 'ea';
};

export const calculateIngredientCost = (
  ingredient: Ingredient,
  quantity: number,
  unit: Unit,
  allIngredients?: Ingredient[]
): number => {
  // Child cut of a whole-item breakdown (e.g. Chicken Supreme from Whole
  // Chicken): has no supplier pricing of its own. Cost is the parent's rate
  // for the same nominal quantity, inflated by the yield loss — buying
  // enough parent to get 1kg of this cut costs (parent rate ÷ yield%).
  if (ingredient.parentIngredientId && ingredient.childYieldPercent && allIngredients) {
    const parent = allIngredients.find(i => i.id === ingredient.parentIngredientId);
    if (parent) {
      const parentCostForQty = calculateIngredientCost(parent, quantity, unit, allIngredients);
      return parentCostForQty / (ingredient.childYieldPercent / 100);
    }
  }

  const pref = ingredient.suppliers?.find(s => s.isPreferred) || ingredient.suppliers?.[0];
  if (!pref) return 0;

  // Standardize supplier package details
  const packSize = pref.packSize;
  const packCost = pref.packCost;
  const packUnit = pref.packUnit;

  // Conversions
  const ingBaseUnit = getBaseUnit(packUnit);
  const itemBaseUnit = getBaseUnit(unit);

  const packQtyBase = toBaseQuantity(packSize, packUnit);
  const itemQtyBase = toBaseQuantity(quantity, unit);

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

// Recursively costs a Dish's (or Recipe's) component list, cascading through
// nested sub-recipes. Shared by any screen that needs a plate/batch cost
// (Service, Dashboard) so the calculation can't drift between them.
export const calculatePlateCost = (
  items: (RecipeItem | DishItem)[],
  ingredients: Ingredient[],
  recipes: Recipe[],
  depth = 0
): number => {
  if (depth > 5) return 0;
  let cost = 0;
  for (const item of (items ?? [])) {
    if (item.type === 'ingredient' && item.ingredientId) {
      const ing = ingredients.find(i => i.id === item.ingredientId);
      if (ing) cost += calculateIngredientCost(ing, item.quantity, item.unit, ingredients);
    } else if (item.type === 'recipe' && item.subRecipeId) {
      const rec = recipes.find(r => r.id === item.subRecipeId);
      if (rec && rec.batchSize) {
        const batchCost = calculatePlateCost(rec.items ?? [], ingredients, recipes, depth + 1);
        if (item.unit === 'portion') {
          // Portions are a slice of the batch by count, not by weight —
          // resolve directly against the recipe's own portionCount rather
          // than going through a weight conversion.
          const portionCount = rec.portionCount || 1;
          cost += (batchCost / portionCount) * item.quantity;
        } else {
          const batchSizeG = toBaseQuantity(rec.batchSize, rec.batchUnit);
          const costPerG = batchCost / batchSizeG;
          const qtyG = toBaseQuantity(item.quantity, item.unit);
          cost += costPerG * qtyG;
        }
      }
    }
  }
  return cost;
};
