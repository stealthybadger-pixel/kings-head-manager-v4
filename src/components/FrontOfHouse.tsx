import React, { useMemo, useState } from 'react';
import { useDishes, useIngredients, useRecipes } from '../hooks/useKitchenData';
import { Allergen, AllergenSchema, Dish, Ingredient, Recipe } from '../types';

const ALL_ALLERGENS = AllergenSchema.options as Allergen[];

// Short display labels for allergen buttons
const ALLERGEN_LABELS: Record<Allergen, string> = {
  'Milk': 'Milk',
  'Eggs': 'Eggs',
  'Fish': 'Fish',
  'Crustaceans': 'Crustaceans',
  'Molluscs': 'Molluscs',
  'Peanuts': 'Peanuts',
  'Nuts': 'Nuts',
  'Sesame': 'Sesame',
  'Soya': 'Soya',
  'Wheat (Gluten)': 'Gluten',
  'Celery': 'Celery',
  'Mustard': 'Mustard',
  'Sulphites': 'Sulphites',
  'Lupin': 'Lupin',
};

// Emoji icons for each allergen
const ALLERGEN_ICONS: Record<Allergen, string> = {
  'Milk': '🥛',
  'Eggs': '🥚',
  'Fish': '🐟',
  'Crustaceans': '🦐',
  'Molluscs': '🦪',
  'Peanuts': '🥜',
  'Nuts': '🌰',
  'Sesame': '⚬',
  'Soya': '🫘',
  'Wheat (Gluten)': '🌾',
  'Celery': '🌿',
  'Mustard': '🟡',
  'Sulphites': '🍷',
  'Lupin': '💛',
};

// Border colours by dish type
const TYPE_BORDER: Record<string, string> = {
  Starter:  'border-sky-500 shadow-[inset_0_0_0_1px_rgba(14,165,233,0.3)]',
  Main:     'border-amber-500 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.3)]',
  Side:     'border-emerald-500 shadow-[inset_0_0_0_1px_rgba(16,185,129,0.3)]',
  Dessert:  'border-pink-500 shadow-[inset_0_0_0_1px_rgba(236,72,153,0.3)]',
  Drink:    'border-violet-500 shadow-[inset_0_0_0_1px_rgba(139,92,246,0.3)]',
  Other:    'border-zinc-500 shadow-[inset_0_0_0_1px_rgba(113,113,122,0.3)]',
  default:  'border-zinc-700',
};

const TYPE_LABEL_COLOUR: Record<string, string> = {
  Starter: 'text-sky-400',
  Main:    'text-amber-400',
  Side:    'text-emerald-400',
  Dessert: 'text-pink-400',
  Drink:   'text-violet-400',
  Other:   'text-zinc-400',
};

function getTileBorder(dishType?: string): string {
  return TYPE_BORDER[dishType ?? ''] ?? TYPE_BORDER.default;
}

function getDishAllergens(
  dish: Dish,
  ingredientMap: Map<string, Ingredient>,
  recipeMap: Map<string, Recipe>
): Set<Allergen> {
  const allergens = new Set<Allergen>();
  try {

  function collectFromRecipe(recipe: Recipe, depth = 0) {
    if (depth > 5) return; // guard against circular refs
    for (const item of (recipe.items ?? [])) {
      if (item.type === 'ingredient' && item.ingredientId) {
        const ing = ingredientMap.get(item.ingredientId);
        if (ing) ing.allergens.forEach(a => allergens.add(a));
      } else if (item.type === 'recipe' && item.subRecipeId) {
        const sub = recipeMap.get(item.subRecipeId);
        if (sub) collectFromRecipe(sub, depth + 1);
      }
    }
  }

  for (const item of (dish.items ?? [])) {
    if (item.type === 'ingredient' && item.ingredientId) {
      const ing = ingredientMap.get(item.ingredientId);
      if (ing) (ing.allergens ?? []).forEach(a => allergens.add(a));
    } else if (item.type === 'recipe' && item.subRecipeId) {
      const recipe = recipeMap.get(item.subRecipeId);
      if (recipe) collectFromRecipe(recipe);
    }
  }

  } catch (e) {
    console.warn('[FOH] allergen compute error', e);
  }
  return allergens;
}

