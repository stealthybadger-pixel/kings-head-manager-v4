import React, { useState, useEffect, useMemo } from 'react';
import { Ingredient, Recipe, RecipeItem, Unit } from '../types';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES, COLORS } from '../constants';
import StagingBox from './StagingBox';
import { OCRScanner } from './OCRScanner';

// Helper for unit conversion
const getConvertedQuantity = (quantity: number, fromUnit: Unit, toUnit: Unit): number => {
  if (fromUnit === toUnit) return quantity;
  
  // Mass
  if (fromUnit === 'kg' && toUnit === 'g') return quantity * 1000;
  if (fromUnit === 'g' && toUnit === 'kg') return quantity / 1000;
  
  // Volume
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
}

const RecipeBuilder: React.FC<RecipeBuilderProps> = ({ 
  stagedItemId, 
  stagedItemType, 
  clearStaged, 
  onSetLibraryTab,
  onSetAvailableTabs,
  isLibraryTabRecipes
}) => {
  const { ingredients, recipes, saveRecipe, updateRecipe, deleteRecipe } = useKitchenData();
  const { confirm } = useConfirmation();

  const [recipeName, setRecipeName] = useState('New Recipe');
  const [batchSize, setBatchSize] = useState<number>(1);
  const [batchUnit, setBatchUnit] = useState<Unit>('kg');
  const [gridItems, setGridItems] = useState<RecipeItem[]>([]);
  const [instructions, setInstructions] = useState('');
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [originalRecipe, setOriginalRecipe] = useState<Recipe | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [isManualNew, setIsManualNew] = useState(false);

  const stagedObject = stagedItemType === 'ingredient' 
    ? ingredients.find(i => i.id === stagedItemId) 
    : recipes.find(r => r.id === stagedItemId);

  // An "active session" is when we are either editing an existing recipe or have explicitly clicked 'New'
  const isSessionActive = !!activeRecipeId || isManualNew;

  // Track if changes have been made relative to the start of the session
  const isDirty = useMemo(() => {
    if (activeRecipeId) {
      if (!originalRecipe) return true;
      const itemsMatch = JSON.stringify(gridItems) === JSON.stringify(originalRecipe.items);
      return (
        recipeName !== originalRecipe.name ||
        batchSize !== originalRecipe.batchSize ||
        batchUnit !== originalRecipe.batchUnit ||
        instructions !== originalRecipe.instructions ||
        !itemsMatch
      );
    } else if (isManualNew) {
      return (
        recipeName !== 'New Recipe' ||
        gridItems.length > 0 ||
        instructions !== '' ||
        batchSize !== 1 ||
        batchUnit !== 'kg'
      );
    }
    return false;
  }, [activeRecipeId, originalRecipe, recipeName, batchSize, batchUnit, instructions, gridItems, isManualNew]);

  useEffect(() => {
    if (stagedItemId && stagedItemType === 'recipe') {
      const recipe = recipes.find(r => r.id === stagedItemId);
      if (recipe) {
        setRecipeName(recipe.name);
        setBatchSize(recipe.batchSize || 1);
        setBatchUnit(recipe.batchUnit || 'kg');
        setGridItems(recipe.items || []);
        setInstructions(recipe.instructions || '');
        setActiveRecipeId(recipe.id);
        setOriginalRecipe(recipe);
        setIsManualNew(false);
        clearStaged(); 
        
        onSetAvailableTabs(['ingredients']);
        onSetLibraryTab('ingredients');
      }
    }
  }, [stagedItemId, stagedItemType, recipes, clearStaged, onSetAvailableTabs, onSetLibraryTab]);

  const addToGrid = (item: RecipeItem) => {
    setGridItems(prev => [...prev, item]);
    clearStaged();
  };

  const removeFromGrid = async (index: number) => {
    setGridItems(prev => prev.filter((_, i) => i !== index));
  };

  const resetBuilder = () => {
    setRecipeName('New Recipe');
    setBatchSize(1);
    setBatchUnit('kg');
    setGridItems([]);
    setInstructions('');
    setActiveRecipeId(null);
    setOriginalRecipe(null);
    setIsManualNew(false);
    clearStaged();
    onSetAvailableTabs(['ingredients']);
    onSetLibraryTab('ingredients');
  };

  const handleSave = async () => {
    if (!isDirty && activeRecipeId) {
      resetBuilder();
      return;
    }

    setIsSaving(true);
    const recipeData: Partial<Recipe> = {
      name: recipeName,
      batchSize: batchSize,
      batchUnit: batchUnit,
      items: gridItems,
      instructions: instructions,
      sourceType: 'manual'
    };

    try {
      if (activeRecipeId) {
        await updateRecipe(activeRecipeId, recipeData);
      } else {
        await saveRecipe(recipeData);
      }
      resetBuilder();
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = async () => {
    // Only confirm if changes actually exist
    if (isDirty) {
      const ok = await confirm("You have unsaved changes. Discard and return to home?");
      if (!ok) return;
    }
    resetBuilder();
  };

  const handleNew = () => {
    // Immediately enter New mode session
    setIsManualNew(true);
    onSetAvailableTabs(['ingredients']);
    onSetLibraryTab('ingredients');
  };

  const handleEditMode = () => {
    // Show recipe list to choose what to edit
    onSetAvailableTabs(['recipes']);
    onSetLibraryTab('recipes'); 
  };

  const handleOCRSuccess = (scannedRecipe: { name: string, items: RecipeItem[], instructions: string }) => {
    setRecipeName(scannedRecipe.name);
    setBatchSize(1);
    setBatchUnit('kg');
    setGridItems(scannedRecipe.items);
    setInstructions(scannedRecipe.instructions);
    setIsScanning(false);
    setIsManualNew(true); // Treat OCR result as a new unsaved session
    onSetAvailableTabs(['ingredients']);
    onSetLibraryTab('ingredients');
  };

  const calculateTotalCost = () => {
    return gridItems.reduce((acc, item) => {
      const ing = ingredients.find(i => i.id === item.ingredientId);
      if (!ing) return acc;
      const qtyInPackUnit = getConvertedQuantity(item.quantity, item.unit, ing.packUnit);
      const cpu = ing.packCost / ing.packSize;
      return acc + (qtyInPackUnit * cpu);
    }, 0);
  };

  const totalCost = calculateTotalCost();
  const unitCost = batchSize > 0 ? totalCost / batchSize : 0;

  // Selection states
  const isCurrentlySelectingToEdit = isLibraryTabRecipes && !activeRecipeId;

  return (
    <div className="flex flex-col h-full bg-[#111111]">
      <div className="p-4 border-b border-[#333333] bg-[#1c1c1c] flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4 items-center flex-1 min-w-[300px]">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">
              {activeRecipeId ? 'Recipe Development // EDITING' : 'Recipe Development // NEW'}
            </span>
            <input 
              value={recipeName}
              readOnly={!isSessionActive}
              onChange={(e) => setRecipeName(e.target.value)}
              className={`bg-transparent border-b border-[#333333] focus:border-[#c8a96e] text-lg font-sans font-bold px-1 outline-none w-full max-md:max-w-md ${!isSessionActive ? 'opacity-50 cursor-default' : ''}`}
              placeholder="Recipe Name"
            />
          </div>

          <div className="flex items-center gap-3 border-l border-[#333333] pl-4">
            <div className={`flex flex-col ${!isSessionActive ? 'opacity-30' : ''}`}>
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Batch Size</label>
              <div className="flex items-center gap-2">
                <input 
                  type="number"
                  disabled={!isSessionActive}
                  value={batchSize}
                  onChange={(e) => setBatchSize(parseFloat(e.target.value) || 0)}
                  className="bg-transparent border-b border-[#333333] focus:border-[#c8a96e] text-lg font-mono font-bold w-20 outline-none"
                />
                <select 
                  disabled={!isSessionActive}
                  value={batchUnit}
                  onChange={(e) => setBatchUnit(e.target.value as Unit)}
                  className="bg-transparent border-b border-[#333333] text-xs font-mono font-bold uppercase py-1 outline-none text-[#c8a96e]"
                >
                  <option value="kg">kg</option>
                  <option value="l">l</option>
                  <option value="ea">ea</option>
                  <option value="g">g</option>
                  <option value="ml">ml</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {isSessionActive ? (
            <>
              <button 
                disabled={gridItems.length === 0 || isSaving}
                onClick={handleSave}
                className={`${UI_STYLES.button} border border-[#c8a96e] text-[#c8a96e] hover:bg-[#c8a96e] hover:text-black disabled:opacity-30`}
              >
                {isSaving ? 'Saving...' : 'Save Recipe'}
              </button>
              <button 
                onClick={handleClose}
                className={`${UI_STYLES.button} border border-[#444444] text-[#888888] hover:bg-[#333333] hover:text-white`}
              >
                {isDirty ? 'Discard' : 'Close'}
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={handleNew}
                className={`${UI_STYLES.button} border border-[#333333] text-[#888888] hover:bg-[#c8a96e] hover:text-black hover:border-[#c8a96e] transition-all`}
              >
                New
              </button>
              <button 
                onClick={handleEditMode}
                className={`${UI_STYLES.button} border ${isCurrentlySelectingToEdit ? 'border-[#4a5568] text-white bg-[#4a5568]/30 shadow-[0_0_15px_rgba(74,85,104,0.2)]' : 'border-[#4a5568] text-[#4a5568] hover:bg-[#4a5568] hover:text-white'}`}
              >
                Edit
              </button>
            </>
          )}
        </div>
      </div>

      <div className="p-4 border-b border-[#333333] min-h-[140px]">
        {stagedObject && stagedItemType === 'ingredient' ? (
          <StagingBox 
            item={stagedObject} 
            onAdd={addToGrid} 
            onCancel={clearStaged}
          />
        ) : (
          <div 
            onClick={() => isSessionActive ? setIsScanning(true) : handleNew()}
            className="h-full flex flex-col items-center justify-center border border-dashed border-[#333333] text-[10px] uppercase font-bold text-[#666666] tracking-widest cursor-pointer hover:bg-[#1c1c1c] transition-all group p-8 text-center"
          >
            {isSessionActive ? (
              <>
                <span>Select an ingredient from the library to begin assembly</span>
                <span className="mt-2 text-[#c8a96e] group-hover:underline opacity-80 group-hover:opacity-100">or click to scan recipe</span>
              </>
            ) : (
              <span className="text-[#888888] group-hover:text-[#c8a96e]">Click 'New' or 'Edit' to start building a recipe</span>
            )}
          </div>
        )}
      </div>

      <div className={`flex-1 overflow-y-auto p-4 transition-opacity ${!isSessionActive ? 'opacity-20 pointer-events-none' : ''}`}>
        <label className={UI_STYLES.label}>Recipe Ingredients</label>
        <div className="border border-[#333333] divide-y divide-[#333333]">
          {gridItems.length === 0 ? (
            <div className="p-12 text-center text-[#666666] font-mono text-xs uppercase tracking-tighter opacity-50">Empty Assembly Workspace</div>
          ) : (
            gridItems.map((item, idx) => {
              const ing = ingredients.find(i => i.id === item.ingredientId);
              let cost = 0;
              if (ing) {
                  const qtyInPackUnit = getConvertedQuantity(item.quantity, item.unit, ing.packUnit);
                  cost = qtyInPackUnit * (ing.packCost / ing.packSize);
              }

              return (
                <div key={idx} className="flex items-center p-3 group hover:bg-[#1c1c1c] transition-colors">
                  <div className="w-12 text-xs font-mono text-[#666666]">{idx + 1}</div>
                  <div className="flex-1">
                    <div className="text-sm font-bold uppercase">{ing?.name || 'Unknown'}</div>
                    <div className="text-[10px] text-[#888888] font-mono uppercase">{ing?.category}</div>
                  </div>
                  <div className="w-32 text-right px-4">
                    <span className="text-sm font-mono">{item.quantity}</span>
                    <span className="text-xs ml-1 text-[#888888] font-mono uppercase">{item.unit}</span>
                  </div>
                  <div className="w-32 text-right px-4">
                    <span className="text-sm font-mono text-[#c8a96e]">£{cost.toFixed(2)}</span>
                  </div>
                  <button 
                    onClick={() => removeFromGrid(idx)}
                    className="ml-4 p-2 text-[#444444] hover:text-[#ff4d4d] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="mt-8">
          <label className={UI_STYLES.label}>Method / Instructions</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            className={`w-full h-48 ${UI_STYLES.input} font-sans resize-none`}
            placeholder="Type preparation method here..."
          />
        </div>
      </div>

      <div className={`p-4 border-t border-[#333333] bg-[#1c1c1c] flex justify-between items-center transition-opacity ${!isSessionActive ? 'opacity-40' : ''}`}>
        <div className="flex gap-12">
          <div>
            <span className={UI_STYLES.label}>Total Batch Cost</span>
            <span className="text-2xl font-mono text-white">£{totalCost.toFixed(2)}</span>
          </div>
          <div>
            <span className={UI_STYLES.label}>Cost per {batchUnit}</span>
            <span className="text-2xl font-mono text-[#c8a96e]">£{unitCost.toFixed(2)}</span>
          </div>
          <div>
            <span className={UI_STYLES.label}>Items</span>
            <span className="text-2xl font-mono">{gridItems.length}</span>
          </div>
        </div>
        <div className="text-right flex flex-col items-end">
          <span className={UI_STYLES.label}>Session Status</span>
          <span className={`text-[10px] font-mono uppercase ${isDirty ? 'text-yellow-500 animate-pulse' : 'text-[#444444]'}`}>
            {isDirty ? 'Unsaved Changes' : isSessionActive ? 'No changes' : 'Inactive'}
          </span>
        </div>
      </div>

      {isScanning && (
        <OCRScanner 
          onSuccess={handleOCRSuccess} 
          onCancel={() => setIsScanning(false)} 
        />
      )}
    </div>
  );
};

export default RecipeBuilder;