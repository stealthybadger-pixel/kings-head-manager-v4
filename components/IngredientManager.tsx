
import React, { useState, useMemo, useEffect } from 'react';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { Ingredient, Unit, Allergen } from '../types';
import { UI_STYLES } from '../constants';

const INITIAL_FORM_STATE: Omit<Ingredient, 'id'> = {
  name: '',
  category: 'Dry Store',
  supplier: 'Internal',
  packCost: 0,
  packSize: 1000,
  packUnit: 'g',
  wastePercent: 0,
  allergens: [],
  kcalPer100: 0,
  stockLevel: 0,
  incomplete: false
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
  const { ingredients, addIngredient, updateIngredient, deleteIngredient } = useKitchenData();
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
    name: initialName
  });
  const [originalFormData, setOriginalFormData] = useState<Omit<Ingredient, 'id'>>({
    ...INITIAL_FORM_STATE,
    name: initialName
  });
  const [isAddingNewSupplier, setIsAddingNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');

  // Dirty check
  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(originalFormData);
  }, [formData, originalFormData]);

  // Derived unique lists for filters - ensuring "Internal" is represented if present
  const suppliers = useMemo(() => ['ALL', ...Array.from(new Set(ingredients.map(i => i.supplier))).filter(s => s !== 'Generic').sort()], [ingredients]);
  const categories = useMemo(() => ['ALL', 'Sub-Recipe', ...Array.from(new Set(ingredients.map(i => i.category))).sort()], [ingredients]);

  // Handle deep-linking
  useEffect(() => {
    if (initialEditId && ingredients.length > 0) {
      const target = ingredients.find(i => i.id === initialEditId);
      if (target) {
        handleEdit(target);
      }
    }
  }, [initialEditId, ingredients]);

  const filteredIngredients = useMemo(() => {
    return ingredients.filter(i => {
      const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase());
      const matchesSupplier = filterSupplier === 'ALL' || i.supplier === filterSupplier;
      const matchesCategory = filterCategory === 'ALL' || i.category === filterCategory;
      const matchesIncomplete = !filterIncomplete || i.incomplete;
      return matchesSearch && matchesSupplier && matchesCategory && matchesIncomplete;
    });
  }, [ingredients, search, filterSupplier, filterCategory, filterIncomplete]);

  const handleEdit = async (ing: Ingredient) => {
    if (isDirty) {
      const ok = await confirm("You have unsaved changes in the editor. Discard them?");
      if (!ok) return;
    }

    const data = {
      name: ing.name,
      category: ing.category,
      supplier: ing.supplier,
      packCost: ing.packCost,
      packSize: ing.packSize,
      packUnit: ing.packUnit,
      wastePercent: ing.wastePercent,
      allergens: ing.allergens || [],
      kcalPer100: ing.kcalPer100 || 0,
      stockLevel: ing.stockLevel,
      incomplete: ing.incomplete || false
    };
    setFormData(data);
    setOriginalFormData(data);
    setEditingId(ing.id);
    setIsAddingNewSupplier(false);
  };

  const handleResetForm = async () => {
    if (isDirty) {
      const ok = await confirm("Discard all unsaved changes?");
      if (!ok) return;
    }
    setFormData({ ...INITIAL_FORM_STATE, name: initialName });
    setOriginalFormData({ ...INITIAL_FORM_STATE, name: initialName });
    setEditingId(null);
    setIsAddingNewSupplier(false);
  };

  const handleDelete = async (id: string, name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm(`Are you sure you want to delete ${name}? This cannot be undone.`);
    if (ok) {
      await deleteIngredient(id);
      if (editingId === id) {
        setFormData(INITIAL_FORM_STATE);
        setOriginalFormData(INITIAL_FORM_STATE);
        setEditingId(null);
      }
    }
  };

  const handleSave = async () => {
    if (!formData.name) return;

    let finalFormData = { ...formData };
    if (isAddingNewSupplier && newSupplierName.trim()) {
      finalFormData.supplier = newSupplierName.trim();
    }

    // Auto-resolve incomplete flag if basic data is provided
    if (finalFormData.incomplete && finalFormData.packCost > 0 && finalFormData.packSize > 0) {
      finalFormData.incomplete = false;
    }

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
        setFormData(INITIAL_FORM_STATE);
        setOriginalFormData(INITIAL_FORM_STATE);
        setEditingId(null);
        setNewSupplierName('');
        setIsAddingNewSupplier(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className={`flex h-full bg-[#111111] text-[#e0e0e0] divide-x divide-[#333333] ${isRecursive ? 'overflow-hidden' : ''}`}>
      
      {/* LEFT COLUMN: Ingredient List */}
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
                   {suppliers.map(s => <option key={s} value={s}>{s}</option>)}
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
                {filteredIngredients.map((ing) => (
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
                      </div>
                      <div className="text-[8px] font-mono text-[#444] mt-0.5">{ing.category} // {ing.supplier}</div>
                    </div>
                    {ing.incomplete && <span className="text-[7px] font-mono text-red-500 uppercase border border-red-900 px-1">STUB</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-3 border-t border-[#333333] bg-[#111111]">
             <button onClick={handleResetForm} className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-[#666666] hover:text-[#c8a96e] border border-dashed border-[#333333] hover:border-[#c8a96e] transition-all">
               + New Entry
             </button>
          </div>
        </div>
      )}

      {/* RIGHT COLUMN: Persistent Editor Panel */}
      <div className="flex-1 flex flex-col bg-[#111111] overflow-hidden">
        {formData.incomplete && (
          <div className="bg-red-950/40 border-b border-red-900 p-2 text-center flex items-center justify-center gap-4">
            <span className="text-[9px] font-bold text-red-500 uppercase tracking-[0.4em] animate-pulse">! DATA_RECONCILIATION_REQUIRED</span>
            <span className="text-[8px] text-red-400 uppercase font-mono">This item was created as a stub via OCR. Add pricing and yield data to resolve.</span>
          </div>
        )}

        <div className="p-4 border-b border-[#333333] flex justify-between items-center bg-[#1c1c1c]">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#c8a96e]">
            {editingId ? `Edit: ${formData.name}` : isRecursive ? `Define New: ${initialName}` : 'New Ingredient Specification'}
          </h3>
          <div className="flex items-center gap-4">
            {isDirty && <span className="text-[9px] font-mono text-yellow-500 animate-pulse uppercase">Unsaved Changes</span>}
            {editingId && (
              <button onClick={(e) => handleDelete(editingId, formData.name, e)} className="text-[9px] font-bold uppercase text-red-800 hover:text-red-500 transition-colors">Terminate Entry</button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 w-full space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div className="md:col-span-1">
              <label className={UI_STYLES.label}>Full Identity Name</label>
              <input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className={`w-full ${UI_STYLES.input} text-base`} placeholder="e.g. Maldon Sea Salt" />
            </div>
            <div>
              <label className={UI_STYLES.label}>Category</label>
              <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className={`w-full ${UI_STYLES.input}`}>
                <option>Dry Store</option>
                <option>Sub-Recipe</option>
                <option>Dairy</option>
                <option>Meat</option>
                <option>Fish</option>
                <option>Vegetable</option>
                <option>Fruit</option>
                <option>Frozen</option>
                <option>Alcohol</option>
                <option>Non-Food</option>
              </select>
            </div>
            <div>
              <label className={UI_STYLES.label}>Supplier Link</label>
              {isAddingNewSupplier ? (
                <div className="flex gap-1">
                  <input autoFocus value={newSupplierName} onChange={e => setNewSupplierName(e.target.value)} className={`flex-1 ${UI_STYLES.input} !text-[11px]`} placeholder="Supplier..." />
                  <button onClick={() => setIsAddingNewSupplier(false)} className="px-1 text-[#666666] hover:text-white font-mono text-xs">X</button>
                </div>
              ) : (
                <select value={formData.supplier} onChange={e => e.target.value === 'NEW' ? setIsAddingNewSupplier(true) : setFormData({...formData, supplier: e.target.value})} className={`w-full ${UI_STYLES.input}`}>
                  <option value="Internal">Internal</option>
                  {suppliers.filter(s => s !== 'ALL' && s !== 'Internal' && s !== 'Generic').map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="NEW">+ NEW SUPPLIER</option>
                </select>
              )}
            </div>
          </div>

          <div className={`bg-[#1c1c1c] border p-4 space-y-6 ${formData.incomplete ? 'border-red-900/50' : 'border-[#333333]'}`}>
            <h4 className={`text-[10px] font-bold uppercase tracking-widest border-b pb-2 ${formData.incomplete ? 'text-red-400 border-red-900/40' : 'text-[#888888] border-[#333333]'}`}>Unit & Pack Economics</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div><label className={UI_STYLES.label}>Pack Cost (£)</label><input type="number" step="0.01" value={formData.packCost} onChange={e => setFormData({...formData, packCost: parseFloat(e.target.value) || 0})} className={`w-full ${UI_STYLES.input}`} /></div>
              <div><label className={UI_STYLES.label}>Pack Size</label><input type="number" value={formData.packSize} onChange={e => setFormData({...formData, packSize: parseFloat(e.target.value) || 1})} className={`w-full ${UI_STYLES.input}`} /></div>
              <div><label className={UI_STYLES.label}>Pack Unit</label><select value={formData.packUnit} onChange={e => setFormData({...formData, packUnit: e.target.value as Unit})} className={`w-full ${UI_STYLES.input}`}><option value="g">G (g)</option><option value="ml">ML (ml)</option><option value="kg">KG (kg)</option><option value="l">L (l)</option><option value="ea">EA (ea)</option></select></div>
              <div><label className={UI_STYLES.label}>Current Stock</label><input type="number" value={formData.stockLevel} onChange={e => setFormData({...formData, stockLevel: parseFloat(e.target.value) || 0})} className={`w-full ${UI_STYLES.input}`} /></div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className={UI_STYLES.label}>Yield Profile (%)</label>
              <div className="flex items-center gap-4">
                <input type="range" min="0" max="100" value={100 - formData.wastePercent} onChange={e => setFormData({...formData, wastePercent: 100 - (parseFloat(e.target.value) || 0)})} className="flex-1 accent-[#c8a96e]" />
                <span className="text-sm font-mono w-12 text-[#c8a96e]">{100 - formData.wastePercent}%</span>
              </div>
            </div>
            <div>
               <label className={UI_STYLES.label}>Energy Density (kcal/100g)</label>
               <input type="number" value={formData.kcalPer100} onChange={e => setFormData({...formData, kcalPer100: parseFloat(e.target.value) || 0})} className={`w-full ${UI_STYLES.input}`} />
            </div>
          </div>

          <div className="space-y-4">
            <label className={UI_STYLES.label}>Allergen Risk Declaration</label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.values(Allergen).map((allergen) => (
                <label key={allergen} className={`flex items-center p-2 border text-[9px] cursor-pointer transition-all ${formData.allergens.includes(allergen) ? 'bg-[#c8a96e]/10 border-[#c8a96e] text-[#c8a96e]' : 'bg-[#1c1c1c] border-[#333333] text-[#666666] hover:border-[#888888]'}`}>
                  <input type="checkbox" className="hidden" checked={formData.allergens.includes(allergen)} onChange={() => {
                    const cur = formData.allergens;
                    setFormData({...formData, allergens: cur.includes(allergen) ? cur.filter(a => a !== allergen) : [...cur, allergen]});
                  }} />
                  <span className="truncate uppercase font-bold">{allergen}</span>
                </label>
              ))}
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
            {editingId ? 'Update Entry' : isRecursive ? 'Create & Add to Dish' : 'Commit New Entry'}
          </button>
        </div>
      </div>
    </div>
  );
};
