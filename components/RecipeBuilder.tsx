
import React, { useState, useEffect, useMemo } from 'react';
import { Ingredient, Recipe, RecipeItem, Unit } from '../types';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES, COLORS } from '../constants';
import StagingBox from './StagingBox';
import { OCRScanner } from './OCRScanner';

const getConvertedQuantity = (quantity: number, fromUnit: Unit, toUnit: Unit): number => {
  if (fromUnit === toUnit) return quantity;
  if (fromUnit === 'kg' && toUnit === 'g') return quantity * 1000;
  if (fromUnit === 'g' && toUnit === 'kg') return quantity / 1000;
  if (fromUnit === 'l' && toUnit === 'ml') return quantity * 1000;
  if (fromUnit === 'ml' && toUnit === 'l') return quantity / 1000;
  return quantity; 
};

interface RecipeBuilderProps {
  stagedItemId: string | null;
  stagedItemType: 'ingredient' | 'recipe';
  clearStaged: () => void;
  onSetLibraryTab: (tab: 'ingredients' | 'recipes') => void;
  onSetAvailableTabs: (tabs: ('ingredients' | 'recipes')[]) => void;
  isLibraryTabRecipes: boolean;
  onPushIngredient?: (name?: string) => void;
  onPushRecipe?: (name?: string) => void;
  isRecursive?: boolean;
  initialName?: string;
  onComplete?: (id: string) => void;
}