// Same traversal as getDishAllergens, but attributes each allergen back to
// the specific top-level dish component (ingredient or recipe) that
// contains it — e.g. "Mash Potato: Milk" — rather than only a dish-level
// yes/no. Nested sub-recipe allergens are rolled up under whichever
// top-level component pulled them in.
function getDishComponentAllergens(
  dish: Dish,
  ingredientMap: Map<string, Ingredient>,
  recipeMap: Map<string, Recipe>
): { name: string; allergens: Allergen[] }[] {
  function collectFromRecipe(recipe: Recipe, depth = 0): Set<Allergen> {
    const set = new Set<Allergen>();
    if (depth > 5) return set;
    for (const item of (recipe.items ?? [])) {
      if (item.type === 'ingredient' && item.ingredientId) {
        const ing = ingredientMap.get(item.ingredientId);
        if (ing) (ing.allergens ?? []).forEach(a => set.add(a));
      } else if (item.type === 'recipe' && item.subRecipeId) {
        const sub = recipeMap.get(item.subRecipeId);
        if (sub) collectFromRecipe(sub, depth + 1).forEach(a => set.add(a));
      }
    }
    return set;
  }

  const result: { name: string; allergens: Allergen[] }[] = [];
  try {
    for (const item of (dish.items ?? [])) {
      if (item.type === 'ingredient' && item.ingredientId) {
        const ing = ingredientMap.get(item.ingredientId);
        if (ing) {
          const allergs = ALL_ALLERGENS.filter(a => (ing.allergens ?? []).includes(a));
          if (allergs.length > 0) result.push({ name: ing.name, allergens: allergs });
        }
      } else if (item.type === 'recipe' && item.subRecipeId) {
        const recipe = recipeMap.get(item.subRecipeId);
        if (recipe) {
          const set = collectFromRecipe(recipe);
          const allergs = ALL_ALLERGENS.filter(a => set.has(a));
          if (allergs.length > 0) result.push({ name: recipe.name, allergens: allergs });
        }
      }
    }
  } catch (e) {
    console.warn('[FOH] component allergen compute error', e);
  }
  return result;
}

