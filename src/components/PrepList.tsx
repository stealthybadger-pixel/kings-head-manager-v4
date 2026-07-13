import React, { useState } from 'react';
import { useDishes, useRecipes } from '../hooks/useKitchenData';
import { Dish, Recipe } from '../types';
import { ClipboardList, Radio, Printer } from 'lucide-react';

interface PrepEntry {
  recipeId: string;
  recipeName: string;
  batchSize: number;
  batchUnit: string;
  usedByDishes: string[];
}

function collectPrepRecipes(
  dish: Dish,
  recipes: Recipe[],
  collected: Map<string, PrepEntry>
) {
  for (const item of dish.items) {
    if (item.type !== 'recipe' || !item.subRecipeId) continue;
    const recipe = recipes.find(r => r.id === item.subRecipeId);
    if (!recipe) continue;

    if (collected.has(recipe.id)) {
      const entry = collected.get(recipe.id)!;
      if (!entry.usedByDishes.includes(dish.name)) {
        entry.usedByDishes.push(dish.name);
      }
    } else {
      collected.set(recipe.id, {
        recipeId: recipe.id,
        recipeName: recipe.name,
        batchSize: recipe.batchSize,
        batchUnit: recipe.batchUnit,
        usedByDishes: [dish.name]
      });
    }

    // Recurse into sub-recipes
    const syntheticDish = { ...dish, items: recipe.items as any };
    collectPrepRecipes(syntheticDish, recipes, collected);
  }
}

const PrepList: React.FC = () => {
  const { data: dishes = [], isLoading: loadingDishes } = useDishes();
  const { data: recipes = [], isLoading: loadingRecipes } = useRecipes();
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  const toggleTick = (id: string) =>
    setTicked(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });

  const liveDishes = dishes.filter(d => d.isLive);

  const prepEntries = React.useMemo(() => {
    const collected = new Map<string, PrepEntry>();
    for (const dish of liveDishes) {
      collectPrepRecipes(dish, recipes, collected);
    }
    return Array.from(collected.values()).sort((a, b) => a.recipeName.localeCompare(b.recipeName));
  }, [liveDishes, recipes]);

  const isLoading = loadingDishes || loadingRecipes;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-on-surface-variant text-sm">
        Loading…
      </div>
    );
  }

  if (liveDishes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-on-surface-variant">
        <Radio className="h-12 w-12 opacity-20" />
        <p className="text-sm">No live dishes yet.</p>
        <p className="text-xs opacity-60">Go to Service and toggle the <Radio className="h-3 w-3 inline mx-1" /> icon next to each dish on today's menu.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-6 py-4 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <span className="font-bold text-on-surface">Today's Prep List</span>
          </div>
          <p className="text-xs text-on-surface-variant mt-0.5">
            {liveDishes.length} live dish{liveDishes.length !== 1 ? 'es' : ''} · {prepEntries.length} prep item{prepEntries.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ticked.size > 0 && (
            <button
              onClick={() => setTicked(new Set())}
              className="px-3 py-2 text-sm border border-outline-variant rounded hover:bg-surface-container transition-colors text-on-surface-variant"
            >
              Reset
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-sm border border-outline-variant rounded hover:bg-surface-container transition-colors text-on-surface-variant"
          >
            <Printer className="h-4 w-4" /> Print
          </button>
        </div>
      </div>

      <div className="p-6 max-w-3xl mx-auto space-y-3">

        {/* Live dishes summary */}
        <div className="bg-surface-container border border-outline-variant rounded-lg p-4 mb-6">
          <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-2">Live Menu</p>
          <div className="flex flex-wrap gap-2">
            {liveDishes.map(d => (
              <span key={d.id} className="flex items-center gap-1 text-xs bg-emerald-900/30 text-emerald-300 border border-emerald-700/30 rounded-full px-3 py-1">
                <Radio className="h-3 w-3" /> {d.name}
              </span>
            ))}
          </div>
        </div>

        {prepEntries.length === 0 ? (
          <div className="text-center py-10 text-on-surface-variant text-sm">
            Live dishes have no prep recipes — they use direct ingredients only.
          </div>
        ) : (
          prepEntries.map((entry, i) => {
            const done = ticked.has(entry.recipeId);
            return (
              <div
                key={entry.recipeId}
                onClick={() => toggleTick(entry.recipeId)}
                className={`cursor-pointer border rounded-lg p-4 flex items-start justify-between gap-4 transition-all ${
                  done
                    ? 'bg-surface-container/40 border-outline-variant/40 opacity-50'
                    : 'bg-surface-container border-outline-variant hover:border-primary/40'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`w-6 h-6 rounded border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors ${
                    done ? 'bg-primary border-primary' : 'border-outline-variant'
                  }`}>
                    {done && (
                      <svg className="w-3.5 h-3.5 text-on-primary" viewBox="0 0 12 10" fill="none">
                        <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className={`font-semibold ${done ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                      {entry.recipeName}
                    </div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      {entry.usedByDishes.join(', ')}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-bold ${done ? 'text-on-surface-variant' : 'text-primary'}`}>
                    {entry.batchSize} {entry.batchUnit}
                  </div>
                  <div className="text-xs text-on-surface-variant">per batch</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default PrepList;
