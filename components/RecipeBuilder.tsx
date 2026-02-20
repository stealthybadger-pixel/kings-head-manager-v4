
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Ingredient, Recipe, RecipeItem, Unit, Allergen } from '../types';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES, COLORS } from '../constants';
import { OCRScanner } from './OCRScanner';
import { SourceTag } from './SourceTag';
import { AllergenMatrix } from './AllergenMatrix';
import { getConvertedQuantity, calculateBatchTotal, toGrams } from '../utils/units';

interface SearchOption {
  id: string;
  name: string;
  type: 'ingredient';
  sub: string;
  unit: Unit;
}

const GridItemSelect: React.FC<{
  value: string;
  type: 'ingredient';
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
      if (search !== selectedItem.name) {
        setSearch(selectedItem.name);
      }
    } else if (!selectedItem && !isOpen && value) {
       if (search !== 'UNKNOWN ITEM') {
         setSearch('UNKNOWN ITEM');
       }
    } else if (!value && !isOpen) {
       if (search !== '') {
         setSearch('');
       }
    }
  }, [selectedItem, isOpen, value, search]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        if (selectedItem) {
            if (search !== selectedItem.name) setSearch(selectedItem.name);
        } else {
            if (search !== '') setSearch('');
        }
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [selectedItem, search]);

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

interface RecipeBuilderProps {
  stagedItemId: string | null;
  stagedItemType: 'ingredient' | 'recipe';
  clearStaged: () => void;
  onSetLibraryTab: (tab: 'ingredients' | 'recipes') => void;
  onSetAvailableTabs: (tabs: ('ingredients' | 'recipes')[]) => void;
  isLibraryTabRecipes: boolean;
  onPushIngredient?: (name?: string) => void;
  onPushRecipe?: (name?: string) => void;
  onInspect?: (id: string, type: 'ingredient' | 'recipe') => void;
  inspectedItem?: {id: string, type: 'ingredient' | 'recipe'} | null;
  forceNew?: boolean;
  onForceNewHandled?: () => void;
  startInScaleMode?: boolean;
  onScaleModeConsumed?: () => void;
  isRecursive?: boolean;
  initialName?: string;
  onComplete?: (id: string) => void;
}