const FrontOfHouse: React.FC = () => {
  const { data: dishes = [], isLoading: loadingDishes } = useDishes();
  const { data: ingredients = [], isLoading: loadingIngs } = useIngredients();
  const { data: recipes = [], isLoading: loadingRecs } = useRecipes();

  const [activeAllergens, setActiveAllergens] = useState<Set<Allergen>>(new Set());
  const [highlightMode, setHighlightMode] = useState<'grey' | 'show'>('grey');
  const [detailDishId, setDetailDishId] = useState<string | null>(null);

  const ingredientMap = useMemo(
    () => new Map(ingredients.map(i => [i.id, i])),
    [ingredients]
  );
  const recipeMap = useMemo(
    () => new Map(recipes.map(r => [r.id, r])),
    [recipes]
  );

  const liveDishes = useMemo(
    () => dishes.filter(d => d.isLive).sort((a, b) => a.name.localeCompare(b.name)),
    [dishes]
  );

  const dishAllergenMap = useMemo(() => {
    const map = new Map<string, Set<Allergen>>();
    for (const dish of liveDishes) {
      map.set(dish.id, getDishAllergens(dish, ingredientMap, recipeMap));
    }
    return map;
  }, [liveDishes, ingredientMap, recipeMap]);

  const dishComponentAllergenMap = useMemo(() => {
    const map = new Map<string, { name: string; allergens: Allergen[] }[]>();
    for (const dish of liveDishes) {
      map.set(dish.id, getDishComponentAllergens(dish, ingredientMap, recipeMap));
    }
    return map;
  }, [liveDishes, ingredientMap, recipeMap]);

  const detailDish = detailDishId ? liveDishes.find(d => d.id === detailDishId) ?? null : null;

  function toggleAllergen(allergen: Allergen) {
    setActiveAllergens(prev => {
      const next = new Set(prev);
      if (next.has(allergen)) next.delete(allergen);
      else next.add(allergen);
      return next;
    });
  }

  function isGreyed(dish: Dish): boolean {
    if (activeAllergens.size === 0) return false;
    const dishAllgs = dishAllergenMap.get(dish.id) ?? new Set();
    for (const a of activeAllergens) {
      if (dishAllgs.has(a)) return true;
    }
    return false;
  }

  const isLoading = loadingDishes || loadingIngs || loadingRecs;

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-outline-variant px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2 bg-surface">
        <div>
          <h1 className="text-sm font-bold uppercase tracking-widest text-primary">
            Front of House
          </h1>
          <p className="text-xs text-outline mt-0.5">
            {liveDishes.length} live {liveDishes.length === 1 ? 'dish' : 'dishes'}
          </p>
        </div>
        {activeAllergens.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-error font-semibold uppercase tracking-wide">
              {activeAllergens.size} allergen{activeAllergens.size > 1 ? 's' : ''} active — greyed dishes contain them
            </span>
            <button
              onClick={() => setActiveAllergens(new Set())}
              className="text-xs text-outline hover:text-on-surface border border-outline-variant hover:border-outline px-2 py-1 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Allergen filters */}
      <div className="flex-none border-b border-outline-variant px-4 sm:px-5 py-3 bg-surface-container-lowest">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
          <p className="text-xs text-outline uppercase tracking-widest">Toggle to grey out:</p>
          <div className="flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wide">
            {Object.entries(TYPE_LABEL_COLOUR).map(([type, cls]) => (
              <span key={type} className={cls}>● {type}</span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {ALL_ALLERGENS.map(allergen => {
            const active = activeAllergens.has(allergen);
            return (
              <button
                key={allergen}
                onClick={() => toggleAllergen(allergen)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide border transition-all ${
                  active
                    ? 'bg-error text-white border-error'
                    : 'bg-surface border-outline-variant text-outline hover:border-primary hover:text-primary'
                }`}
              >
                <span>{ALLERGEN_ICONS[allergen]}</span>
                {ALLERGEN_LABELS[allergen]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dish grid */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-surface-container-lowest">
        {isLoading ? (
          <div className="flex items-center justify-center h-full text-outline text-sm">
            Loading menu…
          </div>
        ) : liveDishes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-outline gap-2">
            <p className="text-sm">No live dishes yet.</p>
            <p className="text-xs">Toggle dishes as Live in the Dishes section.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 sm:gap-3">
            {liveDishes.map((dish) => {
              const greyed = isGreyed(dish);
              const dishAllgs = dishAllergenMap.get(dish.id) ?? new Set<Allergen>();
              const presentActive = ALL_ALLERGENS.filter(a => activeAllergens.has(a) && dishAllgs.has(a));

              return (
                <button
                  key={dish.id}
                  onClick={() => setDetailDishId(dish.id)}
                  className={`relative flex flex-col justify-between p-3 min-h-[110px] rounded-lg border-2 bg-surface transition-all duration-200 text-left ${
                    greyed ? 'opacity-30 grayscale border-outline-variant' : getTileBorder((dish as any).dishType)
                  }`}
                >
                  {/* Allergen warning badge */}
                  {dishAllgs.size > 0 && !greyed && (
                    <div className="absolute top-1.5 right-1.5">
                      <span className="text-[9px] bg-surface-container text-error px-1 py-0.5 rounded font-bold uppercase tracking-wide">
                        {dishAllgs.size}A
                      </span>
                    </div>
                  )}

                  {(dish as any).dishType && (
                    <p className={`text-[9px] font-bold uppercase tracking-widest mb-1 ${TYPE_LABEL_COLOUR[(dish as any).dishType] ?? 'text-outline'}`}>
                      {(dish as any).dishType}
                    </p>
                  )}
                  <p className="text-sm font-bold text-on-surface leading-snug pr-5">
                    {dish.name}
                  </p>

                  <div className="mt-2">
                    <p className="text-lg font-black text-on-surface tabular-nums">
                      £{(dish.retailPrice ?? 0).toFixed(2)}
                    </p>
                    {greyed && presentActive.length > 0 && (
                      <p className="text-[9px] text-error mt-0.5 leading-tight">
                        {presentActive.map(a => ALLERGEN_LABELS[a]).join(', ')}
                      </p>
                    )}
                    {!greyed && dishAllgs.size > 0 && (
                      <div className="flex flex-wrap gap-0.5 mt-1">
                        {ALL_ALLERGENS.filter(a => dishAllgs.has(a)).map(a => (
                          <span key={a} className="text-[10px]" title={a}>
                            {ALLERGEN_ICONS[a]}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tap-to-drill-down: which specific component(s) contain the allergen(s) */}
      {detailDish && (
        <div
          className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDetailDishId(null)}
        >
          <div
            className="w-full max-w-sm bg-surface border border-outline-variant rounded-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start gap-3 mb-4">
              <div>
                <h2 className="text-sm font-bold text-on-surface">{detailDish.name}</h2>
                <p className="text-xs text-outline mt-0.5">£{(detailDish.retailPrice ?? 0).toFixed(2)}</p>
              </div>
              <button
                onClick={() => setDetailDishId(null)}
                className="text-xs text-outline hover:text-on-surface border border-outline-variant hover:border-outline px-2 py-1 transition-colors flex-shrink-0"
              >
                Close
              </button>
            </div>

            {(() => {
              const components = dishComponentAllergenMap.get(detailDish.id) ?? [];
              if (components.length === 0) {
                return <p className="text-xs text-outline">No allergens detected in any component of this dish.</p>;
              }
              return (
                <div className="flex flex-col gap-2">
                  {activeAllergens.size > 0 && (
                    <p className="text-[10px] text-error uppercase tracking-wide font-semibold mb-1">
                      Highlighting: {Array.from(activeAllergens).map(a => ALLERGEN_LABELS[a]).join(', ')}
                    </p>
                  )}
                  {components.map((comp, idx) => {
                    const matchesFilter = activeAllergens.size > 0 && comp.allergens.some(a => activeAllergens.has(a));
                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded border text-xs ${
                          matchesFilter
                            ? 'bg-error-container border-error text-on-error-container'
                            : 'bg-surface-container-lowest border-outline-variant text-on-surface'
                        }`}
                      >
                        <span className="font-semibold">{comp.name}</span>
                        <span className="text-outline"> — </span>
                        {comp.allergens.map(a => `${ALLERGEN_ICONS[a]} ${ALLERGEN_LABELS[a]}`).join(', ')}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default FrontOfHouse;
