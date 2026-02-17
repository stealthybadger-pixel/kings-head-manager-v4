
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { Ingredient, Unit, Allergen, IngredientSupplier } from '../types';
import { UI_STYLES, APPROVED_SUPPLIERS } from '../constants';
import { detectAllergens, detectCategory, detectSupplierFromCategory, normalizeName } from '../utils/intelligence';
import { lookupKcal } from '../utils/nutritionLookup';

const INITIAL_FORM_STATE: Omit<Ingredient, 'id'> = {
  name: '',
  category: 'Dry Store',
  suppliers: [{
    name: 'Internal',
    packCost: 0,
    packSize: 1000,
    packUnit: 'g',
    isPreferred: true
  }],
  wastePercent: 0,
  allergens: [],
  kcalPer100: 0,
  stockLevel: 0,
  incomplete: false,
  audited: false
};

interface IngredientManagerProps {
  initialEditId?: string | null;
  isRecursive?: boolean;
  initialName?: string;
  onComplete?: (id: string) => void;
}

export const IngredientManager: React.FC<IngredientManagerProps> = ({ 
  initialEditId, 
  isRecursive = false,
  initialName = '',
  onComplete
}) => {
  const { ingredients, addIngredient, updateIngredient, deleteIngredient, mergeIngredients, recipes, dishes } = useKitchenData();
  const { confirm } = useConfirmation();

  // Filters
  const [search, setSearch] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [filterIncomplete, setFilterIncomplete] = useState(false);

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<Ingredient, 'id'>>({
    ...INITIAL_FORM_STATE,
    name: initialName,
    suppliers: INITIAL_FORM_STATE.suppliers.map(s => ({...s})) // Deep copy
  });
  const [originalFormData, setOriginalFormData] = useState<Omit<Ingredient, 'id'>>({
    ...INITIAL_FORM_STATE,
    name: initialName,
    suppliers: INITIAL_FORM_STATE.suppliers.map(s => ({...s})) // Deep copy
  });
  const [suggestedAllergens, setSuggestedAllergens] = useState<Allergen[]>([]);
  const [isAutoDetecting, setIsAutoDetecting] = useState(false);
  
  // Nutrition Lookup State
  const [isKcalLookingUp, setIsKcalLookingUp] = useState(false);
  const [kcalSource, setKcalSource] = useState<'COFID' | 'USDA' | null>(null);

  // Swap State
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [swapTargetId, setSwapTargetId] = useState<string>('');
  const [swapSearch, setSwapSearch] = useState('');

  // Dirty check
  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(originalFormData);
  }, [formData, originalFormData]);

  const uniqueSuppliers = useMemo(() => {
    const all = new Set<string>();
    ingredients.forEach(i => i.suppliers.forEach(s => all.add(s.name)));
    return ['ALL', ...Array.from(all).sort()];
  }, [ingredients]);

  const categories = useMemo(() => ['ALL', 'Dry Store', 'Sub-Recipe', 'Dairy', 'Meat', 'Fish', 'Vegetable', 'Fruit', 'Frozen', 'Alcohol', 'Non-Food'], []);

  // Intelligence: Name Watcher
  useEffect(() => {
    if (formData.name && !editingId) {
      setIsAutoDetecting(true);
      
      // Synchronous Detection
      const category = detectCategory(formData.name);
      const supplierName = detectSupplierFromCategory(category);
      const allergens = detectAllergens(formData.name);
      
      setSuggestedAllergens(allergens);
      
      // Only auto-set supplier if user hasn't messed with it much (i.e., it's still default Internal)
      setFormData(prev => {
        const isDefaultSupplier = prev.suppliers.length === 1 && prev.suppliers[0].name === 'Internal';
        const newSuppliers = isDefaultSupplier 
          ? [{ ...prev.suppliers[0], name: supplierName }]
          : prev.suppliers;

        return {
          ...prev,
          category,
          suppliers: newSuppliers,
          allergens: [...new Set([...prev.allergens, ...allergens])]
        };
      });
      
      setTimeout(() => setIsAutoDetecting(false), 300);

      // Async Kcal Lookup (Debounced)
      const timer = setTimeout(() => handleManualKcalLookup(formData.name), 800);
      return () => clearTimeout(timer);
    }
  }, [formData.name, editingId]);

  useEffect(() => {
    if (initialEditId && ingredients.length > 0) {
      const target = ingredients.find(i => i.id === initialEditId);
      if (target) {
        handleEdit(target);
      }
    }
  }, [initialEditId, ingredients]);

  const handleManualKcalLookup = async (name: string) => {
    if (!name) return;
    setIsKcalLookingUp(true);
    setKcalSource(null);
    try {
      const result = await lookupKcal(name);
      if (result) {
        setFormData(prev => ({ ...prev, kcalPer100: result.value }));
        setKcalSource(result.source);
      }
    } catch (e) {
      console.error("Kcal lookup failed", e);
    } finally {
      setIsKcalLookingUp(false);
    }
  };

  const filteredIngredients = useMemo(() => {
    return ingredients.filter(i => {
      const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase());
      const matchesSupplier = filterSupplier === 'ALL' || i.suppliers.some(s => s.name === filterSupplier);
      const matchesCategory = filterCategory === 'ALL' || i.category === filterCategory;
      const matchesIncomplete = !filterIncomplete || i.incomplete;
      return matchesSearch && matchesSupplier && matchesCategory && matchesIncomplete;
    });
  }, [ingredients, search, filterSupplier, filterCategory, filterIncomplete]);

  const handleEdit = async (ing: Ingredient) => {
    if (swappingId) setSwappingId(null); // Close swap if opening edit

    if (isDirty) {
      const ok = await confirm("You have unsaved changes in the editor. Discard them?");
      if (!ok) return;
    }

    const data: Omit<Ingredient, 'id'> = {
      name: ing.name || '',
      category: ing.category || 'Dry Store',
      suppliers: ing.suppliers ? ing.suppliers.map(s => ({ ...s })) : [], // Deep copy suppliers
      wastePercent: ing.wastePercent ?? 0, // Fix undefined
      allergens: ing.allergens || [],
      kcalPer100: ing.kcalPer100 ?? 0, // Fix undefined
      stockLevel: ing.stockLevel ?? 0, // Fix undefined
      incomplete: ing.incomplete || false,
      audited: ing.audited || false
    };
    setFormData(data);
    setOriginalFormData(data);
    setEditingId(ing.id);
    setSuggestedAllergens([]); 
    setKcalSource(null); 
  };

  const handleResetForm = async () => {
    if (isDirty) {
      const ok = await confirm("Discard all unsaved changes?");
      if (!ok) return;
    }
    // Correct deep copy logic to prevent state collisions
    const resetState = {
       ...INITIAL_FORM_STATE,
       name: initialName,
       suppliers: INITIAL_FORM_STATE.suppliers.map(s => ({ ...s }))
    };
    setFormData(resetState);
    setOriginalFormData(resetState);
    setEditingId(null);
    setSuggestedAllergens([]);
    setKcalSource(null);
  };

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm(`Are you sure you want to delete ${name}? This cannot be undone.`);
    if (ok) {
      await deleteIngredient(id);
      if (editingId === id) {
        handleResetForm();
      }
    }
  };

  const handleNameBlur = () => {
    if (formData.name) {
      const normalized = normalizeName(formData.name);
      if (normalized !== formData.name) {
        setFormData(prev => ({ ...prev, name: normalized }));
      }
    }
  };

  const updateSupplier = (index: number, field: keyof IngredientSupplier, value: any) => {
    setFormData(prev => {
      const newSuppliers = [...prev.suppliers];
      newSuppliers[index] = { ...newSuppliers[index], [field]: value };
      return { ...prev, suppliers: newSuppliers };
    });
  };

  const togglePreferredSupplier = (index: number) => {
    setFormData(prev => {
      const newSuppliers = prev.suppliers.map((s, i) => ({
        ...s,
        isPreferred: i === index
      }));
      return { ...prev, suppliers: newSuppliers };
    });
  };

  const addSupplier = () => {
    setFormData(prev => ({
      ...prev,
      // Default to first approved supplier
      suppliers: [...prev.suppliers, { name: APPROVED_SUPPLIERS[0], packCost: 0, packSize: 1, packUnit: 'kg', isPreferred: false }]
    }));
  };

  const removeSupplier = (index: number) => {
    if (formData.suppliers.length <= 1) return; // Prevent deleting last supplier
    setFormData(prev => {
      const newSuppliers = prev.suppliers.filter((_, i) => i !== index);
      // Ensure one is preferred
      if (!newSuppliers.some(s => s.isPreferred)) {
        newSuppliers[0].isPreferred = true;
      }
      return { ...prev, suppliers: newSuppliers };
    });
  };

  const handleSave = async () => {
    if (!formData.name) return;

    let finalFormData = { 
      ...formData, 
      name: normalizeName(formData.name), 
      audited: true, 
      incomplete: false 
    };
    
    try {
      if (editingId) {
        await updateIngredient(editingId, finalFormData);
        setOriginalFormData(finalFormData);
      } else {
        const docRef = await addIngredient(finalFormData);
        if (isRecursive && onComplete) {
          onComplete(docRef.id);
        }
      }
      if (!isRecursive) {
        // Deep copy reset state
        const resetState = {
           ...INITIAL_FORM_STATE,
           name: initialName,
           suppliers: INITIAL_FORM_STATE.suppliers.map(s => ({ ...s }))
        };
        setFormData(resetState);
        setOriginalFormData(resetState);
        setEditingId(null);
        setSuggestedAllergens([]);
        setKcalSource(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // --- SWAP & PURGE LOGIC ---
  const handleInitiateSwap = (ing: Ingredient, e: React.MouseEvent) => {
     e.stopPropagation();
     setSwappingId(ing.id);
     setSwapSearch('');
     setSwapTargetId('');
  };

  const handleExecuteSwap = async (sourceIng: Ingredient) => {
    if (!swapTargetId) return;
    const targetIng = ingredients.find(i => i.id === swapTargetId);
    if (!targetIng) return;

    // Calculate Impact
    const affectedRecipes = recipes.filter(r => r.items.some(i => i.type === 'ingredient' && i.id === sourceIng.id));
    const affectedDishes = dishes.filter(d => d.items.some(i => i.type === 'ingredient' && i.id === sourceIng.id));
    const totalImpact = affectedRecipes.length + affectedDishes.length;

    const ok = await confirm(`SWAP "${sourceIng.name}" WITH "${targetIng.name}"?\nThis will update ${totalImpact} recipes/dishes and delete the original.`);
    
    if (ok) {
       await mergeIngredients(sourceIng.id, targetIng.id, sourceIng.name);
       setSwappingId(null);
       if (editingId === sourceIng.id) {
          handleResetForm();
       }
    }
  };

  const filteredSwapTargets = useMemo(() => {
     if (!swapSearch) return [];
     return ingredients
       .filter(i => i.id !== swappingId && i.name.toLowerCase().includes(swapSearch.toLowerCase()))
       .slice(0, 10);
  }, [ingredients, swapSearch, swappingId]);

  const showIncompleteWarning = useMemo(() => {
    if (!formData.incomplete) return false;
    // Warning if preferred supplier has 0 cost
    const pref = formData.suppliers.find(s => s.isPreferred) || formData.suppliers[0];
    if (pref.name === 'Internal') return false;
    return pref.packCost === 0;
  }, [formData.incomplete, formData.suppliers]);

  return (
    <div className={`flex h-full bg-[#111111] text-[#e0e0e0] divide-x divide-[#333333] ${isRecursive ? 'overflow-hidden' : ''} relative`}>
      
      {!isRecursive && (
        <div className="w-80 flex flex-col bg-[#0d0d0d]">
          <div className="p-4 border-b border-[#333333] space-y-3">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#c8a96e]">Master Registry</h2>
            <input 
              type="text" 
              placeholder="Search items..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={`w-full ${UI_STYLES.input} !text-xs`}
            />
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                 <label className="text-[8px] font-bold uppercase text-[#666666] mb-1">Supplier</label>
                 <select 
                   value={filterSupplier}
                   onChange={e => setFilterSupplier(e.target.value)}
                   className={`${UI_STYLES.input} !py-1 !px-2 !text-[10px]`}
                 >
                   {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                 </select>
              </div>
              <div className="flex flex-col">
                 <label className="text-[8px] font-bold uppercase text-[#666666] mb-1">Category</label>
                 <select 
                   value={filterCategory}
                   onChange={e => setFilterCategory(e.target.value)}
                   className={`${UI_STYLES.input} !py-1 !px-2 !text-[10px]`}
                 >
                   {categories.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
              </div>
            </div>
            <button 
              onClick={() => setFilterIncomplete(!filterIncomplete)}
              className={`w-full py-2 text-[8px] font-bold uppercase tracking-widest border transition-all ${filterIncomplete ? 'bg-red-900 border-red-500 text-white' : 'border-[#333333] text-[#666666] hover:text-[#888888]'}`}
            >
              {filterIncomplete ? 'Showing Incomplete Only' : 'Filter by Incomplete'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filteredIngredients.length === 0 ? (
              <div className="p-12 text-center text-[#666666] font-mono text-[10px] uppercase">No items match filters</div>
            ) : (
              <div className="divide-y divide-[#1a1a1a]">
                {filteredIngredients.map((ing) => {
                  const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
                  const isSwapping = swappingId === ing.id;
                  
                  if (isSwapping) {
                     // SWAP INTERFACE ROW
                     return (
                        <div key={ing.id} className="p-3 bg-[#111] border-l-4 border-l-[#005f73] flex flex-col gap-2">
                           <div className="flex justify-between items-center">
                              <span className="text-[10px] font-bold uppercase text-[#005f73] truncate w-32">{ing.name}</span>
                              <button onClick={(e) => { e.stopPropagation(); setSwappingId(null); }} className="text-[8px] text-[#666] hover:text-white uppercase">Cancel</button>
                           </div>
                           <div className="relative">
                              <input 
                                autoFocus
                                type="text"
                                placeholder="SEARCH REPLACEMENT..."
                                value={swapSearch}
                                onChange={(e) => setSwapSearch(e.target.value)}
                                className="w-full bg-[#1c1c1c] border border-[#333] text-[9px] text-white px-2 py-1 outline-none focus:border-[#005f73]"
                              />
                              {swapSearch && !swapTargetId && (
                                 <div className="absolute top-full left-0 w-full bg-[#1c1c1c] border border-[#333] z-50 max-h-32 overflow-y-auto shadow-xl">
                                    {filteredSwapTargets.map(target => (
                                       <div 
                                         key={target.id}
                                         onClick={() => { setSwapTargetId(target.id); setSwapSearch(target.name); }}
                                         className="p-1.5 hover:bg-[#005f73] hover:text-white cursor-pointer text-[9px] uppercase truncate"
                                       >
                                         {target.name}
                                       </div>
                                    ))}
                                    {filteredSwapTargets.length === 0 && <div className="p-1.5 text-[8px] text-[#666]">NO MATCHES</div>}
                                 </div>
                              )}
                           </div>
                           <button 
                             disabled={!swapTargetId}
                             onClick={() => handleExecuteSwap(ing)}
                             className="w-full bg-[#005f73] text-white text-[9px] font-bold uppercase py-1.5 hover:bg-[#004a5d] disabled:opacity-50"
                           >
                             SWAP ALL
                           </button>
                        </div>
                     );
                  }

                  // NORMAL ROW
                  return (
                    <div 
                      key={ing.id} 
                      onClick={() => handleEdit(ing)}
                      className={`p-3 cursor-pointer group transition-all flex justify-between items-center ${
                        editingId === ing.id ? 'bg-[#c8a96e]/10 border-l-2 border-l-[#c8a96e]' : 'hover:bg-[#151515] border-l-2 border-l-transparent'
                      } ${ing.incomplete ? 'bg-red-950/5' : ''}`}
                    >
                      <div className="flex flex-col overflow-hidden">
                        <div className={`text-xs uppercase tracking-wide font-medium flex items-center gap-2 ${editingId === ing.id ? 'text-[#c8a96e]' : 'text-[#888888] group-hover:text-white'}`}>
                          {ing.incomplete && <div className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                          {ing.name}
                          {ing.audited && <div className="w-1 h-1 rounded-full bg-[#c8a96e] opacity-40 ml-1" title="Verified" />}
                        </div>
                        <div className="text-[8px] font-mono text-[#444] mt-0.5">{ing.category} // {pref?.name}</div>
                      </div>
                      <div className="flex flex-col gap-1 items-end">
                        {ing.incomplete && <span className="text-[7px] font-mono text-red-500 uppercase border border-red-900 px-1">STUB</span>}
                        <button 
                          onClick={(e) => handleInitiateSwap(ing, e)}
                          className="opacity-0 group-hover:opacity-100 text-[8px] font-bold uppercase text-[#005f73] hover:bg-[#005f73] hover:text-white px-1 transition-all"
                        >
                          SWAP
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="p-3 border-t border-[#333333] bg-[#111111]">
             <button onClick={handleResetForm} className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-[#666666] hover:text-[#c8a96e] border border-dashed border-[#333333] hover:border-[#c8a96e] transition-all">
               + Add Ingredient
             </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col bg-[#111111] overflow-hidden">
        {showIncompleteWarning && (
          <div className="bg-red-950/40 border-b border-red-900 p-2 text-center flex items-center justify-center gap-4">
            <span className="text-[9px] font-bold text-red-500 uppercase tracking-[0.4em] animate-pulse">! DATA_RECONCILIATION_REQUIRED</span>
            <span className="text-[8px] text-red-400 uppercase font-mono">Stub record detected. Complete pricing and yield data to finalize the registry entry.</span>
          </div>
        )}

        <div className="p-4 border-b border-[#333333] flex justify-between items-center bg-[#1c1c1c]">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#c8a96e]">
            {editingId ? `Edit: ${formData.name}` : isRecursive ? `Define New: ${initialName}` : 'Ingredient Details'}
          </h3>
          <div className="flex items-center gap-4">
            {isAutoDetecting && <span className="text-[9px] font-mono text-[#c8a96e] animate-pulse uppercase tracking-widest">Running Intelligence...</span>}
            {isDirty && !isAutoDetecting && <span className="text-[9px] font-mono text-yellow-500 animate-pulse uppercase">Unsaved Changes</span>}
            {editingId && (
              <button onClick={(e) => handleDelete(editingId, formData.name, e)} className="text-[9px] font-bold uppercase text-red-800 hover:text-red-500 transition-colors">Delete</button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
            <div className="md:col-span-1">
              <label className={UI_STYLES.label}>Ingredient Name</label>
              <input 
                value={formData.name} 
                onChange={e => setFormData({...formData, name: e.target.value})} 
                onBlur={handleNameBlur}
                className={`w-full ${UI_STYLES.input} text-base`} 
                placeholder="e.g. Maldon Sea Salt" 
              />
            </div>
            <div>
              <label className={UI_STYLES.label}>Category</label>
              <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className={`w-full ${UI_STYLES.input}`}>
                {categories.filter(c => c !== 'ALL').map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Suppliers Panel */}
          <div className={`bg-[#1c1c1c] border p-4 space-y-4 ${showIncompleteWarning ? 'border-red-900/50' : 'border-[#333333]'}`}>
            <div className="flex justify-between items-center border-b border-[#333333] pb-2">
              <h4 className={`text-[10px] font-bold uppercase tracking-widest ${showIncompleteWarning ? 'text-red-400' : 'text-[#888888]'}`}>Supply Chain & Economics</h4>
              <button onClick={addSupplier} className="text-[9px] uppercase font-bold text-[#c8a96e] hover:text-white">+ Add Supplier</button>
            </div>
            
            <div className="space-y-3">
              {formData.suppliers.map((supplier, idx) => {
                const unitCost = supplier.packSize > 0 ? supplier.packCost / supplier.packSize : 0;
                return (
                  <div key={idx} className={`grid grid-cols-12 gap-2 items-center p-2 border ${supplier.isPreferred ? 'border-[#c8a96e] bg-[#c8a96e]/5' : 'border-[#333333] bg-[#151515]'}`}>
                    <div className="col-span-1 flex justify-center">
                       <input 
                         type="radio" 
                         checked={supplier.isPreferred} 
                         onChange={() => togglePreferredSupplier(idx)}
                         className="accent-[#c8a96e] cursor-pointer"
                         title="Set as Preferred Supplier"
                       />
                    </div>
                    <div className="col-span-3">
                      <label className="text-[7px] font-mono text-[#666] uppercase block mb-1">Supplier Name</label>
                      <select 
                        value={supplier.name}
                        onChange={(e) => updateSupplier(idx, 'name', e.target.value)}
                        className={`w-full ${UI_STYLES.input} !text-[10px] !py-1 !px-2`}
                      >
                         {!APPROVED_SUPPLIERS.includes(supplier.name) && supplier.name && (
                            <option value={supplier.name} disabled>{supplier.name} (Invalid)</option>
                         )}
                         {APPROVED_SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-[7px] font-mono text-[#666] uppercase block mb-1">Cost (£)</label>
                      <input 
                        type="number" step="0.01"
                        value={supplier.packCost}
                        onChange={(e) => updateSupplier(idx, 'packCost', parseFloat(e.target.value) || 0)}
                        className={`w-full ${UI_STYLES.input} !text-[10px] !py-1 !px-2`}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[7px] font-mono text-[#666] uppercase block mb-1">Pack Size</label>
                      <input 
                        type="number"
                        value={supplier.packSize}
                        onChange={(e) => updateSupplier(idx, 'packSize', parseFloat(e.target.value) || 0)}
                        className={`w-full ${UI_STYLES.input} !text-[10px] !py-1 !px-2`}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-[7px] font-mono text-[#666] uppercase block mb-1">Unit</label>
                      <select 
                        value={supplier.packUnit}
                        onChange={(e) => updateSupplier(idx, 'packUnit', e.target.value)}
                        className={`w-full ${UI_STYLES.input} !text-[10px] !py-1 !px-2`}
                      >
                        <option value="g">g</option><option value="ml">ml</option><option value="kg">kg</option><option value="l">l</option><option value="ea">ea</option>
                      </select>
                    </div>
                    <div className="col-span-2 flex flex-col items-end justify-between h-full">
                       <button onClick={() => removeSupplier(idx)} className="text-[#444] hover:text-red-500 mb-1">
                         <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                       </button>
                       <span className="text-[9px] font-mono text-[#c8a96e]">£{unitCost.toFixed(4)}/{supplier.packUnit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
            
            <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#333333]">
              <div><label className={UI_STYLES.label}>Current Stock ({formData.suppliers.find(s=>s.isPreferred)?.packUnit || 'units'})</label><input type="number" value={formData.stockLevel} onChange={e => setFormData({...formData, stockLevel: parseFloat(e.target.value) || 0})} className={`w-full ${UI_STYLES.input}`} /></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className={UI_STYLES.label}>Yield Profile (%)</label>
              <div className="flex items-center gap-4">
                <input type="range" min="0" max="100" value={100 - (formData.wastePercent || 0)} onChange={e => setFormData({...formData, wastePercent: 100 - (parseFloat(e.target.value) || 0)})} className="flex-1 accent-[#c8a96e]" />
                <span className="text-sm font-mono w-12 text-[#c8a96e]">{100 - (formData.wastePercent || 0)}%</span>
              </div>
            </div>
            <div>
               <label className={UI_STYLES.label}>
                 Energy Density (kcal/100g)
                 {kcalSource && <span className="ml-2 text-[8px] font-mono text-[#444] uppercase tracking-widest border border-[#333] px-1 bg-[#222] text-[#888]">{kcalSource}</span>}
               </label>
               <div className="relative flex gap-2">
                 <input type="number" value={formData.kcalPer100} onChange={e => { setFormData({...formData, kcalPer100: parseFloat(e.target.value) || 0}); setKcalSource(null); }} className={`flex-1 ${UI_STYLES.input}`} />
                 <button 
                  onClick={() => handleManualKcalLookup(formData.name)}
                  className="px-3 border border-[#333] hover:border-[#c8a96e] text-[#666] hover:text-[#c8a96e] text-[9px] font-bold uppercase"
                 >
                   SEARCH
                 </button>
                 {isKcalLookingUp && <div className="absolute inset-0 bg-[#1c1c1c]/90 text-[#666] text-[10px] font-mono flex items-center px-3 animate-pulse border border-[#333]">LOOKING_UP...</div>}
               </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className={UI_STYLES.label}>Allergen Risk Declaration</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.values(Allergen).map((allergen) => {
                const isSuggested = suggestedAllergens.includes(allergen);
                return (
                  <label key={allergen} className={`flex items-center justify-between p-2 border text-[9px] cursor-pointer transition-all ${formData.allergens.includes(allergen) ? 'bg-[#c8a96e]/10 border-[#c8a96e] text-[#c8a96e]' : 'bg-[#1c1c1c] border-[#333333] text-[#666666] hover:border-[#888888]'} ${isSuggested ? 'ring-1 ring-[#c8a96e]/50 ring-inset' : ''}`}>
                    <input type="checkbox" className="hidden" checked={formData.allergens.includes(allergen)} onChange={() => {
                      const cur = formData.allergens;
                      setFormData({...formData, allergens: cur.includes(allergen) ? cur.filter(a => a !== allergen) : [...cur, allergen]});
                    }} />
                    <span className="truncate uppercase font-bold">{allergen}</span>
                    {isSuggested && !formData.allergens.includes(allergen) && <span className="text-[7px] text-[#c8a96e] font-mono tracking-tighter">[AUTO_DETECT]</span>}
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-[#333333] bg-[#1c1c1c] flex justify-end gap-3 flex-shrink-0">
          <button onClick={handleResetForm} className={`${UI_STYLES.button} border border-[#333333] text-[#888888] hover:bg-[#333333] hover:text-white`}>
            {isDirty ? 'Discard' : 'Clear'}
          </button>
          <button 
            disabled={!isDirty || !formData.name} 
            onClick={handleSave} 
            className={`${UI_STYLES.button} bg-[#c8a96e] text-black hover:bg-[#b8985e] px-8 font-bold border border-black/20 disabled:opacity-20`}
          >
            {editingId ? 'Save Changes' : isRecursive ? 'Save & Add' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};