const RecipeBuilder: React.FC<RecipeBuilderProps> = ({ 
  stagedItemId, stagedItemType, clearStaged, onSetLibraryTab, onSetAvailableTabs,
  onPushIngredient, onPushRecipe, isRecursive = false, initialName = '', onComplete
}) => {
  const { ingredients, recipes, saveRecipe, updateRecipe } = useKitchenData();
  const { confirm } = useConfirmation();

  const [recipeName, setRecipeName] = useState(initialName || 'New Recipe');
  const [batchSize, setBatchSize] = useState<number>(1);
  const [batchUnit, setBatchUnit] = useState<Unit>('kg');
  const [gridItems, setGridItems] = useState<RecipeItem[]>([]);
  const [instructions, setInstructions] = useState('');
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [originalRecipe, setOriginalRecipe] = useState<Recipe | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isManualNew, setIsManualNew] = useState(isRecursive);
  const [showScanner, setShowScanner] = useState(false);

  const stagedObject = stagedItemType === 'ingredient' 
    ? ingredients.find(i => i.id === stagedItemId) 
    : recipes.find(r => r.id === stagedItemId);

  const isSessionActive = !!activeRecipeId || isManualNew || isRecursive;

  const isDirty = useMemo(() => {
    if (activeRecipeId) {
      if (!originalRecipe) return true;
      const itemsMatch = JSON.stringify(gridItems) === JSON.stringify(originalRecipe.items);
      return recipeName !== originalRecipe.name || batchSize !== originalRecipe.batchSize || batchUnit !== originalRecipe.batchUnit || instructions !== originalRecipe.instructions || !itemsMatch;
    } else if (isManualNew || isRecursive) {
      return recipeName !== (initialName || 'New Recipe') || gridItems.length > 0 || instructions !== '' || batchSize !== 1 || batchUnit !== 'kg';
    }
    return false;
  }, [activeRecipeId, originalRecipe, recipeName, batchSize, batchUnit, instructions, gridItems, isManualNew, isRecursive, initialName]);

  const enterEditMode = (recipe: Recipe) => {
    setRecipeName(recipe.name);
    setBatchSize(recipe.batchSize || 1);
    setBatchUnit(recipe.batchUnit || 'kg');
    setGridItems(recipe.items || []);
    setInstructions(recipe.instructions || '');
    setActiveRecipeId(recipe.id);
    setOriginalRecipe(recipe);
    setIsManualNew(false);
    clearStaged();
    if (!isRecursive) {
      onSetAvailableTabs(['ingredients', 'recipes']);
      onSetLibraryTab('ingredients');
    }
  };

  const addToGrid = (stagedData: any) => {
    setGridItems(prev => [...prev, {
      type: stagedItemType,
      id: stagedItemId!,
      quantity: stagedData.quantity,
      unit: stagedData.unit
    }]);
    clearStaged();
  };

  const updateGridItem = (idx: number, updates: Partial<RecipeItem>) => {
    setGridItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  };

  const resetBuilder = async () => {
    if (isDirty) {
      const ok = await confirm("Discard all unsaved changes to this formulation?");
      if (!ok) return;
    }
    setRecipeName(initialName || 'New Recipe');
    setBatchSize(1);
    setBatchUnit('kg');
    setGridItems([]);
    setInstructions('');
    setActiveRecipeId(null);
    setOriginalRecipe(null);
    setIsManualNew(isRecursive);
    clearStaged();
  };

  const handleSave = async () => {
    setIsSaving(true);
    const recipeData: Partial<Recipe> = {
      name: recipeName, batchSize, batchUnit, items: gridItems, instructions, sourceType: 'manual'
    };
    try {
      if (activeRecipeId) {
        await updateRecipe(activeRecipeId, recipeData);
        setOriginalRecipe({ id: activeRecipeId, ...recipeData } as Recipe);
      } else {
        const saved = await saveRecipe(recipeData);
        if (isRecursive && onComplete) onComplete(saved.id);
      }
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const handleOCRItems = (scannedItems: any[], scannedMethod?: string) => {
    const formattedItems = scannedItems.map(item => ({
      type: 'ingredient' as const,
      id: item.ingredientId,
      quantity: item.quantity,
      unit: item.unit as Unit
    }));
    setGridItems(prev => [...prev, ...formattedItems]);
    if (scannedMethod) {
      setInstructions(prev => prev ? `${prev}\n\nSCANNED METHOD:\n${scannedMethod}` : scannedMethod);
    }
    setShowScanner(false);
  };

  const calculateRecursiveUnitCost = (rid: string): number => {
    const rec = recipes.find(r => r.id === rid);
    if (!rec) return 0;
    const batchCost = rec.items.reduce((acc, item) => {
      if (item.type === 'ingredient') {
        const ing = ingredients.find(i => i.id === item.id);
        if (!ing) return acc;
        return acc + (getConvertedQuantity(item.quantity, item.unit, ing.packUnit) * (ing.packCost / ing.packSize));
      } else {
        return acc + (item.quantity * calculateRecursiveUnitCost(item.id));
      }
    }, 0);
    return rec.batchSize > 0 ? batchCost / rec.batchSize : 0;
  };

  const totalCost = gridItems.reduce((acc, item) => {
    if (item.type === 'ingredient') {
      const ing = ingredients.find(i => i.id === item.id);
      if (!ing) return acc;
      return acc + (getConvertedQuantity(item.quantity, item.unit, ing.packUnit) * (ing.packCost / ing.packSize));
    }
    return acc + (item.quantity * calculateRecursiveUnitCost(item.id));
  }, 0);
  
  const unitCost = batchSize > 0 ? totalCost / batchSize : 0;

  return (
    <div className="flex flex-col h-full bg-[#111111] overflow-hidden">
      {showScanner && (
        <OCRScanner 
          onAddItems={handleOCRItems} 
          onCancel={() => setShowScanner(false)} 
          onIngredientCreateRequest={(name) => onPushIngredient?.(name)} 
        />
      )}

      <div className="p-4 border-b border-[#333333] bg-[#1c1c1c] flex flex-wrap gap-4 items-center justify-between flex-shrink-0">
        <div className="flex gap-4 items-center flex-1 min-w-[200px]">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">
              {activeRecipeId ? 'Recipe Management // EDIT' : isRecursive ? 'Sub-Recipe Workspace' : 'Recipe Formulation'}
            </span>
            <input 
              value={recipeName} readOnly={!isSessionActive} onChange={(e) => setRecipeName(e.target.value)} 
              className={`bg-transparent border-b border-[#333333] focus:border-[#c8a96e] text-lg font-sans font-bold px-1 outline-none w-full max-w-sm ${!isSessionActive ? 'opacity-50' : ''}`} 
              placeholder="Recipe Identity" 
            />
          </div>
          <div className={`flex items-center gap-3 border-l border-[#333333] pl-4 ${!isSessionActive ? 'opacity-30' : ''}`}>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase text-[#888888]">Yield Target</label>
              <div className="flex items-center gap-2">
                <input type="number" disabled={!isSessionActive} value={batchSize} onChange={(e) => setBatchSize(parseFloat(e.target.value) || 0)} className="bg-transparent border-b border-[#333333] font-mono font-bold w-16 outline-none" />
                <select disabled={!isSessionActive} value={batchUnit} onChange={(e) => setBatchUnit(e.target.value as Unit)} className="bg-transparent text-xs font-mono font-bold uppercase outline-none text-[#c8a96e]">
                  <option value="kg">kg</option><option value="l">l</option><option value="ea">ea</option><option value="g">g</option><option value="ml">ml</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {isSessionActive ? (
            <>
              <button onClick={() => setShowScanner(true)} className={`${UI_STYLES.button} border border-[#c8a96e] text-[#c8a96e] hover:bg-[#c8a96e] hover:text-black`}>OCR Scan</button>
              <button onClick={resetBuilder} className={`${UI_STYLES.button} border border-[#333333] text-[#888888] hover:text-white`}>Discard Build</button>
              <button disabled={gridItems.length === 0 || isSaving} onClick={handleSave} className={`${UI_STYLES.button} bg-[#c8a96e] text-black hover:bg-[#b8985e] disabled:opacity-30`}>
                {isSaving ? 'COMMITTING...' : activeRecipeId ? 'Update Master' : 'Save Formulation'}
              </button>
            </>
          ) : (
            <>
              {stagedItemId && stagedItemType === 'recipe' && (
                <button onClick={() => enterEditMode(stagedObject as Recipe)} className={`${UI_STYLES.button} bg-[#4a5568] text-white hover:bg-[#5a6578]`}>Modify Recipe</button>
              )}
              <button onClick={() => setIsManualNew(true)} className={`${UI_STYLES.button} bg-[#c8a96e] text-black hover:bg-white`}>+ New Build</button>
            </>
          )}
        </div>
      </div>

      <div className="p-4 border-b border-[#333333] min-h-[120px] bg-[#0d0d0d] flex-shrink-0">
        {stagedObject ? (
          <StagingBox item={stagedObject} onAdd={addToGrid} onCancel={clearStaged} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center border border-dashed border-[#333333] text-[10px] uppercase font-bold text-[#444] tracking-[0.3em] p-4 text-center">
            {isSessionActive ? 'Search library to add components or use OCR' : 'Awaiting initialization command'}
          </div>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto p-4 transition-opacity ${!isSessionActive ? 'opacity-20 pointer-events-none' : ''}`}>
        <div className="border border-[#333333] divide-y divide-[#333333] bg-[#0d0d0d]">
          {gridItems.length === 0 ? (
            <div className="p-16 text-center text-[#444] font-mono text-xs uppercase tracking-[0.2em] opacity-40">AWAITING_COMPONENT_STREAM</div>
          ) : (
            gridItems.map((item, idx) => {
              const component = item.type === 'ingredient' ? ingredients.find(i => i.id === item.id) : recipes.find(r => r.id === item.id);
              let cost = item.type === 'ingredient' 
                ? getConvertedQuantity(item.quantity, item.unit, (component as Ingredient)?.packUnit || 'g') * ((component as Ingredient)?.packCost / (component as Ingredient)?.packSize)
                : item.quantity * calculateRecursiveUnitCost(item.id);

              return (
                <div key={idx} className="flex items-center p-3 group hover:bg-[#1c1c1c] transition-colors">
                  <div className="w-8 text-[10px] font-mono text-[#444]">{idx + 1}</div>
                  <div className="flex-1">
                    <div className="text-xs font-bold uppercase text-white">{component?.name || 'UNKNOWN'}</div>
                    <div className="text-[8px] font-mono text-[#666] uppercase">{item.type} // {item.id.slice(0, 8)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input type="number" value={item.quantity} onChange={(e) => updateGridItem(idx, { quantity: parseFloat(e.target.value) || 0 })} className="bg-transparent text-right font-mono text-xs text-[#c8a96e] border-b border-[#333] w-16 outline-none" />
                    <select value={item.unit} onChange={(e) => updateGridItem(idx, { unit: e.target.value as Unit })} className="bg-transparent text-[10px] font-mono text-[#888] outline-none">
                      <option value="g">g</option><option value="ml">ml</option><option value="kg">kg</option><option value="l">l</option><option value="ea">ea</option>
                    </select>
                  </div>
                  <div className="w-24 text-right px-4 border-l border-[#333] ml-4 text-xs font-mono text-[#c8a96e]">£{cost.toFixed(2)}</div>
                  <div className="flex gap-1 ml-2">
                    {onPushRecipe && item.type === 'recipe' && (
                      <button onClick={() => onPushRecipe(component?.name)} className="p-2 text-[#4a5568] hover:text-white transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                    )}
                    <button onClick={() => setGridItems(prev => prev.filter((_, i) => i !== idx))} className="p-2 text-[#444] hover:text-red-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="mt-8">
           <label className={UI_STYLES.label}>Preparation Protocol</label>
           <textarea value={instructions} onChange={e => setInstructions(e.target.value)} className={`w-full h-48 ${UI_STYLES.input} resize-none`} placeholder="Operating procedure..." />
        </div>
      </div>

      <div className={`p-6 border-t border-[#333333] bg-[#1c1c1c] flex justify-between items-center flex-shrink-0 ${!isSessionActive ? 'opacity-40' : ''}`}>
        <div className="flex gap-16">
          <div><label className={UI_STYLES.label}>Aggregate Batch Cost</label><div className="text-3xl font-mono text-white">£{totalCost.toFixed(2)}</div></div>
          <div><label className={UI_STYLES.label}>Unit Production Cost</label><div className="text-3xl font-mono text-[#c8a96e]">£{unitCost.toFixed(2)}</div></div>
        </div>
        <div className="text-right">
          <label className={UI_STYLES.label}>Integrity Status</label>
          <div className={`text-[10px] font-mono uppercase ${isDirty ? 'text-yellow-500 animate-pulse' : 'text-[#444]'}`}>{isDirty ? 'Uncommitted' : isSessionActive ? 'Synchronized' : 'Offline'}</div>
        </div>
      </div>
    </div>
  );
};

export default RecipeBuilder;
