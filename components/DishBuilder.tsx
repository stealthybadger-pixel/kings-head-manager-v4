
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Dish, DishItem, Unit, Recipe, Ingredient, Allergen } from '../types';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES, COLORS } from '../constants';
import { SourceTag } from './SourceTag';
import { AllergenMatrix } from './AllergenMatrix';
import { getConvertedQuantity, toGrams } from '../utils/units';

interface SearchOption {
  id: string;
  name: string;
  type: 'ingredient' | 'recipe';
  sub: string;
  unit: Unit;
}

const GridItemSelect: React.FC<{
  value: string;
  type: 'ingredient' | 'recipe';
  options: SearchOption[];
  onSelect: (option: SearchOption) => void;
  onCreate?: (name: string) => void;
  isEditing: boolean;
  placeholder?: string;
}> = ({ value, type, options, onSelect, onCreate, isEditing, placeholder }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedItem = options.find(o => o.id === value && o.type === type);
  
  useEffect(() => {
    if (selectedItem && !isOpen) {
      setSearch(selectedItem.name);
    } else if (!selectedItem && !isOpen && value) {
       setSearch('UNKNOWN ITEM');
    } else if (!value && !isOpen) {
       setSearch('');
    }
  }, [selectedItem, isOpen, value]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedItem) setSearch(selectedItem.name);
        else setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [selectedItem]);

  const filtered = useMemo(() => {
    if (!search && isOpen) return options.slice(0, 100);
    const lower = search.toLowerCase();
    return options
      .filter(o => o.name.toLowerCase().includes(lower))
      .sort((a, b) => {
         const aStarts = a.name.toLowerCase().startsWith(lower);
         const bStarts = b.name.toLowerCase().startsWith(lower);
         if (aStarts && !bStarts) return -1;
         if (!aStarts && bStarts) return 1;
         return a.name.localeCompare(b.name);
      })
      .slice(0, 50);
  }, [options, search, isOpen]);

  if (!isEditing) {
     return (
       <div className={`text-xs font-bold uppercase ${!selectedItem && value ? 'text-red-500' : 'text-white'}`}>
         {selectedItem ? selectedItem.name : (placeholder || (value ? 'UNKNOWN ITEM' : 'INVALID'))}
         {!selectedItem && value && <span className="ml-2 text-[8px] bg-red-900/30 text-red-500 px-1 border border-red-900">DELETED</span>}
       </div>
     );
  }

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        value={search}
        onFocus={() => setIsOpen(true)}
        onChange={(e) => { setSearch(e.target.value); setIsOpen(true); }}
        placeholder={placeholder}
        className={`w-full bg-transparent text-xs font-bold uppercase outline-none px-2 py-1 transition-colors 
          ${isOpen ? 'border border-[#c8a96e] bg-[#111111] text-[#c8a96e]' : 'border border-transparent text-[#e0e0e0] hover:text-[#c8a96e]'}
          placeholder:text-[#444]
        `}
      />
      {isOpen && (
        <div className="absolute top-full left-0 w-full z-[999] bg-[#111111] border border-[#333333] max-h-48 overflow-y-auto shadow-[0_4px_20px_rgba(0,0,0,0.5)]">
           {filtered.length > 0 ? filtered.map(opt => (
             <div 
               key={`${opt.type}-${opt.id}`}
               onMouseDown={(e) => {
                 e.preventDefault(); // Prevent blur before click
                 onSelect(opt); 
                 setIsOpen(false); 
                 setSearch(opt.name);
               }}
               className="px-2 py-2 hover:bg-[#005f73] hover:text-white cursor-pointer flex justify-between items-center group border-b border-[#222] last:border-0"
             >
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold uppercase text-[#c8a96e] group-hover:text-white">
                    {opt.name}
                  </span>
                  <span className="text-[8px] font-mono text-[#666] group-hover:text-[#ccc]">{opt.sub}</span>
                </div>
             </div>
           )) : (
             <div className="p-2 text-[9px] text-[#666] uppercase">No matches found</div>
           )}
           
           {/* CREATE NEW OPTION */}
           {onCreate && search.length > 2 && !filtered.some(f => f.name.toLowerCase() === search.toLowerCase()) && (
              <div 
                onMouseDown={(e) => {
                  e.preventDefault();
                  onCreate(search);
                  setIsOpen(false);
                }}
                className="px-2 py-2 bg-[#1c1c1c] hover:bg-[#c8a96e] hover:text-black cursor-pointer border-t border-[#333] text-[#c8a96e] font-bold text-[10px] uppercase"
              >
                + CREATE NEW: "{search}"
              </div>
           )}
        </div>
      )}
    </div>
  );
};

