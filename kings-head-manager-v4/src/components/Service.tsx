import React, { useState, useMemo } from 'react';
import { useDishes, useIngredients, useRecipes, useDishMutations } from '../hooks/useKitchenData';
import { useStore } from '../store/useStore';
import { Search, Plus, Trash2, AlertTriangle, CheckCircle, TrendingUp, Radio, ArrowLeft, ExternalLink } from 'lucide-react';
import { Allergen, AllergenSchema, Dish, DishItem, DishModifier, DishType, Ingredient, Recipe, Unit } from '../types';
import { calculateIngredientCost, toBaseQuantity, calculatePlateCost as computePlateCost } from '../utils/costing';
import { useIsMobile } from '../hooks/useIsMobile';

const DISH_TYPES: DishType[] = ['Starter', 'Main', 'Side', 'Dessert', 'Drink', 'Other'];
const ALL_ALLERGENS = AllergenSchema.options as Allergen[];

// Retail price gets rounded to the nearest £0.25 when set from the GP%
// slider, so the GP% recalculated from that rounded price almost never
// matches the exact integer target — it's typically a fraction of a
// point off from rounding, not a real margin shortfall. A small
// tolerance keeps the red-flag alert from firing on that rounding noise.
const GP_ALERT_TOLERANCE = 0.5;

function getDishAllergens(
  items: DishItem[],
  ingredients: Ingredient[],
  recipes: Recipe[]
): Allergen[] {
  const allergens = new Set<Allergen>();
  const ingMap = new Map(ingredients.map(i => [i.id, i]));
  const recMap = new Map(recipes.map(r => [r.id, r]));

  function collect(dishItems: DishItem[], depth = 0) {
    if (depth > 5) return;
    for (const item of (dishItems ?? [])) {
      if (item.type === 'ingredient' && item.ingredientId) {
        (ingMap.get(item.ingredientId)?.allergens ?? []).forEach(a => allergens.add(a));
      } else if (item.type === 'recipe' && item.subRecipeId) {
        const rec = recMap.get(item.subRecipeId);
        if (rec) collect(rec.items ?? [], depth + 1);
      }
    }
  }
  collect(items ?? []);
  return ALL_ALLERGENS.filter(a => allergens.has(a));
}

