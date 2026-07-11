import { Dish, Recipe, Ingredient, FoodCheckType } from '../types';

// Minimum temperature (°C) required for each check type. Snapshotted onto
// each FoodTempCheck record at the time it's logged, so history stays
// accurate if these standards change later.
export const FOOD_TEMP_THRESHOLDS: Record<FoodCheckType, number> = {
  'Cooked Core': 75,
  'Reheat': 75,
  'Hot Hold': 63
};

/**
 * Walks a dish's component tree (ingredients + nested recipes, recursively)
 * to resolve which food-safety temperature checks it needs, based on
 * tempCheckType tags set once on the underlying ingredients/recipes.
 *
 * If a recipe has its own tempCheckType set, that's used and its own
 * ingredients are NOT recursed into — the recipe's cooking process has
 * already resolved the raw/cooked state (e.g. "12 Hour Cooked Pork Belly"
 * is tagged Reheat even though its raw pork belly ingredient might itself
 * be tagged Cooked Core for use in other, cooked-to-order dishes).
 *
 * Hot Hold is added separately from dish.requiresHotHoldCheck, since it's
 * a service-holding property rather than a protein state.
 */
export function resolveDishTempChecks(
  dish: Dish,
  recipesById: Map<string, Recipe>,
  ingredientsById: Map<string, Ingredient>
): FoodCheckType[] {
  const found = new Set<FoodCheckType>();
  const visitedRecipeIds = new Set<string>();

  function visitRecipe(recipe: Recipe) {
    if (visitedRecipeIds.has(recipe.id)) return; // guard against cycles
    visitedRecipeIds.add(recipe.id);

    if (recipe.tempCheckType) {
      found.add(recipe.tempCheckType);
      return;
    }
    for (const item of recipe.items) {
      if (item.type === 'ingredient' && item.ingredientId) {
        const ingredient = ingredientsById.get(item.ingredientId);
        if (ingredient?.tempCheckType) found.add(ingredient.tempCheckType);
      } else if (item.type === 'recipe' && item.subRecipeId) {
        const subRecipe = recipesById.get(item.subRecipeId);
        if (subRecipe) visitRecipe(subRecipe);
      }
    }
  }

  for (const item of dish.items) {
    if (item.type === 'ingredient' && item.ingredientId) {
      const ingredient = ingredientsById.get(item.ingredientId);
      if (ingredient?.tempCheckType) found.add(ingredient.tempCheckType);
    } else if (item.type === 'recipe' && item.subRecipeId) {
      const recipe = recipesById.get(item.subRecipeId);
      if (recipe) visitRecipe(recipe);
    }
  }

  if (dish.requiresHotHoldCheck) found.add('Hot Hold');

  return Array.from(found);
}

export interface FoodTempChecklistItem {
  dishId: string;
  dishName: string;
  checkType: FoodCheckType;
}

/** Flattens every live dish's resolved checks into one tile per (dish, checkType) pair. */
export function buildFoodTempChecklist(
  dishes: Dish[],
  recipes: Recipe[],
  ingredients: Ingredient[]
): FoodTempChecklistItem[] {
  const recipesById = new Map(recipes.map(r => [r.id, r]));
  const ingredientsById = new Map(ingredients.map(i => [i.id, i]));

  const items: FoodTempChecklistItem[] = [];
  for (const dish of dishes) {
    if (!dish.isLive) continue;
    const checks = resolveDishTempChecks(dish, recipesById, ingredientsById);
    for (const checkType of checks) {
      items.push({ dishId: dish.id, dishName: dish.name, checkType });
    }
  }
  return items;
}