const RecipeBuilder: React.FC<RecipeBuilderProps> = ({
  stagedItemId, stagedItemType, clearStaged, onSetLibraryTab, onSetAvailableTabs,
  onPushIngredient, onInspect, inspectedItem, forceNew, onForceNewHandled,
  startInScaleMode, onScaleModeConsumed,
}) => {
  const { ingredients, recipes, saveRecipe, updateRecipe, deleteRecipe } = useKitchenData();
  const { confirm } = useConfirmation();

  // Refs for auto-focus and scrolling
  const quantityRefs = useRef<(HTMLInputElement | null)[]>([]);
  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const [focusTarget, setFocusTarget] = useState<number | null>(null);
  
  // NUCLEAR OPTION: Injection Ref Lock
  const injectionLock = useRef(false);

  // Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [isManualNew, setIsManualNew] = useState(false);

  // Form State
  const [recipeName, setRecipeName] = useState('');
  const [batchSize, setBatchSize] = useState<number>(1);
  const [batchUnit, setBatchUnit] = useState<Unit>('kg');
  const [gridItems, setGridItems] = useState<RecipeItem[]>([]);
  const [instructions, setInstructions] = useState('');
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null); // For updates
  const [isSaving, setIsSaving] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  
  // Confirmation states for destructive actions
  const [confirmAction, setConfirmAction] = useState<'delete' | 'discard' | null>(null);

  // Scale mode — non-destructive: pick a limiting ingredient, enter available qty, all others scale
  const [scaleActive, setScaleActive] = useState(false);
  const [scaleItemIdx, setScaleItemIdx] = useState<number | null>(null);
  const [scaleAvailable, setScaleAvailable] = useState('');

  const stagedObject = stagedItemType === 'ingredient' 
    ? ingredients.find(i => i.id === stagedItemId) 
    : recipes.find(r => r.id === stagedItemId);

  // Direct Injection Logic - NUCLEAR OPTION: Ref Lock + History Clear
  // CONSTRAINT: Only allow ingredients, never recipes
  useEffect(() => {
    // Safety reset: If no staged item, unlock for next interaction
    if (!stagedItemId) {
      injectionLock.current = false;
      return;
    }

    if (isEditing && stagedItemId && stagedObject && stagedItemType === 'ingredient') {
      // BLOCKING GUARD: If lock is active, abort immediately
      if (injectionLock.current) return;

      // ENGAGE LOCK
      injectionLock.current = true;

      setGridItems(prev => {
        // DUPLICATION GUARD: Check if item already exists
        const alreadyExists = prev.some(item => item.id === stagedItemId);
        if (alreadyExists) return prev;

        // Determine default unit from ingredient supplier
        let defaultUnit: Unit = 'ea';
        if ('packUnit' in stagedObject) {
           defaultUnit = (stagedObject as Ingredient).suppliers[0]?.packUnit || 'ea';
        }

        const newItem: RecipeItem = {
          type: 'ingredient',
          id: stagedItemId,
          quantity: 0,
          unit: defaultUnit
        };

        const next = [...prev, newItem];
        setFocusTarget(next.length - 1);
        return next;
      });

      // CRITICAL: Prevent "Refresh Zombies" by clearing history state
      window.history.replaceState({}, document.title);

      // Clear app level staged state
      clearStaged();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagedItemId, isEditing, stagedItemType, activeRecipeId]); // stagedObject intentionally omitted to avoid reference thrashing

  const handleDelete = async () => {
    if (confirmAction !== 'delete') {
      setConfirmAction('delete');
      return;
    }
    if (!activeRecipeId) return;
    try {
      await deleteRecipe(activeRecipeId);
      clearStaged();
      setConfirmAction(null);
    } catch (e) {
      console.error("Delete failed:", e);
      setConfirmAction(null);
    }
  };

  const handleDiscard = async () => {
    if (confirmAction !== 'discard') {
      setConfirmAction('discard');
      return;
    }
    setIsEditing(false);
    setIsManualNew(false);
    clearStaged();
    // Effect will re-populate original data if stagedObject exists
    if (!stagedItemId) {
       setRecipeName('');
       setGridItems([]);
    }
    
    // Pivot Back to Recipes
    onSetAvailableTabs(['ingredients', 'recipes']);
    onSetLibraryTab('recipes');
    setConfirmAction(null);
  };

  // Handle Focus & Scroll after injection
  useEffect(() => {
    if (focusTarget !== null && quantityRefs.current[focusTarget]) {
       quantityRefs.current[focusTarget]?.focus();
       scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
       setFocusTarget(null);
    }
  }, [gridItems, focusTarget]);

  // Build Search Options for Inline Swap - INGREDIENTS ONLY
  const searchOptions: SearchOption[] = useMemo(() => {
    const i = ingredients.map(ing => ({ 
      id: ing.id, 
      name: ing.name, 
      type: 'ingredient' as const, 
      sub: ing.category,
      unit: ing.suppliers.find(s=>s.isPreferred)?.packUnit || 'g' as Unit
    }));
    return i.sort((a, b) => a.name.localeCompare(b.name));
  }, [ingredients]);

  // Aggregate allergens from all ingredient rows
  const aggregatedAllergens = useMemo(() => {
    const allergenSet = new Set<Allergen>();
    gridItems.forEach(item => {
      const rawId = item.id || (item as any).ingredientId || '';
      if (!rawId) return;
      ingredients.find(i => i.id === rawId)?.allergens?.forEach(a => allergenSet.add(a));
    });
    return Array.from(allergenSet).sort();
  }, [gridItems, ingredients]);

  // Total kcal for the batch + kcal per 100g of output
  const recipeKcal = useMemo(() => {
    const totalKcal = gridItems.reduce((acc, item) => {
      const rawId = item.id || (item as any).ingredientId || '';
      if (!rawId) return acc;
      const ing = ingredients.find(i => i.id === rawId);
      if (!ing) return acc;
      return acc + toGrams(item.quantity, item.unit) * ((ing.kcalPer100 || 0) / 100);
    }, 0);
    const batchG = toGrams(batchSize, batchUnit);
    const kcalPer100 = batchG > 0 ? (totalKcal / batchG) * 100 : 0;
    return { totalKcal, kcalPer100 };
  }, [gridItems, ingredients, batchSize, batchUnit]);

  // VIEW MODE SYNC: Populate fields when a recipe is selected.
  // If startInScaleMode is true (right-click), stay in view mode and activate scale.
  // Otherwise auto-enter edit mode (normal click).
  useEffect(() => {
    if (stagedItemType === 'recipe' && stagedObject && !isEditing && !isManualNew) {
      const r = stagedObject as Recipe;
      // Stability Check: Only update if ID has changed to prevent render loops on object ref changes
      if (activeRecipeId !== r.id) {
        setRecipeName(r.name);
        setBatchSize(r.batchSize || 1);
        setBatchUnit(r.batchUnit || 'kg');
        setGridItems(r.items || []);
        setInstructions(r.instructions || '');
        setActiveRecipeId(r.id);
        if (startInScaleMode) {
          // Scale mode: stay in view mode, activate scale overlay
          setScaleActive(true); setScaleItemIdx(null); setScaleAvailable('');
          onScaleModeConsumed?.();
          onSetAvailableTabs(['ingredients', 'recipes']);
          onSetLibraryTab('recipes');
        } else {
          // Normal click: enter edit mode
          setScaleActive(false); setScaleItemIdx(null); setScaleAvailable('');
          setIsEditing(true);
          onSetAvailableTabs(['ingredients']);
          onSetLibraryTab('ingredients');
        }
      }
    } else if (!stagedItemId && !isEditing && !isManualNew) {
      // Reset if nothing selected and not editing
      if (activeRecipeId !== null) {
        setRecipeName('');
        setBatchSize(1);
        setGridItems([]);
        setInstructions('');
        setActiveRecipeId(null);
      }
      // Show only recipes on landing
      onSetAvailableTabs(['recipes']);
      onSetLibraryTab('recipes');
    }
  }, [stagedObject, stagedItemId, stagedItemType, isEditing, isManualNew, activeRecipeId, startInScaleMode]);

  // Auto-calculate batch size from item quantities (accounting for waste/yield)
  useEffect(() => {
    if (gridItems.length > 0) {
      // Build waste lookup from ingredient data
      const wasteMap = new Map<string, number>();
      gridItems.forEach(item => {
        if (item.type === 'ingredient' && item.id) {
          const ing = ingredients.find(i => i.id === item.id);
          if (ing && ing.wastePercent > 0) {
            wasteMap.set(item.id, ing.wastePercent);
          }
        }
      });
      const total = calculateBatchTotal(gridItems, batchUnit, wasteMap);
      if (total > 0 && Math.abs(total - batchSize) > 0.001) {
        setBatchSize(parseFloat(total.toFixed(4)));
      }
    }
  }, [gridItems, batchUnit, ingredients]);

  const enterEditMode = () => {
    clearStaged(); // Clear staged recipe ID so Direct Injection doesn't re-add it to itself
    setIsEditing(true);
    // Ingredients only - no recipe loops
    onSetAvailableTabs(['ingredients']);
    onSetLibraryTab('ingredients');
  };

  const handleStartNew = () => {
    clearStaged();
    setIsManualNew(true);
    setIsEditing(true);
    setRecipeName('');
    setBatchSize(1);
    setBatchUnit('kg');
    setGridItems([]);
    setInstructions('');
    setActiveRecipeId(null);
    // Ingredients only - no recipe loops
    onSetAvailableTabs(['ingredients']);
    onSetLibraryTab('ingredients');
  };

  // Trigger new recipe mode when sidebar "New Recipe" button is clicked
  useEffect(() => {
    if (forceNew && !isEditing && !isManualNew) {
      handleStartNew();
      onForceNewHandled?.();
    }
  }, [forceNew]);

  const handleSave = async () => {
    setIsSaving(true);
    
    // Normalize items to ensure 'id' is set correctly
    const normalizedItems = gridItems.map(item => ({
      type: item.type,
      id: item.id || (item as any).ingredientId,
      quantity: item.quantity,
      unit: item.unit,
      notes: item.notes
    }));

    const recipeData: Partial<Recipe> = {
      name: recipeName, 
      batchSize, 
      batchUnit, 
      items: normalizedItems, 
      instructions, 
      sourceType: 'manual',
      isDirty: false, 
      status: 'active'
    };
    try {
      if (activeRecipeId && !isManualNew) {
        await updateRecipe(activeRecipeId, recipeData);
      } else {
        const saved = await saveRecipe(recipeData);
        setActiveRecipeId(saved.id); // Switch to update mode for this session
      }
      setIsEditing(false);
      setIsManualNew(false);
      
      // Pivot Back to Recipes
      onSetAvailableTabs(['ingredients', 'recipes']);
      onSetLibraryTab('recipes');
    } catch (e) { 
      console.error(e); 
    } finally { 
      setIsSaving(false); 
    }
  };

  const updateGridItem = (idx: number, updates: Partial<RecipeItem>) => {
    setGridItems(prev => prev.map((item, i) => i === idx ? { ...item, ...updates } : item));
  };

  const removeGridItem = async (idx: number) => {
    const updatedItems = gridItems.filter((_, i) => i !== idx);
    setGridItems(updatedItems);
    
    // Persist immediately if in edit mode
    if (activeRecipeId && isEditing) {
       try {
         await updateRecipe(activeRecipeId, { items: updatedItems });
       } catch (e) {
         console.error("Failed to persist deletion:", e);
       }
    }
  };

  const swapGridItem = (idx: number, option: SearchOption) => {
    setGridItems(prev => prev.map((item, i) => 
      i === idx ? { ...item, id: option.id, type: option.type, unit: option.unit } : item
    ));
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

  // Scale factor — ratio of available : original for the constrained ingredient
  const scaleFactor = (() => {
    if (!scaleActive || scaleItemIdx === null) return 1;
    const original = gridItems[scaleItemIdx]?.quantity;
    const available = parseFloat(scaleAvailable);
    if (!original || !available || isNaN(available)) return 1;
    return available / original;
  })();

  const exitScale = () => {
    setScaleActive(false);
    setScaleItemIdx(null);
    setScaleAvailable('');
  };

  // Derive display flags
  const isViewMode = !isEditing && !isManualNew && !!stagedItemId && stagedItemType === 'recipe';
  const isSessionActive = isEditing;

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
                {isEditing ? 'Recipe Details // EDIT' : 'Recipe Details'}
              </span>
              <input 
                value={recipeName} 
                readOnly={!isSessionActive} 
                onChange={(e) => setRecipeName(e.target.value)} 
                className={`bg-transparent border-b border-[#333333] focus:border-[#c8a96e] text-lg font-sans font-bold px-1 outline-none w-full max-w-sm text-[#c8a96e] ${!isSessionActive ? 'opacity-50' : ''}`} 
                placeholder="Recipe Name" 
              />
            </div>
            <div className={`flex items-center gap-4 border-l border-[#333333] pl-4`}>
              <div className="flex flex-col">
                <label className="text-[10px] font-bold uppercase text-[#888888]">Batch Size</label>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold w-16 text-[#c8a96e]">{batchSize > 0 ? batchSize.toFixed(batchSize < 10 ? 2 : 0) : '—'}</span>
                  <select disabled={!isSessionActive} value={batchUnit} onChange={(e) => setBatchUnit(e.target.value as Unit)} className="bg-transparent text-xs font-mono font-bold uppercase outline-none text-[#c8a96e]">
                    <option value="kg">kg</option><option value="l">l</option><option value="ea">ea</option><option value="g">g</option><option value="ml">ml</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            {/* EDIT MODE ACTIONS */}
            {isEditing ? (
              <>
                {isManualNew && (
                  <button onClick={() => setShowScanner(true)} className={`${UI_STYLES.button} border border-[#c8a96e] text-[#c8a96e] hover:bg-[#c8a96e] hover:text-black`}>OCR Scan</button>
                )}
                <button
                  onClick={handleDiscard}
                  className={`${UI_STYLES.button} ${confirmAction === 'discard' ? 'border border-yellow-600 text-yellow-400 bg-yellow-900/20' : 'border border-[#333333] text-[#888888] hover:text-white'}`}
                >
                  {confirmAction === 'discard' ? 'CONFIRM DISCARD?' : 'Discard'}
                </button>
                {confirmAction && (
                  <button 
                    onClick={() => setConfirmAction(null)} 
                    className={`${UI_STYLES.button} border border-[#333333] text-[#666] hover:text-[#e0e0e0]`}
                  >
                    Cancel
                  </button>
                )}
                <button disabled={recipeName.length === 0 || gridItems.length === 0 || isSaving || confirmAction !== null} onClick={handleSave} className={`${UI_STYLES.button} bg-[#005f73] text-white hover:bg-[#004a5d] disabled:opacity-30 border border-transparent`}>
                  {isSaving ? 'COMMITTING...' : 'Save Changes'}
                </button>
              </>
            ) : (
              /* VIEW MODE ACTIONS */
              <>
                {isViewMode && (
                  <>
                    {scaleActive ? (
                      <button onClick={exitScale} className={`${UI_STYLES.button} border border-amber-600 text-amber-400 bg-amber-900/20 hover:bg-amber-900/40`}>
                        Exit Scale
                      </button>
                    ) : (
                      <button onClick={() => { setScaleActive(true); setScaleItemIdx(null); setScaleAvailable(''); }} className={`${UI_STYLES.button} border border-[#444] text-[#888] hover:border-amber-600 hover:text-amber-400`}>
                        Scale
                      </button>
                    )}
                    <button
                      onClick={() => { setConfirmAction(null); setIsEditing(true); exitScale(); }}
                      className={`${UI_STYLES.button} border border-[#333333] text-[#e0e0e0] hover:bg-[#c8a96e] hover:text-black`}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={handleDelete} 
                      className={`${UI_STYLES.button} ${confirmAction === 'delete' ? 'border border-red-600 text-red-400 bg-red-900/20' : 'border border-[#333333] text-[#888] hover:bg-red-900 hover:text-red-500'}`}
                    >
                      {confirmAction === 'delete' ? 'CONFIRM DELETE?' : 'Delete'}
                    </button>
                    {confirmAction && (
                      <button 
                        onClick={() => setConfirmAction(null)} 
                        className={`${UI_STYLES.button} border border-[#333333] text-[#666] hover:text-[#e0e0e0]`}
                      >
                        Cancel
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>

        {/* SCALE MODE PANEL */}
        {scaleActive && (
          <div className="border-b border-amber-800/50 bg-amber-950/20 px-4 py-3 flex flex-wrap items-center gap-4 flex-shrink-0">
            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-500 font-mono">Scale Mode</span>
            <div className="flex items-center gap-2">
              <label className="text-[9px] uppercase text-[#888] font-mono">Limiting ingredient</label>
              <select
                value={scaleItemIdx ?? ''}
                onChange={e => { setScaleItemIdx(e.target.value === '' ? null : Number(e.target.value)); setScaleAvailable(''); }}
                className="bg-[#1c1c1c] border border-[#444] text-[10px] font-mono text-[#e0e0e0] px-2 py-1 outline-none hover:border-amber-600"
              >
                <option value="">— select —</option>
                {gridItems.map((item, idx) => {
                  const ing = ingredients.find(i => i.id === (item.id || (item as any).ingredientId || ''));
                  return <option key={idx} value={idx}>{ing?.name || `Row ${idx + 1}`} ({item.quantity} {item.unit})</option>;
                })}
              </select>
            </div>
            {scaleItemIdx !== null && (
              <div className="flex items-center gap-2">
                <label className="text-[9px] uppercase text-[#888] font-mono">I have</label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={scaleAvailable}
                  onChange={e => setScaleAvailable(e.target.value)}
                  placeholder="0"
                  className="w-20 bg-[#1c1c1c] border border-amber-700 text-amber-300 font-mono text-[11px] px-2 py-1 outline-none text-right"
                  autoFocus
                />
                <span className="text-[10px] font-mono text-[#888]">{gridItems[scaleItemIdx]?.unit}</span>
              </div>
            )}
            {scaleItemIdx !== null && scaleFactor !== 1 && (
              <span className="text-[9px] font-mono text-amber-400 border border-amber-800/50 px-2 py-0.5">
                × {scaleFactor.toFixed(3)} &nbsp;({(scaleFactor * 100).toFixed(1)}% of full batch)
              </span>
            )}
          </div>
        )}

        <div className={`flex-1 overflow-y-auto p-4 transition-opacity ${!isSessionActive ? 'opacity-80' : ''}`}>
          {/* ONLY RENDER GRID IF ITEMS EXIST */}
          {gridItems.length > 0 && (
            <>
              <div className="border border-[#333333] divide-y divide-[#333333] bg-[#0d0d0d]">
                {gridItems.map((item, idx) => {
                  // Robust ID resolution
                  const rawId = item.id || (item as any).ingredientId || '';
                  const component = ingredients.find(i => i.id === rawId);
                  
                  const isInspecting = inspectedItem?.id === rawId;
                  const isUnresolved = !rawId && item.notes?.startsWith('UNRESOLVED:');
                  let unresolvedName = '';
                  if (isUnresolved) {
                     const parts = item.notes?.split('|') || [];
                     unresolvedName = parts[0].replace('UNRESOLVED:', '').trim();
                  }

                  const displayPlaceholder = component?.name || (isUnresolved ? `[MISSING DATA: ${unresolvedName}]` : "SELECT_ITEM");
                  const placeholderClass = isUnresolved ? 'text-[#333333]' : '';
                  
                  return (
                    <div key={idx} className="flex items-center p-3 group hover:bg-[#1c1c1c] transition-colors relative z-0">
                      <div className="w-8 text-[10px] font-mono text-[#444]">{idx + 1}</div>
                      <div className="flex-1 pr-4 flex items-center gap-4">
                        {/* Source Tag */}
                        <SourceTag 
                          type="ingredient" 
                          active={isInspecting}
                          onClick={(e) => {
                             if (onInspect) onInspect(rawId, 'ingredient');
                          }}
                        />

                        <div className="flex-1">
                          <GridItemSelect 
                            value={rawId}
                            type="ingredient"
                            options={searchOptions}
                            onSelect={(opt) => swapGridItem(idx, opt)}
                            onCreate={(name) => onPushIngredient && onPushIngredient(name)}
                            isEditing={isEditing}
                            placeholder={displayPlaceholder}
                            placeholderClassName={placeholderClass}
                          />
                          <div className="flex items-center gap-2">
                             <div className="text-[8px] font-mono text-[#666] uppercase mt-1">ingredient</div>
                             {item.notes && <div className="text-[8px] font-mono text-[#888] italic mt-1 border-l border-[#333] pl-2">{item.notes}</div>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {scaleActive && scaleItemIdx === idx ? (
                          /* Constraining row — show available qty in amber */
                          <span className="text-right font-mono text-xs w-16 text-amber-400 font-bold">
                            {scaleAvailable || item.quantity}
                          </span>
                        ) : scaleActive && scaleFactor !== 1 ? (
                          /* Scaled row — show original struck out + scaled value */
                          <div className="flex flex-col items-end w-20">
                            <span className="text-[9px] font-mono text-[#444] line-through leading-none">{item.quantity}</span>
                            <span className="text-right font-mono text-xs text-amber-300 font-bold leading-none">
                              {(item.quantity * scaleFactor).toFixed(item.quantity * scaleFactor < 10 ? 2 : 0)}
                            </span>
                          </div>
                        ) : (
                          <input
                            ref={el => { quantityRefs.current[idx] = el; }}
                            type="number"
                            value={item.quantity}
                            readOnly={!isEditing}
                            onChange={(e) => isEditing && updateGridItem(idx, { quantity: parseFloat(e.target.value) || 0 })}
                            className={`bg-transparent text-right font-mono text-xs w-16 outline-none text-[#c8a96e]`}
                          />
                        )}
                        <select disabled={!isEditing} value={item.unit} onChange={(e) => updateGridItem(idx, { unit: e.target.value as Unit })} className="bg-transparent text-[10px] font-mono text-[#888] outline-none">
                          <option value="g">g</option><option value="ml">ml</option><option value="kg">kg</option><option value="l">l</option><option value="ea">ea</option>
                        </select>
                      </div>
                      <div className={`flex gap-1 ml-2 ${!isEditing ? 'pointer-events-none opacity-0' : ''}`}>
                        <button onClick={() => removeGridItem(idx)} className="p-2 text-[#444] hover:text-red-500"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div ref={scrollBottomRef}></div>
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className={UI_STYLES.label}>Allergen Risk Profile</label>
                  <AllergenMatrix active={aggregatedAllergens} />
                </div>
                <div className="space-y-3">
                  <label className={UI_STYLES.label}>Method</label>
                  <textarea
                    value={instructions}
                    onChange={e => setInstructions(e.target.value)}
                    className={`w-full h-48 bg-transparent outline-none resize-none font-sans text-sm text-[#e0e0e0] placeholder-[#444] border border-[#333333]`}
                    placeholder="Operating procedure..."
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className={`p-4 border-t border-[#333333] bg-[#1c1c1c] flex-shrink-0 flex justify-between items-center`}>
          {gridItems.length > 0 ? (
            <div className="flex gap-12">
              <div>
                <label className={UI_STYLES.label}>Batch Kcal</label>
                <div className="font-mono text-lg text-[#7D8C7C]">{Math.round(recipeKcal.totalKcal)}<span className="text-xs ml-1 text-[#555]">kcal</span></div>
              </div>
              <div>
                <label className={UI_STYLES.label}>Kcal / 100g</label>
                <div className="font-mono text-lg text-[#7D8C7C]">{Math.round(recipeKcal.kcalPer100)}<span className="text-xs ml-1 text-[#555]">kcal</span></div>
              </div>
            </div>
          ) : <div />}
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