export const Service: React.FC = () => {
  const { data: dishes = [], isLoading: loadingDishes } = useDishes();
  const { data: ingredients = [], isLoading: loadingIngs } = useIngredients();
  const { data: recipes = [], isLoading: loadingRecs } = useRecipes();
  
  const { addDish, updateDish, deleteDish } = useDishMutations();

  const selectedId = useStore((state) => state.selectedDishId);
  const selectDish = useStore((state) => state.selectDish);
  const showToast = useStore((state) => state.showToast);
  const navigateToPantryWithIngredient = useStore((state) => state.navigateToPantryWithIngredient);
  const navigateToKitchenWithRecipe = useStore((state) => state.navigateToKitchenWithRecipe);
  const isMobile = useIsMobile();

  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [modifierSearchQuery, setModifierSearchQuery] = useState('');
  // Which optional extras are toggled on for the live cost/GP preview —
  // session-only, not saved to the dish (the extras themselves are saved;
  // this is just "what if the customer adds these").
  const [previewModifierIds, setPreviewModifierIds] = useState<Set<string>>(new Set());
  const [dishSort, setDishSort] = useState<'name' | 'date'>('name');
  const [liveFilter, setLiveFilter] = useState<'all' | 'live'>('all');

  // Form edit state
  const [isEditing, setIsEditing] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [formState, setFormState] = useState<Omit<Dish, 'id'> & { id?: string }>({
    name: '',
    retailPrice: 0,
    targetGP: 72,
    items: []
  });

  // Filtered + sorted dishes
  const filteredDishes = useMemo(() => {
    const filtered = dishes.filter(d =>
      d && d.name && d.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      (liveFilter === 'all' || d.isLive)
    );
    if (dishSort === 'date') {
      return [...filtered].sort((a, b) => {
        const aTime = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
        const bTime = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
        return bTime - aTime;
      });
    }
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [dishes, searchQuery, dishSort, liveFilter]);

  // Active dish
  const activeDish = useMemo(() => {
    return dishes.find(d => d.id === selectedId) || null;
  }, [dishes, selectedId]);

  // Set form
  React.useEffect(() => {
    if (activeDish) {
      setFormState({
        ...activeDish,
        targetGP: activeDish.targetGP !== undefined ? activeDish.targetGP : 72,
        retailPrice: activeDish.retailPrice !== undefined ? activeDish.retailPrice : 0,
        items: activeDish.items || []
      });
      setIsEditing(true);
      setIsNew(false);
    } else {
      setIsEditing(false);
    }
  }, [activeDish]);

  const handleStartNew = () => {
    setFormState({
      name: '',
      retailPrice: 0,
      targetGP: 72,
      items: []
    });
    setIsNew(true);
    setIsEditing(true);
    selectDish(null);
  };

  const isSaving = addDish.isPending || updateDish.isPending;

  const handleSave = async () => {
    if (!formState.name) {
      showToast("Dish name is required", "error");
      return;
    }
    try {
      if (isNew) {
        await addDish.mutateAsync(formState);
        showToast(`Dish "${formState.name}" created successfully!`, "success");
      } else if (formState.id) {
        await updateDish.mutateAsync({ id: formState.id, data: formState });
        showToast(`Dish "${formState.name}" updated successfully!`, "success");
      }
      setIsEditing(false);
      setIsNew(false);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to save dish", "error");
    }
  };

  // Add Component to Dish
  const handleAddComponentRow = (item: { id: string; name: string; type: 'ingredient' | 'recipe' }) => {
    if (formState.items.some(i => i.type === item.type && (item.type === 'ingredient' ? i.ingredientId : i.subRecipeId) === item.id)) return;

    const newRow: DishItem = {
      type: item.type,
      ingredientId: item.type === 'ingredient' ? item.id : undefined,
      subRecipeId: item.type === 'recipe' ? item.id : undefined,
      quantity: 100,
      unit: 'g'
    };

    setFormState(prev => ({
      ...prev,
      items: [...prev.items, newRow]
    }));
  };

  const handleUpdateItemQty = (index: number, qty: number) => {
    setFormState(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], quantity: qty };
      return { ...prev, items };
    });
  };

  const handleUpdateItemUnit = (index: number, unit: Unit) => {
    setFormState(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], unit };
      return { ...prev, items };
    });
  };

  const handleRemoveRow = (index: number) => {
    setFormState(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Add Optional Extra to Dish
  const handleAddModifier = (item: { id: string; name: string; type: 'ingredient' | 'recipe' }) => {
    const newModifier: DishModifier = {
      id: `mod_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: item.name,
      type: item.type,
      ingredientId: item.type === 'ingredient' ? item.id : undefined,
      subRecipeId: item.type === 'recipe' ? item.id : undefined,
      quantity: 1,
      unit: 'ea',
      extraPrice: 0
    };
    setFormState(prev => ({ ...prev, modifiers: [...(prev.modifiers ?? []), newModifier] }));
  };

  const handleUpdateModifier = (id: string, patch: Partial<DishModifier>) => {
    setFormState(prev => ({
      ...prev,
      modifiers: (prev.modifiers ?? []).map(m => m.id === id ? { ...m, ...patch } : m)
    }));
  };

  const handleRemoveModifier = (id: string) => {
    setFormState(prev => ({ ...prev, modifiers: (prev.modifiers ?? []).filter(m => m.id !== id) }));
    setPreviewModifierIds(prev => { const next = new Set(prev); next.delete(id); return next; });
  };

  const toggleModifierPreview = (id: string) => {
    setPreviewModifierIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Helper cost calculations
  const getIngredientCost = (ingId: string, quantity: number, unit: Unit) => {
    const ing = ingredients.find(i => i.id === ingId);
    if (!ing) return 0;
    return calculateIngredientCost(ing, quantity, unit, ingredients);
  };

  const getRecipeCost = (recipeId: string, quantity: number, unit: Unit) => {
    const rec = recipes.find(r => r.id === recipeId);
    if (!rec || !rec.batchSize || !rec.items) return 0;

    // Calculate total batch cost
    let batchCost = 0;
    rec.items.forEach(item => {
      if (!item) return;
      if (item.type === 'ingredient' && item.ingredientId) {
        batchCost += getIngredientCost(item.ingredientId, item.quantity, item.unit);
      } else if (item.type === 'recipe' && item.subRecipeId) {
        batchCost += getRecipeCost(item.subRecipeId, item.quantity, item.unit);
      }
    });

    // Portions are a slice of the batch by count, not by weight.
    if (unit === 'portion') {
      const portionCount = rec.portionCount || 1;
      return (batchCost / portionCount) * quantity;
    }

    // Translate batch cost to unit cost
    const batchSizeG = toBaseQuantity(rec.batchSize, rec.batchUnit);
    const costPerG = batchCost / batchSizeG;

    const qtyG = toBaseQuantity(quantity, unit);

    return costPerG * qtyG;
  };

  const calculatePlateCost = (items: DishItem[]) => {
    let cost = 0;
    if (!items) return 0;
    items.forEach(item => {
      if (item.type === 'ingredient' && item.ingredientId) {
        cost += getIngredientCost(item.ingredientId, item.quantity, item.unit);
      } else if (item.type === 'recipe' && item.subRecipeId) {
        cost += getRecipeCost(item.subRecipeId, item.quantity, item.unit);
      }
    });
    return cost;
  };

  const getModifierCost = (modifier: DishModifier) => {
    if (modifier.type === 'ingredient' && modifier.ingredientId) {
      return getIngredientCost(modifier.ingredientId, modifier.quantity, modifier.unit as Unit);
    }
    if (modifier.type === 'recipe' && modifier.subRecipeId) {
      return getRecipeCost(modifier.subRecipeId, modifier.quantity, modifier.unit as Unit);
    }
    return 0;
  };

  // Financial values
  const plateCost = useMemo(() => {
    return computePlateCost(formState.items, ingredients, recipes);
  }, [formState.items, ingredients, recipes]);

  const currentGP = useMemo(() => {
    if (!formState.retailPrice || formState.retailPrice === 0) return 0;
    return ((formState.retailPrice - plateCost) / formState.retailPrice) * 100;
  }, [plateCost, formState.retailPrice]);

  const suggestedSellPrice = useMemo(() => {
    if (formState.targetGP === 100) return 0;
    return plateCost / (1 - formState.targetGP / 100);
  }, [plateCost, formState.targetGP]);

  const isMarginAlert = currentGP < formState.targetGP - GP_ALERT_TOLERANCE;

  // Live preview of cost/price/GP with the toggled-on optional extras
  // included — not saved anywhere, just a "what if" readout.
  const previewExtras = useMemo(() => {
    const selected = (formState.modifiers ?? []).filter(m => previewModifierIds.has(m.id));
    const extraCost = selected.reduce((sum, m) => sum + getModifierCost(m), 0);
    const extraPrice = selected.reduce((sum, m) => sum + m.extraPrice, 0);
    const withCost = plateCost + extraCost;
    const withPrice = formState.retailPrice + extraPrice;
    const withGP = withPrice > 0 ? ((withPrice - withCost) / withPrice) * 100 : 0;
    return { selected, extraCost, extraPrice, withCost, withPrice, withGP };
  }, [formState.modifiers, formState.retailPrice, previewModifierIds, plateCost, ingredients, recipes]);

  const isLoading = loadingDishes || loadingIngs || loadingRecs;

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-container-lowest">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-surface-container-lowest">
      
      {/* 1. LEFT PANEL: DISH DIRECTORY (35% desktop / full-width mobile list view) */}
      <div className={`${isMobile ? (isEditing ? 'hidden' : 'w-full') : 'w-[35%]'} border-r border-outline-variant h-full flex flex-col bg-surface-container-lowest`}>
        <div className="p-4 border-b border-outline-variant bg-surface flex flex-col gap-3">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <span className="label-caps text-outline font-bold">Menu List</span>
            <div className="flex gap-2 flex-wrap">
              <div className="flex border border-outline-variant rounded-sm overflow-hidden text-[10px] font-bold label-caps">
                <button
                  onClick={() => setDishSort('name')}
                  className={`h-8 px-2.5 transition-colors ${dishSort === 'name' ? 'bg-primary text-white' : 'bg-surface text-outline hover:bg-surface-container-low'}`}
                >
                  A–Z
                </button>
                <button
                  onClick={() => setDishSort('date')}
                  className={`h-8 px-2.5 border-l border-outline-variant transition-colors ${dishSort === 'date' ? 'bg-primary text-white' : 'bg-surface text-outline hover:bg-surface-container-low'}`}
                >
                  Recent
                </button>
              </div>
              <button
                onClick={handleStartNew}
                title="Create new dish"
                className="h-8 px-3 bg-primary text-white flex items-center justify-center gap-1 rounded-sm hover:bg-opacity-90 text-[10px] font-bold label-caps"
              >
                <Plus className="h-4 w-4" />
                New Dish
              </button>
            </div>
          </div>

          <div className="relative flex items-center bg-surface-container-lowest border border-outline-variant rounded-sm px-3 py-1.5 focus-within:border-primary">
            <Search className="h-4 w-4 text-outline mr-2" />
            <input
              type="text"
              placeholder="Search dishes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1 text-sm bg-transparent outline-none border-none focus:ring-0 p-0"
            />
          </div>

          <div className="flex border border-outline-variant rounded-sm overflow-hidden text-[10px] font-bold label-caps w-fit">
            <button
              onClick={() => setLiveFilter('all')}
              className={`h-8 px-3 transition-colors ${liveFilter === 'all' ? 'bg-primary text-white' : 'bg-surface text-outline hover:bg-surface-container-low'}`}
            >
              All Dishes
            </button>
            <button
              onClick={() => setLiveFilter('live')}
              className={`h-8 px-3 border-l border-outline-variant transition-colors ${liveFilter === 'live' ? 'bg-primary text-white' : 'bg-surface text-outline hover:bg-surface-container-low'}`}
            >
              Live Menu Only
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-outline-variant">
          {filteredDishes.map((dish, idx) => {
            if (!dish) return null;
            const cost = computePlateCost(dish.items, ingredients, recipes);
            const gp = dish.retailPrice ? ((dish.retailPrice - cost) / dish.retailPrice) * 100 : 0;
            const price = dish.retailPrice || 0;
            const targetGP = dish.targetGP !== undefined ? dish.targetGP : 72;
            return (
              <div
                key={dish.id}
                onClick={() => selectDish(dish.id)}
                className={`p-4 hover:bg-surface-container cursor-pointer flex justify-between items-center transition-colors ${
                  selectedId === dish.id
                    ? 'bg-surface-container'
                    : idx % 2 === 0
                      ? 'bg-transparent'
                      : 'bg-black/[0.0075]'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateDish.mutate({ id: dish.id, data: { isLive: !dish.isLive } });
                    }}
                    title={dish.isLive ? 'Remove from live menu' : 'Add to live menu'}
                    className={`shrink-0 p-1 rounded-full transition-colors ${dish.isLive ? 'text-emerald-400' : 'text-outline hover:text-on-surface-variant'}`}
                  >
                    <Radio className="h-4 w-4" />
                  </button>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-on-surface">{dish.name || 'Unnamed Dish'}</div>
                    <div className="text-xs text-on-surface-variant mt-0.5">
                      Retail Price: £{price.toFixed(2)}
                    </div>
                  </div>
                </div>
                <div className={`data-tabular text-sm font-bold shrink-0 ${gp < targetGP - GP_ALERT_TOLERANCE ? 'text-error' : 'text-primary'}`}>
                  {gp.toFixed(1)}% GP
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 2. RIGHT PANEL: COSTING WORKSPACE (65% desktop / full-width mobile detail view) */}
      <div className={`${isMobile ? (isEditing ? 'w-full' : 'hidden') : 'flex-1'} h-full p-4 sm:p-8 overflow-y-auto bg-surface-container-lowest flex flex-col gap-6`}>
        {isEditing ? (
          <>
            {isMobile && (
              <button
                onClick={() => { selectDish(null); setIsEditing(false); setIsNew(false); }}
                className="flex items-center gap-1.5 text-xs font-bold label-caps text-outline -mb-2 min-h-[44px]"
              >
                <ArrowLeft className="h-4 w-4" /> Back to list
              </button>
            )}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 border-b border-outline-variant pb-4">
              <div>
                <h2 className="headline-sm font-semibold">{isNew ? 'New Dish Profile' : formState.name}</h2>
                <span className="text-xs text-outline label-caps">Plate Cost Calculator</span>
              </div>
              <div className="flex gap-4">
                {!isNew && (
                  <button 
                    onClick={async () => {
                      if (confirm("Delete this dish permanently?")) {
                        try {
                          await deleteDish.mutateAsync(formState.id!);
                          showToast("Dish deleted successfully", "success");
                          selectDish(null);
                        } catch (err: any) {
                          showToast(err.message || "Failed to delete dish", "error");
                        }
                      }
                    }}
                    disabled={isSaving}
                    className="h-10 px-4 border border-error text-error text-xs font-bold label-caps rounded-sm hover:bg-error-container disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Delete
                  </button>
                )}
                <button 
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`h-10 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 flex items-center gap-2 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Dish'
                  )}
                </button>
              </div>
            </div>

            {/* Inputs Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
              <div className="col-span-2">
                <label className="label-caps text-outline block mb-2">Dish Name</label>
                <input
                  type="text"
                  value={formState.name}
                  onChange={(e) => setFormState(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-outline-variant rounded-sm text-sm"
                  placeholder="e.g., Roast Cod with Parsley Mash"
                />
              </div>

              <div>
                <label className="label-caps text-outline block mb-2">Dish Type</label>
                <select
                  value={(formState as any).dishType ?? ''}
                  onChange={(e) => setFormState(prev => ({ ...prev, dishType: e.target.value as DishType || undefined }))}
                  className="w-full px-3 py-2 border border-outline-variant bg-surface-container-lowest rounded-sm text-sm"
                >
                  <option value="">— Select type —</option>
                  {DISH_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Hot Hold — service-holding check (e.g. soup kept warm in a
                bain-marie). Not derivable from ingredients like Cooked Core
                / Reheat are, so it's a manual per-dish flag. */}
            <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!formState.requiresHotHoldCheck}
                onChange={(e) => setFormState(prev => ({ ...prev, requiresHotHoldCheck: e.target.checked || undefined }))}
                className="h-4 w-4"
              />
              Requires a Hot Hold temperature check (held warm for service)
            </label>

            {/* Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div>
                <div className="flex items-center justify-between mb-1 gap-3">
                  <label className="label-caps text-outline">GP %</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="number" min={0} max={100} step={1}
                      value={formState.targetGP}
                      onChange={e => {
                        const targetGP = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                        const suggestedPrice = targetGP === 100 ? 0 : plateCost / (1 - targetGP / 100);
                        setFormState(prev => ({ ...prev, targetGP, retailPrice: Math.round(suggestedPrice * 4) / 4 }));
                      }}
                      className="w-16 px-1.5 py-0.5 border border-outline-variant rounded-sm text-sm font-bold text-primary data-tabular text-right"
                    />
                    <span className="text-sm font-bold text-primary">%</span>
                  </div>
                </div>
                <input
                  type="range" min={0} max={100} step={1}
                  value={formState.targetGP}
                  onChange={e => {
                    const targetGP = Number(e.target.value);
                    const suggestedPrice = targetGP === 100 ? 0 : plateCost / (1 - targetGP / 100);
                    setFormState(prev => ({ ...prev, targetGP, retailPrice: Math.round(suggestedPrice * 4) / 4 }));
                  }}
                  className="w-full accent-primary h-1.5"
                />
                <div className="flex justify-between text-[10px] text-outline mt-0.5">
                  <span>0%</span><span>50%</span><span>100%</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1 gap-3">
                  <label className="label-caps text-outline">Retail Price</label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-bold text-primary">£</span>
                    <input
                      type="number" min={0} step={0.25}
                      value={formState.retailPrice}
                      onChange={e => {
                        const retailPrice = Math.max(0, Number(e.target.value) || 0);
                        const impliedGP = retailPrice > 0 ? ((retailPrice - plateCost) / retailPrice) * 100 : 0;
                        setFormState(prev => ({ ...prev, retailPrice, targetGP: Math.round(Math.max(0, Math.min(100, impliedGP))) }));
                      }}
                      className="w-20 px-1.5 py-0.5 border border-outline-variant rounded-sm text-sm font-bold text-primary data-tabular text-right"
                    />
                  </div>
                </div>
                <input
                  type="range" min={0} max={100} step={0.25}
                  value={Math.min(formState.retailPrice, 100)}
                  onChange={e => {
                    const retailPrice = Number(e.target.value);
                    const impliedGP = retailPrice > 0 ? ((retailPrice - plateCost) / retailPrice) * 100 : 0;
                    setFormState(prev => ({ ...prev, retailPrice, targetGP: Math.round(Math.max(0, Math.min(100, impliedGP))) }));
                  }}
                  className="w-full accent-primary h-1.5"
                />
                <div className="flex justify-between text-[10px] text-outline mt-0.5">
                  <span>£0</span><span>£50</span><span>£100+</span>
                </div>
              </div>
            </div>

            {/* Dish rows */}
            <div className="mt-4 border-t border-outline-variant pt-6">
              <h3 className="label-caps text-on-surface font-bold mb-4">Dish Components (Recipes / Ingredients)</h3>
              
              <div className="flex flex-col gap-3 mb-6">
                {(formState.items || []).map((item, idx) => {
                  if (!item) return null;
                  const linkedRecipe = item.type === 'recipe' ? recipes.find(r => r.id === item.subRecipeId) : undefined;
                  const name = item.type === 'ingredient'
                    ? ingredients.find(i => i.id === item.ingredientId)?.name
                    : linkedRecipe?.name;

                  const cost = item.type === 'ingredient' && item.ingredientId
                    ? getIngredientCost(item.ingredientId, item.quantity || 0, item.unit)
                    : item.subRecipeId
                      ? getRecipeCost(item.subRecipeId, item.quantity || 0, item.unit)
                      : 0;

                  return (
                    <div key={idx} className="flex gap-4 items-center bg-surface p-4 border border-outline-variant rounded-sm">
                      <div className="flex-1">
                        <span className="font-semibold text-sm text-on-surface">{name || 'Unknown Component'}</span>
                        <div className="text-[10px] text-outline uppercase tracking-wider mt-0.5">
                          {item.type}
                          {linkedRecipe?.portionCount ? ` • ${linkedRecipe.portionCount} portions/batch` : ''}
                        </div>
                      </div>

                      <div className="w-24">
                        <input 
                          type="number" 
                          value={item.quantity}
                          onChange={(e) => handleUpdateItemQty(idx, Math.max(0, parseFloat(e.target.value) || 0))}
                          className="w-full px-2 py-1 border border-outline-variant text-xs data-tabular text-center"
                        />
                      </div>

                      <div className="w-20">
                        <select 
                          value={item.unit}
                          onChange={(e) => handleUpdateItemUnit(idx, e.target.value as any)}
                          className="w-full px-2 py-1 border border-outline-variant bg-surface-container-lowest text-xs"
                        >
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="oz">oz</option>
                          <option value="ml">ml</option>
                          <option value="l">l</option>
                          <option value="ea">ea</option>
                          {linkedRecipe?.portionCount ? <option value="portion">portion</option> : null}
                        </select>
                      </div>

                      <div className="w-20 text-right data-tabular text-sm font-bold text-primary">
                        £{cost.toFixed(2)}
                      </div>

                      {item.type === 'ingredient' && item.ingredientId && (
                        <button
                          onClick={() => navigateToPantryWithIngredient(item.ingredientId!)}
                          title="Open in Pantry"
                          className="p-1 text-outline hover:text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      )}
                      {item.type === 'recipe' && item.subRecipeId && (
                        <button
                          onClick={() => navigateToKitchenWithRecipe(item.subRecipeId!)}
                          title="Open in Kitchen"
                          className="p-1 text-outline hover:text-primary"
                        >
                          <ExternalLink className="h-4 w-4" />
                        </button>
                      )}

                      <button
                        onClick={() => handleRemoveRow(idx)}
                        className="p-1 text-error hover:bg-error-container"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add component search block */}
              <div className="bg-surface p-4 border border-outline-variant rounded-sm flex flex-col gap-3">
                <span className="text-xs label-caps text-outline font-bold">Add Ingredient or Recipe to Dish</span>
                <div className="flex gap-2">
                  <div className="relative flex-1 flex items-center bg-surface-container-lowest border border-outline-variant rounded-sm px-3 py-1.5 focus-within:border-primary">
                    <Search className="h-4 w-4 text-outline mr-2" />
                    <input 
                      type="text" 
                      placeholder="Search items..." 
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                      className="flex-1 text-xs bg-transparent outline-none border-none focus:ring-0 p-0"
                    />
                  </div>
                </div>

                <div className="flex gap-3 text-[10px] label-caps font-bold">
                  <button 
                    onClick={() => {
                      useStore.setState({
                        currentView: 'pantry',
                        selectedIngredientId: 'new',
                        selectedRecipeId: null,
                        selectedDishId: null
                      });
                    }}
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    + Create New Master Ingredient
                  </button>
                  <span className="text-outline-variant">•</span>
                  <button 
                    onClick={() => {
                      useStore.setState({
                        currentView: 'kitchen',
                        selectedRecipeId: 'new',
                        selectedIngredientId: null,
                        selectedDishId: null
                      });
                    }}
                    className="text-primary hover:underline flex items-center gap-1"
                  >
                    + Create New Recipe
                  </button>
                </div>

                {itemSearchQuery.trim().length > 1 && (
                  <div className="max-h-48 overflow-y-auto bg-surface-container-lowest border border-outline-variant divide-y divide-outline-variant rounded-sm">
                    {/* Ingredients match */}
                    {ingredients
                      .filter(i => i.name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                      .slice(0, 3)
                      .map(ing => (
                        <div 
                          key={ing.id}
                          onClick={() => {
                            handleAddComponentRow({ id: ing.id, name: ing.name, type: 'ingredient' });
                            setItemSearchQuery('');
                          }}
                          className="p-3 hover:bg-surface-container text-xs cursor-pointer flex justify-between font-semibold"
                        >
                          <span>{ing.name} <span className="text-[9px] text-outline uppercase font-mono ml-2">Ingredient</span></span>
                          <span className="text-primary label-caps">+ Add</span>
                        </div>
                      ))}
                    {/* Recipes match */}
                    {recipes
                      .filter(r => r.name.toLowerCase().includes(itemSearchQuery.toLowerCase()))
                      .slice(0, 3)
                      .map(rec => (
                        <div 
                          key={rec.id}
                          onClick={() => {
                            handleAddComponentRow({ id: rec.id, name: rec.name, type: 'recipe' });
                            setItemSearchQuery('');
                          }}
                          className="p-3 hover:bg-surface-container text-xs cursor-pointer flex justify-between font-semibold"
                        >
                          <span>{rec.name} <span className="text-[9px] text-outline uppercase font-mono ml-2">Recipe</span></span>
                          <span className="text-primary label-caps">+ Add</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Optional Extras — add-ons priced separately so you don't need
                a distinct live-menu entry per combination (e.g. bacon/egg
                on a burger, chicken/anchovies on a Caesar). Tick the preview
                checkbox to see cost/price/GP with that extra included. */}
            <div className="border-t border-outline-variant pt-4 flex flex-col gap-3">
              <label className="label-caps text-outline block">Optional Extras</label>

              {(formState.modifiers ?? []).length > 0 && (
                <div className="flex flex-col gap-2">
                  {(formState.modifiers ?? []).map((mod) => {
                    const cost = getModifierCost(mod);
                    return (
                      <div key={mod.id} className="flex items-center gap-2 bg-surface p-2 border border-outline-variant rounded-sm">
                        <input
                          type="checkbox"
                          checked={previewModifierIds.has(mod.id)}
                          onChange={() => toggleModifierPreview(mod.id)}
                          title="Include in preview"
                          className="h-4 w-4 shrink-0"
                        />
                        <span className="flex-1 text-xs font-semibold truncate">{mod.name}</span>
                        <input
                          type="number"
                          value={mod.quantity}
                          onChange={(e) => handleUpdateModifier(mod.id, { quantity: Math.max(0, parseFloat(e.target.value) || 0) })}
                          className="w-16 px-2 py-1 border border-outline-variant text-xs data-tabular text-center"
                        />
                        <select
                          value={mod.unit}
                          onChange={(e) => handleUpdateModifier(mod.id, { unit: e.target.value as any })}
                          className="w-16 px-1 py-1 border border-outline-variant bg-surface-container-lowest text-xs"
                        >
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                          <option value="oz">oz</option>
                          <option value="ml">ml</option>
                          <option value="l">l</option>
                          <option value="ea">ea</option>
                        </select>
                        <span className="w-16 text-right data-tabular text-xs text-outline">£{cost.toFixed(2)}</span>
                        <div className="flex items-center gap-1 w-24">
                          <span className="text-xs text-outline">+£</span>
                          <input
                            type="number"
                            step="0.01"
                            value={mod.extraPrice}
                            onChange={(e) => handleUpdateModifier(mod.id, { extraPrice: Math.max(0, parseFloat(e.target.value) || 0) })}
                            title="Extra charge to customer"
                            className="w-16 px-2 py-1 border border-outline-variant text-xs data-tabular text-center"
                          />
                        </div>
                        <button
                          onClick={() => handleRemoveModifier(mod.id)}
                          className="p-1 text-error hover:bg-error-container shrink-0"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="bg-surface p-3 border border-outline-variant rounded-sm flex flex-col gap-2">
                <div className="relative flex items-center bg-surface-container-lowest border border-outline-variant rounded-sm px-3 py-1.5 focus-within:border-primary">
                  <Search className="h-4 w-4 text-outline mr-2" />
                  <input
                    type="text"
                    placeholder="Search ingredients or recipes to add as an extra..."
                    value={modifierSearchQuery}
                    onChange={(e) => setModifierSearchQuery(e.target.value)}
                    className="flex-1 text-xs bg-transparent outline-none border-none focus:ring-0 p-0"
                  />
                </div>
                {modifierSearchQuery.trim().length > 1 && (
                  <div className="max-h-48 overflow-y-auto bg-surface-container-lowest border border-outline-variant divide-y divide-outline-variant rounded-sm">
                    {ingredients
                      .filter(i => i.name.toLowerCase().includes(modifierSearchQuery.toLowerCase()))
                      .slice(0, 5)
                      .map(ing => (
                        <div
                          key={ing.id}
                          onClick={() => { handleAddModifier({ id: ing.id, name: ing.name, type: 'ingredient' }); setModifierSearchQuery(''); }}
                          className="p-3 hover:bg-surface-container text-xs cursor-pointer flex justify-between font-semibold"
                        >
                          <span>{ing.name} <span className="text-[9px] text-outline uppercase font-mono ml-2">Ingredient</span></span>
                          <span className="text-primary label-caps">+ Add</span>
                        </div>
                      ))}
                    {recipes
                      .filter(r => r.name.toLowerCase().includes(modifierSearchQuery.toLowerCase()))
                      .slice(0, 5)
                      .map(rec => (
                        <div
                          key={rec.id}
                          onClick={() => { handleAddModifier({ id: rec.id, name: rec.name, type: 'recipe' }); setModifierSearchQuery(''); }}
                          className="p-3 hover:bg-surface-container text-xs cursor-pointer flex justify-between font-semibold"
                        >
                          <span>{rec.name} <span className="text-[9px] text-outline uppercase font-mono ml-2">Recipe</span></span>
                          <span className="text-primary label-caps">+ Add</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {previewExtras.selected.length > 0 && (
                <div className="flex items-center gap-6 bg-primary/5 border border-primary/20 rounded-sm p-3">
                  <div className="flex flex-col">
                    <span className="text-[10px] label-caps text-outline">With Extras: Cost</span>
                    <span className="text-sm font-bold data-tabular">£{previewExtras.withCost.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] label-caps text-outline">With Extras: Price</span>
                    <span className="text-sm font-bold data-tabular">£{previewExtras.withPrice.toFixed(2)}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] label-caps text-outline">With Extras: GP%</span>
                    <span className={`text-sm font-bold data-tabular ${previewExtras.withGP < formState.targetGP - GP_ALERT_TOLERANCE ? 'text-error' : 'text-primary'}`}>
                      {previewExtras.withGP.toFixed(1)}%
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Allergens (derived from components) */}
            {(() => {
              const dishAllergens = getDishAllergens(formState.items, ingredients, recipes);
              return (
                <div className="border-t border-outline-variant pt-4">
                  <label className="label-caps text-outline block mb-2">Allergens in this dish</label>
                  {dishAllergens.length === 0 ? (
                    <p className="text-xs text-outline italic">None detected from current components</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {dishAllergens.map(a => (
                        <span key={a} className="px-2.5 py-1 text-xs font-semibold bg-error-container text-error border border-error rounded-sm">
                          {a}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* FINANCIAL CALCULATOR BOARD */}
            <div className="mt-8 border-t border-outline-variant pt-6 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 bg-surface p-4 sm:p-6 border border-outline-variant rounded-sm">
              <div className="flex flex-col">
                <span className="label-caps text-outline">Total Plate Cost</span>
                <span className="text-2xl font-bold text-primary data-tabular mt-1">£{plateCost.toFixed(2)}</span>
              </div>

              <div className="flex flex-col">
                <span className="label-caps text-outline">Current GP %</span>
                <span className={`text-2xl font-bold mt-1 data-tabular ${isMarginAlert ? 'text-error' : 'text-primary'}`}>
                  {currentGP.toFixed(1)}%
                </span>
                {isMarginAlert && (
                  <span className="text-[10px] text-error mt-1">Lower than when price was last set ({formState.targetGP}%)</span>
                )}
              </div>

              <div className="flex flex-col">
                <span className="label-caps text-outline">Suggested Retail Price</span>
                <span className="text-2xl font-bold text-primary data-tabular mt-1">£{suggestedSellPrice.toFixed(2)}</span>
                <span className="text-[10px] text-secondary mt-1">Based on the GP% above</span>
              </div>

              {isMarginAlert && (
                <div className="col-span-3 bg-error-container border border-error p-3 text-on-error-container flex gap-2 items-center text-xs mt-2">
                  <AlertTriangle className="h-4 w-4 text-error" />
                  <span>Ingredient costs have moved since this price was last set — actual margin is now lower. Consider updating the price.</span>
                </div>
              )}
            </div>

          </>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center text-outline">
            <UtensilsIcon className="h-12 w-12 text-outline mb-2" />
            <span className="label-caps">Select a dish to view costing sheet</span>
          </div>
        )}
      </div>

    </div>
  );
};

const UtensilsIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"></path>
    <path d="M7 2v20"></path>
    <path d="M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"></path>
  </svg>
);
export default Service;
