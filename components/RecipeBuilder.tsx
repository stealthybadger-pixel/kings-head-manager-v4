
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Ingredient, Recipe, RecipeItem, Unit } from '../types';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES, COLORS } from '../constants';
import { OCRScanner } from './OCRScanner';
import { SourceTag } from './SourceTag';

const getConvertedQuantity = (quantity: number, fromUnit: Unit, toUnit: Unit): number => {
  if (fromUnit === toUnit) return quantity;
  if (fromUnit === 'kg' && toUnit === 'g') return quantity * 1000;
  if (fromUnit === 'g' && toUnit === 'kg') return quantity / 1000;
  if (fromUnit === 'l' && toUnit === 'ml') return quantity * 1000;
  if (fromUnit === 'ml' && toUnit === 'l') return quantity / 1000;
  return quantity; 
};

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
  placeholderClassName?: string;
}> = ({ value, type, options, onSelect, onCreate, isEditing, placeholder, placeholderClassName }) => {
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
       <div className={`text-xs font-bold uppercase ${placeholderClassName || (!selectedItem && value ? 'text-red-500' : 'text-white')}`}>
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
          ${isOpen ? 'border border-[#c8a96e] bg-[#111111] text-[#c8a96e]' : 'border border-transparent hover:text-[#c8a96e]'}
          ${placeholderClassName || 'text-[#e0e0e0] placeholder:text-[#444]'}
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

// ... (Rest of component Props and implementation same as before until grid loop) ...

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
  onInspect?: (id: string, type: 'ingredient' | 'recipe') => void;
  inspectedItem?: {id: string, type: 'ingredient' | 'recipe'} | null;
}

