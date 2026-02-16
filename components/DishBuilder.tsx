
import React, { useState, useMemo, useEffect } from 'react';
import { Dish, DishItem, Unit, Recipe, Ingredient, Allergen } from '../types';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES, COLORS } from '../constants';
import StagingBox from './StagingBox';

const getConvertedQuantity = (quantity: number, fromUnit: Unit, toUnit: Unit): number => {
  if (fromUnit === toUnit) return quantity;
  if (fromUnit === 'kg' && toUnit === 'g') return quantity * 1000;
  if (fromUnit === 'g' && toUnit === 'kg') return quantity / 1000;
  if (fromUnit === 'l' && toUnit === 'ml') return quantity * 1000;
  if (fromUnit === 'ml' && toUnit === 'l') return quantity / 1000;
  return quantity; 
};

interface DishBuilderProps {
  onPushRecipe: (name?: string) => void;
  onPushIngredient: (name?: string) => void;
  stagedItemId: string | null;
  stagedItemType: 'ingredient' | 'recipe' | 'dish';
  clearStaged: () => void;
  onSetLibraryTab: (tab: any) => void;
  onSetAvailableTabs: (tabs: any) => void;
}

export const DishBuilder: React.FC<DishBuilderProps> = ({ 
  onPushRecipe, onPushIngredient, stagedItemId, stagedItemType, clearStaged, onSetLibraryTab, onSetAvailableTabs
}) => {
  const { ingredients, recipes, dishes, saveDish, updateDish } = useKitchenData();
  const { confirm } = useConfirmation();

  const [dishName, setDishName] = useState('New Service Dish');
  const [targetGP, setTargetGP] = useState(70);
  const [items, setItems] = useState<DishItem[]>([]);
  const [instructions, setInstructions] = useState('');
  const [activeDishId, setActiveDishId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isManualNew, setIsManualNew] = useState(false);

  const stagedObject = stagedItemType === 'ingredient' 
    ? ingredients.find(i => i.id === stagedItemId) 
    : stagedItemType === 'recipe' 
      ? recipes.find(r => r.id === stagedItemId)
      : dishes.find(d => d.id === stagedItemId);

  const isSessionActive = !!activeDishId || isManualNew;

  const enterEditMode = (dish: Dish) => {
    setDishName(dish.name);
    setTargetGP(dish.targetGP || 70);
    setItems(dish.items || []);
    setInstructions(dish.instructions || '');
    setActiveDishId(dish.id);
    setIsManualNew(false);
    clearStaged();
    onSetAvailableTabs(['ingredients', 'recipes', 'dishes']);
    onSetLibraryTab('ingredients');
  };

  const addItem = (newItem: any) => {
    setItems(prev => [...prev, {
      id: stagedItemId!,
      type: stagedItemType as 'ingredient' | 'recipe',
      quantity: newItem.quantity,
      unit: newItem.unit
    }]);
    clearStaged();
  };

  const updateItem = (idx: number, updates: Partial<DishItem>) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  };

  const calculateRecipeUnitCost = (recipeId: string): number => {
    const recipe = recipes.find(r => r.id === recipeId);
    if (!recipe) return 0;
    const totalBatchCost = recipe.items.reduce((acc, item) => {
      const component = item.type === 'ingredient' ? ingredients.find(i => i.id === item.id) : recipes.find(r => r.id === item.id);
      if (!component) return acc;
      const costPerUnit = item.type === 'ingredient' 
        ? (component as Ingredient).packCost / (component as Ingredient).packSize 
        : calculateRecipeUnitCost(item.id);
      return acc + (item.quantity * costPerUnit);
    }, 0);
    return recipe.batchSize > 0 ? totalBatchCost / recipe.batchSize : 0;
  };

  const dishFinancials = useMemo(() => {
    const totalCost = items.reduce((acc, item) => {
      if (item.type === 'ingredient') {
        const ing = ingredients.find(i => i.id === item.id);
        if (!ing) return acc;
        return acc + (getConvertedQuantity(item.quantity, item.unit, ing.packUnit) * (ing.packCost / ing.packSize));
      }
      return acc + (item.quantity * calculateRecipeUnitCost(item.id));
    }, 0);
    return { totalCost, sellPrice: totalCost / (1 - (targetGP / 100)) };
  }, [items, ingredients, recipes, targetGP]);

  const aggregatedAllergens = useMemo(() => {
    const allergenSet = new Set<Allergen>();
    items.forEach(item => {
      if (item.type === 'ingredient') ingredients.find(i => i.id === item.id)?.allergens?.forEach(a => allergenSet.add(a));
      else recipes.find(r => r.id === item.id)?.items.forEach(ri => {
        if (ri.type === 'ingredient') ingredients.find(i => i.id === ri.id)?.allergens?.forEach(a => allergenSet.add(a));
      });
    });
    return Array.from(allergenSet).sort();
  }, [items, ingredients, recipes]);

  const handleSave = async () => {
    setIsSaving(true);
    const dishData = { name: dishName, items, instructions, targetGP, sellPrice: dishFinancials.sellPrice, sourceType: 'manual' as const };
    try {
      if (activeDishId) await updateDish(activeDishId, dishData);
      else await saveDish(dishData);
      setItems([]); setDishName('New Service Dish'); setInstructions(''); setActiveDishId(null); setIsManualNew(false);
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-[#111111] overflow-hidden">
      <div className="p-4 border-b border-[#333333] bg-[#1c1c1c] flex flex-wrap gap-4 justify-between items-center">
        <div className="flex flex-col">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#888888]">Service Module // DISH BUILDER</span>
          <input 
            value={dishName} readOnly={!isSessionActive} onChange={e => setDishName(e.target.value)}
            className={`bg-transparent border-b border-[#333333] focus:border-[#c8a96e] text-lg font-sans font-bold px-1 outline-none w-80 ${!isSessionActive ? 'opacity-40' : ''}`}
            placeholder="DISH_IDENTITY_NAME"
          />
        </div>
        <div className="flex gap-4 items-center">
          <div className={`text-right ${!isSessionActive ? 'opacity-30' : ''}`}>
             <div className={UI_STYLES.label}>Target GP %</div>
             <input type="number" disabled={!isSessionActive} value={targetGP} onChange={e => setTargetGP(parseInt(e.target.value) || 0)} className="bg-transparent text-right font-mono text-xl text-[#c8a96e] w-16 outline-none" />
          </div>
          <div className="flex gap-2">
            {isSessionActive ? (
              <>
                <button onClick={async () => { 
                  const ok = await confirm("Discard all unsaved changes to this dish?");
                  if(ok) { setActiveDishId(null); setIsManualNew(false); }
                }} className={`${UI_STYLES.button} border border-[#333333] text-[#888888] hover:text-white`}>Discard Build</button>
                <button onClick={handleSave} disabled={items.length === 0 || isSaving} className={`${UI_STYLES.button} bg-[#c8a96e] text-black disabled:opacity-20`}>{isSaving ? 'COMMITTING...' : activeDishId ? 'Update Plate' : 'Commit Dish'}</button>
              </>
            ) : (
              <>
                {stagedItemId && stagedItemType === 'dish' && (
                  <button onClick={() => enterEditMode(stagedObject as Dish)} className={`${UI_STYLES.button} bg-[#4a5568] text-white hover:bg-[#5a6578]`}>Modify Plate</button>
                )}
                <button onClick={() => setIsManualNew(true)} className={`${UI_STYLES.button} bg-[#c8a96e] text-black hover:bg-white`}>+ New Plate</button>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-[#333333] bg-[#0d0d0d] min-h-[120px]">
        {stagedObject && stagedItemType !== 'dish' ? (
          <StagingBox item={stagedObject as any} onAdd={addItem} onCancel={clearStaged} />
        ) : (
          <div className="flex h-full items-center justify-center border border-dashed border-[#333333] p-6 text-center">
            <span className="text-[10px] uppercase font-bold text-[#444] tracking-[0.3em]">
              {isSessionActive ? 'Select components from library to add' : 'Awaiting dish initialization'}
            </span>
          </div>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto p-4 md:p-8 space-y-8 transition-opacity ${!isSessionActive ? 'opacity-20 pointer-events-none' : ''}`}>
        <div className="border border-[#333333] divide-y divide-[#333333] bg-[#0d0d0d]">
          {items.length === 0 ? (
            <div className="p-16 text-center text-[#444] font-mono text-xs uppercase opacity-40">AWAITING_COMPONENT_STREAM</div>
          ) : (
            items.map((item, idx) => {
              const component = item.type === 'ingredient' ? ingredients.find(i => i.id === item.id) : recipes.find(r => r.id === item.id);
              let cost = item.type === 'ingredient' 
                ? getConvertedQuantity(item.quantity, item.unit, (component as Ingredient)?.packUnit || 'g') * ((component as Ingredient)?.packCost / (component as Ingredient)?.packSize)
                : item.quantity * calculateRecipeUnitCost(item.id);

              return (
                <div key={idx} className="p-4 flex justify-between items-center group hover:bg-[#1c1c1c] transition-colors">
                  <div className="flex items-center gap-6 flex-1">
                    <span className="text-[10px] font-mono text-[#444] w-6">{idx+1}</span>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase text-[#e0e0e0]">{component?.name || 'UNKNOWN'}</span>
                      <span className="text-[8px] font-mono text-[#666] uppercase">{item.type} // {item.id.slice(0, 8)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-8">
                    <div className="flex items-center gap-2">
                      <input type="number" value={item.quantity} onChange={(e) => updateItem(idx, { quantity: parseFloat(e.target.value) || 0 })} className="bg-transparent text-right font-mono text-xs text-white border-b border-[#333] w-16 outline-none" />
                      <select value={item.unit} onChange={(e) => updateItem(idx, { unit: e.target.value as Unit })} className="bg-transparent text-[10px] font-mono text-[#888] outline-none">
                        <option value="g">g</option><option value="ml">ml</option><option value="kg">kg</option><option value="l">l</option><option value="ea">ea</option>
                      </select>
                    </div>
                    <div className="text-right min-w-[80px] text-sm font-mono text-[#c8a96e]">£{cost.toFixed(2)}</div>
                    <div className="flex gap-1">
                      {onPushRecipe && item.type === 'recipe' && (
                        <button onClick={() => onPushRecipe(component?.name)} className="p-2 text-[#4a5568] hover:text-white transition-colors">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                        </button>
                      )}
                      <button onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))} className="text-[#444] hover:text-red-500 p-2"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
               <label className={UI_STYLES.label}>Allergen Risk Profile</label>
               <div className="flex flex-wrap gap-2">
                  {aggregatedAllergens.length === 0 ? <span className="text-[10px] text-[#444] font-mono uppercase">NO_RISKS</span> : aggregatedAllergens.map(a => <span key={a} className="px-3 py-1.5 border border-[#333] bg-[#1c1c1c] text-[#888] text-[9px] font-bold uppercase">{a}</span>)}
               </div>
            </div>
            <div className="space-y-4">
               <label className={UI_STYLES.label}>Plating & Service Notes</label>
               <textarea value={instructions} onChange={e => setInstructions(e.target.value)} className={`w-full h-32 ${UI_STYLES.input} resize-none`} placeholder="Plating instructions..." />
            </div>
        </div>
      </div>

      <div className={`p-6 border-t border-[#333333] bg-[#1c1c1c] flex justify-between items-center gap-8 ${!isSessionActive ? 'opacity-40' : ''}`}>
         <div className="flex gap-16">
            <div><label className={UI_STYLES.label}>Plate Cost</label><div className="text-3xl font-mono text-white">£{dishFinancials.totalCost.toFixed(2)}</div></div>
            <div><label className={UI_STYLES.label}>Retail (@{targetGP}%)</label><div className="text-3xl font-mono text-[#c8a96e]">£{dishFinancials.sellPrice.toFixed(2)}</div></div>
         </div>
         <div className="text-right text-[10px] font-mono text-[#666] uppercase">Telemtry: {isSessionActive ? 'ACTIVE' : 'IDLE'}</div>
      </div>
    </div>
  );
};
