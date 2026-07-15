import React, { useState } from 'react';
import { Search } from 'lucide-react';
import { Ingredient, Recipe } from '../types';
import { tokenizeSearchQuery, matchesSearchTokens } from '../utils/search';

// Type-ahead combobox over Ingredients + Recipes (the same "raw ingredient
// or mid-tier prep-recipe" pairing used across the app). Two modes:
//  - no `selected` prop: an always-open search box that stays open after a
//    pick, for building up a list (e.g. adding rows to a recipe)
//  - `selected` set: shows a chip with the current pick instead of the
//    search box, with a "Change" action to reopen it (e.g. a single-value
//    field like the Wastage form)
interface ItemPickerProps {
  ingredients: Ingredient[];
  recipes: Recipe[];
  onSelectIngredient: (ing: Ingredient) => void;
  onSelectRecipe?: (rec: Recipe) => void;
  excludeRecipe?: (rec: Recipe) => boolean;
  placeholder?: string;
  actionLabel?: string;
  maxResultsPerGroup?: number;
  selected?: string;
  onClear?: () => void;
}

export default function ItemPicker({
  ingredients,
  recipes,
  onSelectIngredient,
  onSelectRecipe,
  excludeRecipe,
  placeholder = 'Search ingredients or recipes...',
  actionLabel = '+ Add',
  maxResultsPerGroup = 5,
  selected,
  onClear
}: ItemPickerProps) {
  const [query, setQuery] = useState('');

  if (selected !== undefined) {
    return (
      <div className="w-full flex items-center justify-between px-3 py-3 border border-outline-variant bg-surface-container-lowest text-sm">
        <span className="font-semibold text-on-surface">{selected || 'None selected'}</span>
        {onClear && (
          <button type="button" onClick={onClear} className="text-primary label-caps text-[10px] font-bold">
            Change
          </button>
        )}
      </div>
    );
  }

  const queryTokens = query.trim().length > 1 ? tokenizeSearchQuery(query) : null;
  const matchingIngredients = queryTokens
    ? ingredients.filter(i => matchesSearchTokens(i.name, queryTokens)).slice(0, maxResultsPerGroup)
    : [];
  const matchingRecipes = queryTokens && onSelectRecipe
    ? recipes
      .filter(r => matchesSearchTokens(r.name, queryTokens) && !(excludeRecipe && excludeRecipe(r)))
      .slice(0, maxResultsPerGroup)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative flex items-center bg-surface-container-lowest border border-outline-variant rounded-sm px-3 py-1.5 focus-within:border-primary">
        <Search className="h-4 w-4 text-outline mr-2" />
        <input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="flex-1 text-xs bg-transparent outline-none border-none focus:ring-0 p-0"
        />
      </div>

      {queryTokens && (
        matchingIngredients.length === 0 && matchingRecipes.length === 0 ? (
          <div className="p-3 text-xs text-outline bg-surface-container-lowest border border-outline-variant rounded-sm">
            No matching ingredients{onSelectRecipe ? ' or recipes' : ''}.
          </div>
        ) : (
          <div className="max-h-64 overflow-y-auto bg-surface-container-lowest border border-outline-variant rounded-sm">
            {matchingIngredients.length > 0 && (
              <div className="divide-y divide-outline-variant">
                <div className="px-3 py-1 text-[9px] label-caps text-outline font-bold bg-surface-container-low">Ingredients</div>
                {matchingIngredients.map(ing => (
                  <div
                    key={`ing-${ing.id}`}
                    onClick={() => { onSelectIngredient(ing); setQuery(''); }}
                    className="p-3 hover:bg-surface-container text-xs cursor-pointer flex justify-between font-semibold"
                  >
                    <span>{ing.name}</span>
                    <span className="text-primary label-caps">{actionLabel}</span>
                  </div>
                ))}
              </div>
            )}
            {matchingRecipes.length > 0 && onSelectRecipe && (
              <div className="divide-y divide-outline-variant">
                <div className="px-3 py-1 text-[9px] label-caps text-outline font-bold bg-surface-container-low">Recipes</div>
                {matchingRecipes.map(rec => (
                  <div
                    key={`rec-${rec.id}`}
                    onClick={() => { onSelectRecipe(rec); setQuery(''); }}
                    className="p-3 hover:bg-surface-container text-xs cursor-pointer flex justify-between font-semibold"
                  >
                    <span>{rec.name}</span>
                    <span className="text-primary label-caps">{actionLabel}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
}
