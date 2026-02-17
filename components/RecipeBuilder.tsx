
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
  const { ingredients, recipes, saveRecipe, updateRecipe, deleteRecipe } = useKitchenData();
  const { confirm } = useConfirmation();

  // Mode State
  const [isEditing, setIsEditing] = useState(isRecursive); // Default to editing if recursive
  const [isManualNew, setIsManualNew] = useState(isRecursive);

  // Form State
  const [recipeName, setRecipeName] = useState(initialName || 'New Recipe');
  const [batchSize, setBatchSize] = useState<number>(1);
  const [batchUnit, setBatchUnit] = useState<Unit>('kg');
  const [scaleFactor, setScaleFactor] = useState<number>(1);
  const [gridItems, setGridItems] = useState<RecipeItem[]>([]);
  const [instructions, setInstructions] = useState('');
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null); // For updates
  
  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

  const stagedObject = stagedItemType === 'ingredient' 
    ? ingredients.find(i => i.id === stagedItemId) 
    : recipes.find(r => r.id === stagedItemId);

  // VIEW MODE SYNC: If a recipe is selected (Staged) and we are NOT editing, populate fields.
  useEffect(() => {
    if (stagedItemType === 'recipe' && stagedObject && !isEditing && !isManualNew) {
      const r = stagedObject as Recipe;
      setRecipeName(r.name);
      setBatchSize(r.batchSize || 1);
      setBatchUnit(r.batchUnit || 'kg');
      setGridItems(r.items || []);
      setInstructions(r.instructions || '');
      setActiveRecipeId(r.id);
    } else if (!stagedItemId && !isEditing && !isManualNew) {
      // Reset if nothing selected and not editing
      setRecipeName('New Recipe');
      setBatchSize(1);
      setGridItems([]);
      setInstructions('');
      setActiveRecipeId(null);
    }
  }, [stagedObject, stagedItemId, stagedItemType, isEditing, isManualNew]);

  const enterEditMode = () => {
    setIsEditing(true);
    // Ensure tabs are helpful
    onSetAvailableTabs(['ingredients', 'recipes']);
    onSetLibraryTab('ingredients');
  };

  const handleStartNew = () => {
    clearStaged();
    setIsManualNew(true);
    setIsEditing(true);
    setRecipeName('New Recipe');
    setBatchSize(1);
    setBatchUnit('kg');
    setGridItems([]);
    setInstructions('');
    setActiveRecipeId(null);
    onSetAvailableTabs(['ingredients', 'recipes']);
    onSetLibraryTab('ingredients');
  };

  const handleDelete = async () => {
    if (!activeRecipeId) return;
    const ok = await confirm("CONFIRM DELETE? This action cannot be undone.");
    if (ok) {
      await deleteRecipe(activeRecipeId);
      clearStaged(); // Go back to blank
    }
  };

  const handleDiscard = async () => {
    const ok = await confirm("Lose unsaved changes and return to view?");
    if (ok) {
      setIsEditing(false);
      setIsManualNew(false);
      setScaleFactor(1);
      // Effect will re-populate original data if stagedObject exists
      if (!stagedItemId) {
         setRecipeName('New Recipe');
         setGridItems([]);
      }
      
      // Reset sidebar tabs if not in recursive mode (which manages its own context)
      if (!isRecursive) {
        onSetAvailableTabs(['recipes']);
        onSetLibraryTab('recipes');
      }
    }
  };

  const addToGrid = (stagedData: any) => {
    setGridItems(prev => [...prev, {
      type: stagedItemType,
      id: stagedItemId!,
      quantity: stagedData.quantity,
      unit: stagedData.unit
    }]);
    clearStaged(); // Clear staging so we can add more
  };

  const updateGridItem = (idx: number, updates: Partial<RecipeItem>) => {
    setGridItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    // Normalize items to ensure 'id' is set correctly and legacy keys are removed
    const normalizedItems = gridItems.map(item => ({
      type: item.type,
      id: item.id || (item as any).ingredientId || (item as any).recipeId, // Recovery for legacy/OCR props
      quantity: item.quantity,
      unit: item.unit
    }));

    const recipeData: Partial<Recipe> = {
      name: recipeName, batchSize, batchUnit, items: normalizedItems, instructions, sourceType: 'manual'
    };
    try {
      if (activeRecipeId && !isManualNew) {
        await updateRecipe(activeRecipeId, recipeData);
      } else {
        const saved = await saveRecipe(recipeData);
        if (isRecursive && onComplete) onComplete(saved.id);
        setActiveRecipeId(saved.id); // Switch to update mode for this session
      }
      setIsEditing(false);
      setIsManualNew(false);
      
      // Reset sidebar tabs on successful save
      if (!isRecursive) {
        onSetAvailableTabs(['recipes']);
        onSetLibraryTab('recipes');
      }
    } catch (e) { console.error(e); } finally { setIsSaving(false); }
  };

  const handleOCRItems = (scannedItems: any[], scannedMethod?: string, scannedTitle?: string) => {
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
    if (scannedTitle) {
      setRecipeName(scannedTitle);
    }
    setShowScanner(false);
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

  const calculateRecursiveUnitCost = (rid: string): number => {
    const rec = recipes.find(r => r.id === rid);
    if (!rec) return 0;
    const batchCost = rec.items.reduce((acc, item) => {
      // Robust ID check
      const itemId = item.id || (item as any).ingredientId || (item as any).recipeId;
      if (!itemId) return acc;

      if (item.type === 'ingredient') {
        const ing = ingredients.find(i => i.id === itemId);
        if (!ing) return acc;
        return acc + (getConvertedQuantity(item.quantity, item.unit, getIngredientPackUnit(ing)) * getIngredientCost(ing));
      } else {
        return acc + (item.quantity * calculateRecursiveUnitCost(itemId));
      }
    }, 0);
    return rec.batchSize > 0 ? batchCost / rec.batchSize : 0;
  };

  // Costing
  const totalCostBase = gridItems.reduce((acc, item) => {
    const itemId = item.id || (item as any).ingredientId || (item as any).recipeId;
    if (!itemId) return acc;

    if (item.type === 'ingredient') {
      const ing = ingredients.find(i => i.id === itemId);
      if (!ing) return acc;
      return acc + (getConvertedQuantity(item.quantity, item.unit, getIngredientPackUnit(ing)) * getIngredientCost(ing));
    }
    return acc + (item.quantity * calculateRecursiveUnitCost(itemId));
  }, 0);
  
  const unitCost = batchSize > 0 ? totalCostBase / batchSize : 0;
  const totalCostDisplay = totalCostBase * scaleFactor;

  // Derive display flags
  const isViewMode = !isEditing && !isManualNew && !!stagedItemId && stagedItemType === 'recipe';
  const isSessionActive = isEditing; // Logic mapping for UI dimming

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
              {isEditing ? 'Recipe Details // EDIT' : isRecursive ? 'Sub-Recipe Workspace' : 'Recipe Details'}
            </span>
            <input 
              value={recipeName} readOnly={!isSessionActive} onChange={(e) => setRecipeName(e.target.value)} 
              className={`bg-transparent border-b border-[#333333] focus:border-[#c8a96e] text-lg font-sans font-bold px-1 outline-none w-full max-w-sm ${!isSessionActive ? 'opacity-50' : ''}`} 
              placeholder="Recipe Name" 
            />
          </div>
          <div className={`flex items-center gap-6 border-l border-[#333333] pl-4 ${!isSessionActive ? 'opacity-30' : ''}`}>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase text-[#888888]">Batch Size</label>
              <div className="flex items-center gap-2">
                <input type="number" disabled={!isSessionActive} value={batchSize} onChange={(e) => setBatchSize(parseFloat(e.target.value) || 0)} className="bg-transparent border-b border-[#333333] font-mono font-bold w-16 outline-none" />
                <select disabled={!isSessionActive} value={batchUnit} onChange={(e) => setBatchUnit(e.target.value as Unit)} className="bg-transparent text-xs font-mono font-bold uppercase outline-none text-[#c8a96e]">
                  <option value="kg">kg</option><option value="l">l</option><option value="ea">ea</option><option value="g">g</option><option value="ml">ml</option>
                </select>
              </div>
            </div>
            <div className="flex flex-col">
              <label className="text-[10px] font-bold uppercase text-[#888888]">Scale Factor</label>
              <div className="flex items-center gap-2">
                 <span className="text-[#666] text-xs font-mono">x</span>
                 <input 
                   type="number" 
                   disabled={!isSessionActive} 
                   value={scaleFactor} 
                   onChange={(e) => setScaleFactor(Math.max(0.1, parseFloat(e.target.value) || 1))} 
                   step="0.1"
                   className="bg-transparent border-b border-[#333333] font-mono font-bold w-12 outline-none text-[#c8a96e]" 
                 />
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {/* EDIT MODE ACTIONS */}
          {isEditing ? (
            <>
              <button onClick={() => setShowScanner(true)} className={`${UI_STYLES.button} border border-[#c8a96e] text-[#c8a96e] hover:bg-[#c8a96e] hover:text-black`}>OCR Scan</button>
              <button onClick={handleDiscard} className={`${UI_STYLES.button} border border-[#333333] text-[#888888] hover:text-white`}>Discard</button>
              <button disabled={gridItems.length === 0 || isSaving} onClick={handleSave} className={`${UI_STYLES.button} bg-[#c8a96e] text-black hover:bg-[#b8985e] disabled:opacity-30`}>
                {isSaving ? 'COMMITTING...' : 'Save Changes'}
              </button>
            </>
          ) : (
            /* VIEW MODE ACTIONS */
            <>
              <button onClick={handleStartNew} className={`${UI_STYLES.button} border border-[#333333] text-[#e0e0e0] hover:bg-[#c8a96e] hover:text-black`}>New Recipe</button>
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

      <div className="p-4 border-b border-[#333333] min-h-[120px] bg-[#0d0d0d] flex-shrink-0">
        {stagedObject && isEditing ? (
          <StagingBox item={stagedObject} onAdd={addToGrid} onCancel={clearStaged} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center border border-dashed border-[#333333] text-[10px] uppercase font-bold text-[#444] tracking-[0.3em] p-4 text-center">
            {isSessionActive ? 'Search library to add components or use OCR' : 'Select a recipe to view details'}
          </div>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto p-4 transition-opacity ${!isSessionActive ? 'opacity-80 pointer-events-none' : ''}`}>
        <div className="border border-[#333333] divide-y divide-[#333333] bg-[#0d0d0d]">
          {gridItems.length === 0 ? (
            <div className="p-16 text-center text-[#444] font-mono text-xs uppercase tracking-[0.2em] opacity-40">NO_INGREDIENTS_ADDED</div>
          ) : (
            gridItems.map((item, idx) => {
              // Robust ID resolution (handles legacy data)
              const rawId = item.id || (item as any).ingredientId || (item as any).recipeId;
              const component = item.type === 'ingredient' 
                ? ingredients.find(i => i.id === rawId) 
                : recipes.find(r => r.id === rawId);
                
              let cost = 0;
              if (item.type === 'ingredient') {
                 const ing = component as Ingredient;
                 if(ing) {
                   cost = getConvertedQuantity(item.quantity, item.unit, getIngredientPackUnit(ing)) * getIngredientCost(ing);
                 }
              } else if (rawId) {
                 cost = item.quantity * calculateRecursiveUnitCost(rawId);
              }
              
              // Apply scaling to display cost
              cost = cost * scaleFactor;

              const isMissing = !component && !!rawId;
              const displayName = component?.name || (rawId ? `UNKNOWN_ID [${rawId.slice(0,6)}]` : 'INVALID_DATA');

              return (
                <div key={idx} className="flex items-center p-3 group hover:bg-[#1c1c1c] transition-colors">
                  <div className="w-8 text-[10px] font-mono text-[#444]">{idx + 1}</div>
                  <div className="flex-1">
                    <div className={`text-xs font-bold uppercase ${isMissing ? 'text-red-500' : 'text-white'}`}>
                      {displayName}
                      {isMissing && <span className="ml-2 text-[8px] bg-red-900/30 text-red-500 px-1 border border-red-900">DELETED</span>}
                    </div>
                    <div className="text-[8px] font-mono text-[#666] uppercase">{item.type} // {rawId?.slice(0, 8)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input 
                      type="number" 
                      value={item.quantity * scaleFactor} 
                      onChange={(e) => updateGridItem(idx, { quantity: (parseFloat(e.target.value) || 0) / scaleFactor })} 
                      className={`bg-transparent text-right font-mono text-xs border-b border-[#333] w-16 outline-none ${scaleFactor !== 1 ? 'text-yellow-500' : 'text-[#c8a96e]'}`} 
                    />
                    <select value={item.unit} onChange={(e) => updateGridItem(idx, { unit: e.target.value as Unit })} className="bg-transparent text-[10px] font-mono text-[#888] outline-none">
                      <option value="g">g</option><option value="ml">ml</option><option value="kg">kg</option><option value="l">l</option><option value="ea">ea</option>
                    </select>
                  </div>
                  <div className="w-24 text-right px-4 border-l border-[#333] ml-4 text-xs font-mono text-[#c8a96e]">£{cost.toFixed(4)}</div>
                  <div className="flex gap-1 ml-2">
                    {onPushRecipe && item.type === 'recipe' && component && (
                      <button onClick={() => onPushRecipe(component.name)} className="p-2 text-[#4a5568] hover:text-white transition-colors">
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
           <label className={UI_STYLES.label}>Method</label>
           <textarea value={instructions} onChange={e => setInstructions(e.target.value)} className={`w-full h-48 ${UI_STYLES.input} resize-none`} placeholder="Operating procedure..." />
        </div>
      </div>

      <div className={`p-6 border-t border-[#333333] bg-[#1c1c1c] flex justify-between items-center flex-shrink-0 ${!isSessionActive ? 'opacity-100' : ''}`}>
        <div className="flex gap-16">
          <div><label className={UI_STYLES.label}>Aggregate Batch Cost</label><div className="text-3xl font-mono text-white">£{totalCostDisplay.toFixed(2)}</div></div>
          <div><label className={UI_STYLES.label}>Unit Production Cost</label><div className="text-3xl font-mono text-[#c8a96e]">£{unitCost.toFixed(4)}</div></div>
        </div>
        <div className="text-right">
          <label className={UI_STYLES.label}>Integrity Status</label>
          <div className={`text-[10px] font-mono uppercase ${isEditing && gridItems.length > 0 ? 'text-yellow-500 animate-pulse' : 'text-[#444]'}`}>{isEditing ? 'Uncommitted' : 'Synchronized'}</div>
        </div>
      </div>
    </div>
  );
};

export default RecipeBuilder;