const RecipeBuilder: React.FC<RecipeBuilderProps> = ({ 
  stagedItemId, stagedItemType, clearStaged, onSetLibraryTab, onSetAvailableTabs,
  onPushIngredient, onPushRecipe, isRecursive = false, initialName = '', onComplete, onInspect, inspectedItem
}) => {
  const { ingredients, recipes, saveRecipe, updateRecipe, deleteRecipe } = useKitchenData();
  const { confirm } = useConfirmation();

  // Refs for auto-focus and scrolling
  const quantityRefs = useRef<(HTMLInputElement | null)[]>([]);
  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const [focusTarget, setFocusTarget] = useState<number | null>(null);

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

  // Direct Injection Logic
  useEffect(() => {
    if (isEditing && stagedItemId && stagedObject) {
       let defaultUnit: Unit = 'g';
       if ('packUnit' in stagedObject) {
          defaultUnit = stagedObject.packUnit;
       } else if ('batchUnit' in stagedObject) {
          defaultUnit = (stagedObject as Recipe).batchUnit || 'ea';
       }

       const newItem: RecipeItem = {
         type: stagedItemType,
         id: stagedItemId,
         quantity: 0,
         unit: defaultUnit
       };

       setGridItems(prev => {
         const next = [...prev, newItem];
         setFocusTarget(next.length - 1);
         return next;
       });
       
       clearStaged();
    }
  }, [stagedItemId, isEditing, stagedObject, stagedItemType, clearStaged]);

  // Handle Focus & Scroll after injection
  useEffect(() => {
    if (focusTarget !== null && quantityRefs.current[focusTarget]) {
       quantityRefs.current[focusTarget]?.focus();
       scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
       setFocusTarget(null);
    }
  }, [gridItems, focusTarget]);

  // Build Search Options for Inline Swap
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
    // Pivot to Ingredients
    onSetAvailableTabs(['ingredients']);
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
    // Pivot to Ingredients
    onSetAvailableTabs(['ingredients']);
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
    const ok = await confirm("DISCARD CHANGES? All progress on the pass will be lost.");
    if (ok) {
      setIsEditing(false);
      setIsManualNew(false);
      setScaleFactor(1);
      // Effect will re-populate original data if stagedObject exists
      if (!stagedItemId) {
         setRecipeName('New Recipe');
         setGridItems([]);
      }
      
      // Pivot Back to Recipes
      if (!isRecursive) {
        onSetAvailableTabs(['recipes']);
        onSetLibraryTab('recipes');
      }
    }
  };

  const updateGridItem = (idx: number, updates: Partial<RecipeItem>) => {
    setGridItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  };

  const swapGridItem = (idx: number, option: SearchOption) => {
    setGridItems(prev => prev.map((item, i) => 
      i === idx ? { ...item, id: option.id, type: option.type, unit: option.unit } : item
    ));
  };

  const handleSave = async () => {
    setIsSaving(true);
    
    // Normalize items to ensure 'id' is set correctly and legacy keys are removed
    const normalizedItems = gridItems.map(item => ({
      type: item.type,
      id: item.id || (item as any).ingredientId || (item as any).recipeId, // Recovery for legacy/OCR props
      quantity: item.quantity,
      unit: item.unit,
      notes: item.notes // Preserve notes
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
      
      // Pivot Back to Recipes
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
    <div className="flex flex-col h-full bg-[#111111] overflow-hidden p-2 relative">
      {/* THE STAGING ENVELOPE */}
      <div className={`flex flex-col h-full bg-[#111111] overflow-hidden transition-all duration-0 ${isSessionActive ? 'border-2 border-[#005f73]' : 'border border-[#333333]'}`}>
        
        {showScanner && (
          <OCRScanner 
            onAddItems={handleOCRItems} 
            onCancel={() => setShowScanner(false)} 
            onIngredientCreateRequest={(name) => onPushIngredient?.(name)}
            onInspect={onInspect}
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
                className={`bg-transparent border-b border-[#333333] focus:border-[#c8a96e] text-lg font-sans font-bold px-1 outline-none w-full max-w-sm text-[#c8a96e] ${!isSessionActive ? 'opacity-50' : ''}`} 
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
                {/* OCR GATED: Only show for manual new recipes */}
                {isManualNew && (
                  <button onClick={() => setShowScanner(true)} className={`${UI_STYLES.button} border border-[#c8a96e] text-[#c8a96e] hover:bg-[#c8a96e] hover:text-black`}>OCR Scan</button>
                )}
                <button onClick={handleDiscard} className={`${UI_STYLES.button} border border-[#333333] text-[#888888] hover:text-white`}>Discard</button>
                <button disabled={gridItems.length === 0 || isSaving} onClick={handleSave} className={`${UI_STYLES.button} bg-[#005f73] text-white hover:bg-[#004a5d] disabled:opacity-30 border border-transparent`}>
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

        <div className={`flex-1 overflow-y-auto p-4 transition-opacity ${!isSessionActive ? 'opacity-80 pointer-events-none' : ''}`}>
          {/* ONLY RENDER GRID IF ITEMS EXIST */}
          {gridItems.length > 0 && (
            <>
              <div className="border border-[#333333] divide-y divide-[#333333] bg-[#0d0d0d]">
                {gridItems.map((item, idx) => {
                  // Robust ID resolution (handles legacy data)
                  const rawId = item.id || (item as any).ingredientId || (item as any).recipeId || '';
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
                  const isInspecting = inspectedItem?.id === rawId;

                  // MISSING DATA LOGIC
                  // If no ID is present, we check if there's a note indicating an unresolved item
                  const isUnresolved = !rawId && item.notes?.startsWith('UNRESOLVED:');
                  let unresolvedName = '';
                  if (isUnresolved) {
                     // Parse "UNRESOLVED: Tomato | Diced" -> "Tomato"
                     const parts = item.notes?.split('|') || [];
                     unresolvedName = parts[0].replace('UNRESOLVED:', '').trim();
                  }

                  const displayPlaceholder = component?.name || (isUnresolved ? `[MISSING DATA: ${unresolvedName}]` : "SELECT_ITEM");
                  // Requested: #333333 text. Used literally, though it's low contrast on black. 
                  const placeholderClass = isUnresolved ? 'text-[#333333]' : '';
                  
                  return (
                    <div key={idx} className="flex items-center p-3 group hover:bg-[#1c1c1c] transition-colors relative z-0">
                      <div className="w-8 text-[10px] font-mono text-[#444]">{idx + 1}</div>
                      <div className="flex-1 pr-4 flex items-center gap-4">
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
                            onSelect={(opt) => swapGridItem(idx, opt)}
                            onCreate={(name) => onPushIngredient && onPushIngredient(name)}
                            isEditing={isEditing}
                            placeholder={displayPlaceholder}
                            placeholderClassName={placeholderClass}
                          />
                          <div className="flex items-center gap-2">
                             <div className="text-[8px] font-mono text-[#666] uppercase mt-1">{item.type}</div>
                             {item.notes && <div className="text-[8px] font-mono text-[#888] italic mt-1 border-l border-[#333] pl-2">{item.notes}</div>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          ref={el => (quantityRefs.current[idx] = el)}
                          type="number" 
                          value={item.quantity * scaleFactor} 
                          onChange={(e) => updateGridItem(idx, { quantity: (parseFloat(e.target.value) || 0) / scaleFactor })} 
                          className={`bg-transparent text-right font-mono text-xs w-16 outline-none ${scaleFactor !== 1 ? 'text-yellow-500' : 'text-[#c8a96e]'}`} 
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
                })}
              </div>
              <div ref={scrollBottomRef}></div>
              <div className="mt-8">
                 <label className={UI_STYLES.label}>Method</label>
                 <textarea 
                   value={instructions} 
                   onChange={e => setInstructions(e.target.value)} 
                   className={`w-full h-48 bg-transparent outline-none resize-none font-sans text-sm text-[#e0e0e0] placeholder-[#444]`} 
                   placeholder="Operating procedure..." 
                 />
              </div>
            </>
          )}
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
    </div>
  );
};

export default RecipeBuilder;
