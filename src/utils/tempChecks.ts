import { Dish, Recipe, Ingredient, FoodCheckType } from '../types';

// Minimum temperature (°C) required for each check type. Snapshotted onto
// each FoodTempCheck record at the time it's logged, so history stays
// accurate if these standards change later.
export const FOOD_TEMP_THRESHOLDS: Record<FoodCheckType, number> = {
  'Cooked Core': 75,
  'Reheat': 75,
  'Hot Hold': 63
};

export type FoodTempItemType = 'ingredient' | 'recipe' | 'dish';

interface ResolvedCheck {
  itemId: string;
  itemName: string;
  itemType: FoodTempItemType;
  checkType: FoodCheckType;
}

/**
 * Walks a dish's component tree (ingredients + nested recipes, recursively)
 * to resolve which food-safety temperature checks it needs, based on
 * tempCheckType tags set once on the underlying ingredients/recipes.
 *
 * Each resolved check identifies the actual item being probed (a recipe
 * or ingredient) rather than the dish — the same batch of e.g. Beef
 * Sirloin is often shared across several live dishes, so checks are
 * deduped per item, not per dish, by buildFoodTempChecklist below.
 *
 * A recipe's own tempCheckType always wins over recursing into its
 * ingredients: 'Cooked Core' / 'Reheat' resolve the check to that recipe
 * itself, and 'None' explicitly stops resolution with no check at all —
 * for something cooked during prep but served cold (e.g. a chicken
 * terrine), where the raw chicken inside would otherwise leak through as
 * a false Cooked Core tile.
 *
 * Hot Hold is added separately from dish.requiresHotHoldCheck, identifying
 * the dish itself as the probed item — it's a service-holding property
 * with no single underlying ingredient/recipe to point to.
 */
function resolveDishTempChecks(
  dish: Dish,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>
): ResolvedCheck[] {
  const found = new Map<string, ResolvedCheck>();
  const visitedRecipeIds = new Set<string>();

  function add(check: ResolvedCheck) {
    found.set(`${check.itemId}|${check.checkType}`, check);
  }

  function visitRecipe(recipe: Recipe) {
    if (visitedRecipeIds.has(recipe.id)) return; // guard against cycles
    visitedRecipeIds.add(recipe.id);

    if (recipe.tempCheckType === 'None') return;
    if (recipe.tempCheckType === 'Cooked Core' || recipe.tempCheckType === 'Reheat') {
      add({ itemId: recipe.id, itemName: recipe.name, itemType: 'recipe', checkType: recipe.tempCheckType });
      return;
    }
    for (const item of recipe.items) {
      if (item.type === 'ingredient' && item.ingredientId) {
        const ingredient = ingredientsById.get(item.ingredientId);
        if (ingredient?.tempCheckType) {
          add({ itemId: ingredient.id, itemName: ingredient.name, itemType: 'ingredient', checkType: ingredient.tempCheckType });
        }
      } else if (item.type === 'recipe' && item.subRecipeId) {
        const subRecipe = recipesById.get(item.subRecipeId);
        if (subRecipe) visitRecipe(subRecipe);
      }
    }
  }

  for (const item of dish.items) {
    if (item.type === 'ingredient' && item.ingredientId) {
      const ingredient = ingredientsById.get(item.ingredientId);
      if (ingredient?.tempCheckType) {
        add({ itemId: ingredient.id, itemName: ingredient.name, itemType: 'ingredient', checkType: ingredient.tempCheckType });
      }
    } else if (item.type === 'recipe' && item.subRecipeId) {
      const recipe = recipesById.get(item.subRecipeId);
      if (recipe) visitRecipe(recipe);
    }
  }

  if (dish.requiresHotHoldCheck) {
    add({ itemId: dish.id, itemName: dish.name, itemType: 'dish', checkType: 'Hot Hold' });
  }

  return Array.from(found.values());
}

export interface FoodTempChecklistItem {
  itemId: string;
  itemName: string;
  itemType: FoodTempItemType;
  checkType: FoodCheckType;
  // Live dishes currently using this item — context shown on the tile,
  // not something the record itself is tied to.
  dishNames: string[];
}

/**
 * Resolves every live dish's checks and dedupes them by the underlying
 * item (ingredient/recipe/dish) being probed, merging in which dishes
 * currently use each one for context. This is the pool a kitchen picks
 * from during a shift — not a per-dish mandatory checklist.
 */
export function buildFoodTempChecklist(
  dishes: Dish[],
  recipes: Recipe[],
  ingredients: Ingredient[]
): FoodTempChecklistItem[] {
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const ingredientsById = new Map(ingredients.map(i => [i.id, i]));

  const byKey = new Map<string, FoodTempChecklistItem>();

  for (const dish of dishes) {
    if (!dish.isLive) continue;
    const checks = resolveDishTempChecks(dish, recipesById, ingredientsById);
    for (const check of checks) {
      const key = `${check.itemId}|${check.checkType}`;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.dishNames.includes(dish.name)) existing.dishNames.push(dish.name);
      } else {
        byKey.set(key, {
          itemId: check.itemId,
          itemName: check.itemName,
          itemType: check.itemType,
          checkType: check.checkType,
          dishNames: [dish.name]
        });
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => a.itemName.localeCompare(b.itemName));
}