interface DishBuilderProps {
  onPushRecipe: (name?: string) => void;
  onPushIngredient: (name?: string) => void;
  stagedItemId: string | null;
  stagedItemType: 'ingredient' | 'recipe' | 'dish';
  clearStaged: () => void;
  onSetLibraryTab: (tab: any) => void;
  onSetAvailableTabs: (tabs: any) => void;
  onModeChange: (isEditing: boolean) => void;
  onInspect?: (id: string, type: 'ingredient' | 'recipe') => void;
  inspectedItem?: {id: string, type: 'ingredient' | 'recipe'} | null;
  forceNewDish?: boolean;
}

export const DishBuilder: React.FC<DishBuilderProps> = ({ 
  onPushRecipe, onPushIngredient, stagedItemId, stagedItemType, clearStaged, onSetLibraryTab, onSetAvailableTabs, onModeChange, onInspect, inspectedItem, forceNewDish
}) => {
  const { ingredients, recipes, dishes, saveDish, updateDish, deleteDish } = useKitchenData();
  const { confirm } = useConfirmation();
  
  // Refs for focus and scroll
  const quantityRefs = useRef<(HTMLInputElement | null)[]>([]);
  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const [focusTarget, setFocusTarget] = useState<number | null>(null);

  const [dishName, setDishName] = useState('New Service Dish');
  const [targetGP, setTargetGP] = useState(70);
  const [items, setItems] = useState<DishItem[]>([]);
  const [instructions, setInstructions] = useState('');
  const [activeDishId, setActiveDishId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const stagedObject = stagedItemType === 'ingredient' 
    ? ingredients.find(i => i.id === stagedItemId) 
    : stagedItemType === 'recipe' 
      ? recipes.find(r => r.id === stagedItemId)
      : dishes.find(d => d.id === stagedItemId);

  // Trigger new dish mode when "New Dish" button clicked in sidebar
  useEffect(() => {
    if (forceNewDish && !isEditing) {
      clearStaged();
      setIsEditing(true);
      setDishName('New Service Dish');
      setItems([]);
      setInstructions('');
      setActiveDishId(null);
    }
  }, [forceNewDish]);

  // Sync state with parent App (Sidebar Control)
  // Reverts to DishList in Browse Mode, Switches to Hybrid in Edit Mode
  useEffect(() => {
    onModeChange(isEditing);
    if (isEditing) {
       onSetAvailableTabs(['ingredients', 'recipes']);
       onSetLibraryTab('ingredients'); // Default tab, but Sidebar isHybrid handles display
    } else {
       onSetAvailableTabs(['dishes']);
       onSetLibraryTab('dishes');
    }
  }, [isEditing, onModeChange, onSetAvailableTabs, onSetLibraryTab]);

  // Direct Injection Logic
  useEffect(() => {
    if (isEditing && stagedItemId && stagedObject && stagedItemType !== 'dish') {
      let defaultUnit: Unit = 'ea';
      if ('packUnit' in stagedObject) {
         defaultUnit = stagedObject.packUnit;
      } else if ('batchUnit' in stagedObject) {
         defaultUnit = (stagedObject as Recipe).batchUnit || 'ea';
      }

      const newItem: DishItem = {
        id: stagedItemId,
        type: stagedItemType as 'ingredient' | 'recipe',
        quantity: 0,
        unit: defaultUnit
      };

      setItems(prev => {
        const next = [...prev, newItem];
        setFocusTarget(next.length - 1);
        return next;
      });
      clearStaged();
    }
  }, [stagedItemId, isEditing, stagedObject, stagedItemType, clearStaged]);

  // Handle Focus & Scroll
  useEffect(() => {
    if (focusTarget !== null && quantityRefs.current[focusTarget]) {
      quantityRefs.current[focusTarget]?.focus();
      scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      setFocusTarget(null);
    }
  }, [items, focusTarget]);

  // Sync View Mode
  useEffect(() => {
    if (stagedItemType === 'dish' && stagedObject && !isEditing) {
      const d = stagedObject as Dish;
      setDishName(d.name);
      setTargetGP(d.targetGP || 70);
      setItems(d.items || []);
      setInstructions(d.instructions || '');
      setActiveDishId(d.id);
      setIsEditing(true);
    } else if (!stagedItemId && !isEditing) {
      setDishName('New Service Dish');
      setItems([]);
      setInstructions('');
      setActiveDishId(null);
    }
  }, [stagedObject, stagedItemType, stagedItemId, isEditing]);

  const enterEditMode = () => {
    setIsEditing(true);
  };

  const handleStartNew = () => {
    clearStaged();
    setIsEditing(true);
    setDishName('New Service Dish');
    setItems([]);
    setInstructions('');
    setActiveDishId(null);
  };

  const handleDiscard = async () => {
    if (await confirm("DISCARD CHANGES? All progress on the pass will be lost.")) {
      setIsEditing(false);
      if (!stagedItemId) {
        setDishName('New Service Dish');
        setItems([]);
      }
    }
  };

  const updateItem = (idx: number, updates: Partial<DishItem>) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  };
  
  const swapItem = (idx: number, option: SearchOption) => {
    setItems(prev => prev.map((item, i) => 
      i === idx ? { ...item, id: option.id, type: option.type, unit: option.unit } : item
    ));
  };

  const getIngredientCost = (ing: Ingredient) => {
    const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
    if (!pref || pref.packSize === 0) return 0;
    return pref.packCost / pref.packSize;
  };

  const getIngredientPackUnit = (ing: Ingredient) => {
    const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
    return pref?.packUnit || 'g';
  };

  const calculateRecipeUnitCost = (recipeId: string): number => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return 0;
    const totalBatchCost = recipe.items.reduce((acc, item) => {
      const itemId = item.id || (item as any).ingredientId || (item as any).recipeId;
      if (!itemId) return acc;

      if (item.type === 'ingredient') {
        const ing = ingredients.find(i => i.id === itemId);
        if (!ing) return acc;
        const costPerUnit = getIngredientCost(ing);
        return acc + (getConvertedQuantity(item.quantity, item.unit, getIngredientPackUnit(ing)) * costPerUnit);
      } else {
        return acc + (item.quantity * calculateRecipeUnitCost(itemId));
      }
    }, 0);
    return recipe.batchSize > 0 ? totalBatchCost / recipe.batchSize : 0;
  };

  // kcal per gram of a recipe's batch output (for use when a recipe appears in a dish)
  const getRecipeKcalPerGram = (recipeId: string): number => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return 0;
    const batchG = toGrams(recipe.batchSize, recipe.batchUnit || 'g');
    if (batchG === 0) return 0;
    const totalKcal = recipe.items.reduce((acc, ri) => {
      const riId = ri.id || (ri as any).ingredientId;
      if (!riId || ri.type !== 'ingredient') return acc;
      const ing = ingredients.find(i => i.id === riId);
      if (!ing) return acc;
      return acc + toGrams(ri.quantity, ri.unit) * ((ing.kcalPer100 || 0) / 100);
    }, 0);
    return totalKcal / batchG;
  };

  const dishFinancials = useMemo(() => {
    let totalCost = 0;
    let totalKcal = 0;

    items.forEach(item => {
      const itemId = item.id || (item as any).ingredientId || (item as any).recipeId;
      if (!itemId) return;

      if (item.type === 'ingredient') {
        const ing = ingredients.find(i => i.id === itemId);
        if (!ing) return;
        totalCost += getConvertedQuantity(item.quantity, item.unit, getIngredientPackUnit(ing)) * getIngredientCost(ing);
        totalKcal += toGrams(item.quantity, item.unit) * ((ing.kcalPer100 || 0) / 100);
      } else {
        totalCost += item.quantity * calculateRecipeUnitCost(itemId);
        totalKcal += toGrams(item.quantity, item.unit) * getRecipeKcalPerGram(itemId);
      }
    });

    return { totalCost, sellPrice: totalCost / (1 - (targetGP / 100)), totalKcal };
  }, [items, ingredients, recipes, targetGP]);

  const aggregatedAllergens = useMemo(() => {
    const allergenSet = new Set<Allergen>();
    items.forEach(item => {
      const itemId = item.id || (item as any).ingredientId || (item as any).recipeId;
      if (!itemId) return;

      if (item.type === 'ingredient') ingredients.find(i => i.id === itemId)?.allergens?.forEach(a => allergenSet.add(a));
      else recipes.find(r => r.id === itemId)?.items.forEach(ri => {
        const riId = ri.id || (ri as any).ingredientId || (ri as any).recipeId;
        if (ri.type === 'ingredient') ingredients.find(i => i.id === riId)?.allergens?.forEach(a => allergenSet.add(a));
      });
    });
    return Array.from(allergenSet).sort();
  }, [items, ingredients, recipes]);
  
  // Build Unified Search Options for Inline Swap
  const searchOptions: SearchOption[] = useMemo(() => {
    const i = ingredients.map(ing => ({ 
      id: ing.id, 
      name: ing.name, 
      type: 'ingredient' as const, 
      sub: ing.category,
      unit: ing.suppliers.find(s=>s.isPreferred)?.packUnit || 'g' as Unit
    }));
    const r = recipes.map(rec => ({ 
      id: rec.id, 
      name: rec.name, 
      type: 'recipe' as const, 
      sub: 'Sub-Recipe',
      unit: rec.batchUnit
    }));
    return [...i, ...r].sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients, recipes]);

  const handleSave = async () => {
    setIsSaving(true);
    
    // Normalize IDs
    const normalizedItems = items.map(item => ({
      type: item.type,
      id: item.id || (item as any).ingredientId || (item as any).recipeId,
      quantity: item.quantity,
      unit: item.unit,
      notes: item.notes // Preserve notes
    }));

    const dishData = { name: dishName, items: normalizedItems, instructions, targetGP, sellPrice: dishFinancials.sellPrice, sourceType: 'manual' as const };
    try {
      if (activeDishId) {
        await updateDish(activeDishId, dishData);
      } else {
        const saved = await saveDish(dishData);
        setActiveDishId(saved.id);
      }
      setIsEditing(false);
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const handleDelete = async () => {
    if (!activeDishId) return;
    if (await confirm("Delete this dish?")) {
      await deleteDish(activeDishId);
      clearStaged();
    }
  };

  const isViewMode = !isEditing && !!stagedItemId && stagedItemType === 'dish';

  return (
    <div className="flex flex-col h-full bg-[#111111] overflow-hidden p-2 relative">
      {/* THE STAGING ENVELOPE */}
      <div className={`flex flex-col h-full bg-[#111111] overflow-hidden transition-all duration-0 ${isEditing ? 'border-2 border-[#005f73]' : 'border border-[#333333]'}`}>
        
        <div className="p-4 border-b border-[#333333] bg-[#1c1c1c] flex flex-wrap gap-4 justify-between items-center">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#888888]">Dish Details</span>
            <input 
              value={dishName} readOnly={!isEditing} onChange={e => setDishName(e.target.value)}
              className={`bg-transparent border-b border-[#333333] focus:border-[#c8a96e] text-lg font-sans font-bold px-1 outline-none w-80 text-[#c8a96e] ${!isEditing ? 'opacity-50' : ''}`}
              placeholder="DISH NAME"
            />
          </div>
          <div className="flex gap-4 items-center">
            <div className={`text-right ${!isEditing ? 'opacity-30' : ''}`}>
               <div className={UI_STYLES.label}>Target GP %</div>
               <input type="number" disabled={!isEditing} value={targetGP} onChange={e => setTargetGP(parseInt(e.target.value) || 0)} className="bg-transparent text-right font-mono text-xl text-[#c8a96e] w-16 outline-none" />
            </div>
            <div className="flex gap-2">
              {isEditing ? (
                <>
                  <button onClick={handleDiscard} className={`${UI_STYLES.button} border border-[#333333] text-[#888888] hover:text-white`}>Discard</button>
                  <button onClick={handleSave} disabled={items.length === 0 || isSaving} className={`${UI_STYLES.button} bg-[#005f73] hover:bg-[#004a5d] text-white disabled:opacity-20`}>{isSaving ? 'COMMITTING...' : 'Save Changes'}</button>
                </>
              ) : (
                <>
                  {isViewMode && (
                    <>
                      <button onClick={enterEditMode} className={`${UI_STYLES.button} border border-[#333333] text-[#e0e0e0] hover:bg-[#c8a96e] hover:text-black`}>Edit</button>
                      <button onClick={handleDelete} className={`${UI_STYLES.button} border border-[#333333] text-[#888] hover:bg-red-900 hover:text-red-500`}>Delete</button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className={`flex-1 overflow-y-auto p-4 md:p-8 space-y-8 transition-opacity ${!isEditing ? 'opacity-80 pointer-events-none' : ''}`}>
          {items.length > 0 && (
            <>
              <div className="border border-[#333333] divide-y divide-[#333333] bg-[#0d0d0d]">
                {items.map((item, idx) => {
                  const rawId = item.id || (item as any).ingredientId || (item as any).recipeId;
                  const component = item.type === 'ingredient' 
                    ? ingredients.find(i => i.id === rawId) 
                    : recipes.find(r => r.id === rawId);
                    
                  let cost = item.type === 'ingredient' 
                    ? getConvertedQuantity(item.quantity, item.unit, getIngredientPackUnit(component as Ingredient)) * (component ? getIngredientCost(component as Ingredient) : 0)
                    : item.quantity * calculateRecipeUnitCost(rawId);

                  const isMissing = !component && !!rawId;
                  const displayName = component?.name || (rawId ? 'UNKNOWN ITEM' : 'INVALID_DATA');
                  const isInspecting = inspectedItem?.id === rawId;

                  return (
                    <div key={idx} className="p-4 flex justify-between items-center group hover:bg-[#1c1c1c] transition-colors">
                      <div className="flex items-center gap-4 flex-1">
                        <span className="text-[10px] font-mono text-[#444] w-6">{idx+1}</span>
                        {/* Source Tag */}
                        <SourceTag 
                          type={item.type} 
                          active={isInspecting}
                          onClick={(e) => {
                             if (onInspect) onInspect(rawId, item.type);
                          }}
                        />

                        <div className="flex-1">
                          <GridItemSelect 
                            value={rawId}
                            type={item.type}
                            options={searchOptions}
                            onSelect={(opt) => swapItem(idx, opt)}
                            onCreate={(name) => onPushIngredient && onPushIngredient(name)}
                            isEditing={isEditing}
                            placeholder={component?.name || "SELECT_ITEM"}
                          />
                          <div className="flex items-center gap-2">
                             <span className="text-[8px] font-mono text-[#666] uppercase mt-1 block">{item.type}</span>
                             {item.notes && <span className="text-[8px] font-mono text-[#888] italic mt-1 border-l border-[#333] pl-2">{item.notes}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-8">
                        <div className="flex items-center gap-2">
                          <input 
                            ref={el => (quantityRefs.current[idx] = el)}
                            type="number" 
                            value={item.quantity} 
                            onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} 
                            className="bg-transparent text-right font-mono text-xs text-white w-16 outline-none" 
                          />
                          <select value={item.unit} onChange={(e) => updateItem(idx, { unit: e.target.value as Unit })} className="bg-transparent text-[10px] font-mono text-[#888] outline-none">
                            <option value="g">g</option><option value="ml">ml</option><option value="kg">kg</option><option value="l">l</option><option value="ea">ea</option>
                          </select>
                        </div>
                        <div className="text-right min-w-[80px] text-sm font-mono text-[#c8a96e]">£{cost.toFixed(4)}</div>
                        <div className="flex gap-1">
                          {onPushRecipe && item.type === 'recipe' && component && (
                            <button onClick={() => onPushRecipe(component.name)} className="p-2 text-[#4a5568] hover:text-white transition-colors">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            </button>
                          )}
                          <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="text-[#444] hover:text-red-500 p-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                        </div>
                      </div>
                    </div>
                  );
                })
              }
              </div>
              <div ref={scrollBottomRef}></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                     <label className={UI_STYLES.label}>Allergen Risk Profile</label>
                     <AllergenMatrix active={aggregatedAllergens} />
                  </div>
                  <div className="space-y-4">
                     <label className={UI_STYLES.label}>The Build</label>
                     <textarea
                        value={instructions}
                        onChange={e => setInstructions(e.target.value)}
                        className={`w-full h-32 bg-transparent outline-none resize-none font-sans text-sm text-[#e0e0e0] placeholder-[#444]`}
                        placeholder="Plating instructions..."
                     />
                  </div>
              </div>
            </>
          )}
        </div>

        <div className={`p-6 border-t border-[#333333] bg-[#1c1c1c] flex justify-between items-center gap-8 ${!isEditing ? 'opacity-100' : ''}`}>
           <div className="flex gap-16">
              <div><label className={UI_STYLES.label}>Plate Cost</label><div className="text-3xl font-mono text-white">£{dishFinancials.totalCost.toFixed(4)}</div></div>
              <div><label className={UI_STYLES.label}>Retail (@{targetGP}%)</label><div className="text-3xl font-mono text-[#c8a96e]">£{dishFinancials.sellPrice.toFixed(2)}</div></div>
              <div><label className={UI_STYLES.label}>Plate Kcal</label><div className="text-3xl font-mono text-[#7D8C7C]">{Math.round(dishFinancials.totalKcal)}<span className="text-sm ml-1 text-[#555]">kcal</span></div></div>
           </div>
           <div className="text-right text-[10px] font-mono text-[#666] uppercase">Telemetry: {isEditing ? 'ACTIVE' : 'IDLE'}</div>
        </div>
      </div>
    </div>
  );
};