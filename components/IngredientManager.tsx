import React, { useState, useMemo, useEffect } from 'react';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { Ingredient, Unit, Allergen } from '../types';
import { UI_STYLES } from '../constants';

const INITIAL_FORM_STATE: Omit<Ingredient, 'id'> = {
  name: '',
  category: 'Dry Store',
  supplier: 'Generic',
  packCost: 0,
  packSize: 1000,
  packUnit: 'g',
  wastePercent: 0,
  allergens: [],
  kcalPer100: 0,
  stockLevel: 0
};

interface IngredientManagerProps {
  initialEditId?: string | null;
}

export const IngredientManager: React.FC<IngredientManagerProps> = ({ initialEditId }) => {
  const { ingredients, addIngredient, updateIngredient, deleteIngredient } = useKitchenData();
  const { confirm } = useConfirmation();

  // Filters
  const [search, setSearch] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');

  // Form State
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<Ingredient, 'id'>>(INITIAL_FORM_STATE);
  const [originalFormData, setOriginalFormData] = useState<Omit<Ingredient, 'id'>>(INITIAL_FORM_STATE);
  const [isAddingNewSupplier, setIsAddingNewSupplier] = useState(false);
  const [newSupplierName, setNewSupplierName] = useState('');

  // Dirty check
  const isDirty = useMemo(() => {
    return JSON.stringify(formData) !== JSON.stringify(originalFormData);
  }, [formData, originalFormData]);

  // Derived unique lists for filters
  const suppliers = useMemo(() => ['ALL', ...Array.from(new Set(ingredients.map(i => i.supplier))).sort()], [ingredients]);
  const categories = useMemo(() => ['ALL', ...Array.from(new Set(ingredients.map(i => i.category))).sort()], [ingredients]);

  // Handle deep-linking from Dashboard
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
      return matchesSearch && matchesSupplier && matchesCategory;
    });
  }, [ingredients, search, filterSupplier, filterCategory]);

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
      stockLevel: ing.stockLevel
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
    setFormData(INITIAL_FORM_STATE);
    setOriginalFormData(INITIAL_FORM_STATE);
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

    try {
      if (editingId) {
        await updateIngredient(editingId, finalFormData);
      } else {
        await addIngredient(finalFormData);
      }
      setFormData(INITIAL_FORM_STATE);
      setOriginalFormData(INITIAL_FORM_STATE);
      setEditingId(null);
      setNewSupplierName('');
      setIsAddingNewSupplier(false);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleAllergen = (allergen: Allergen) => {
    setFormData(prev => {
      const current = prev.allergens || [];
      if (current.includes(allergen)) {
        return { ...prev, allergens: current.filter(a => a !== allergen) };
      } else {
        return { ...prev, allergens: [...current, allergen] };
      }
    });
  };

  const yieldPercent = 100 - formData.wastePercent;
  const handleYieldChange = (val: string) => {
    const y = parseFloat(val) || 0;
    const w = 100 - y;
    setFormData({ ...formData, wastePercent: w < 0 ? 0 : w });
  };

  return (
    <div className="flex h-full bg-[#111111] text-[#e0e0e0] divide-x divide-[#333333]">
      
      {/* LEFT COLUMN: Ingredient List & Search */}
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
                  }`}
                >
                  <div className={`text-xs uppercase tracking-wide font-medium ${editingId === ing.id ? 'text-[#c8a96e]' : 'text-[#888888] group-hover:text-white'}`}>
                    {ing.name}
                  </div>
                  <button 
                    onClick={(e) => handleDelete(ing.id, ing.name, e)}
                    className="p-1 text-[#222222] hover:text-[#ff4d4d] opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        
        <div className="p-3 border-t border-[#333333] bg-[#111111]">
           <button 
            onClick={handleResetForm}
            className="w-full py-2 text-[10px] font-bold uppercase tracking-widest text-[#666666] hover:text-[#c8a96e] border border-dashed border-[#333333] hover:border-[#c8a96e] transition-all"
           >
             + New Entry
           </button>
        </div>
      </div>

      {/* RIGHT COLUMN: Persistent Editor Panel */}
      <div className="flex-1 flex flex-col bg-[#111111] overflow-hidden">
        <div className="p-4 border-b border-[#333333] flex justify-between items-center bg-[#1c1c1c]">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#c8a96e]">
            {editingId ? `Edit: ${formData.name}` : 'New Ingredient Specification'}
          </h3>
          {isDirty && (
            <span className="text-[9px] font-mono text-yellow-500 animate-pulse uppercase">Unsaved Changes</span>
          )}
          {editingId && (
             <button 
              onClick={handleResetForm}
              className="text-[9px] font-bold text-[#888888] hover:text-white uppercase tracking-tighter"
             >
               Clear Form
             </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-8 max-w-5xl mx-auto w-full space-y-8">
          
          {/* Section 1: Core Identity */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end">
            <div className="md:col-span-1">
              <label className={UI_STYLES.label}>Full Identity Name</label>
              <input 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className={`w-full ${UI_STYLES.input} text-base`}
                placeholder="e.g. Maldon Sea Salt"
              />
            </div>
            
            <div>
              <label className={UI_STYLES.label}>Category</label>
              <select 
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value})}
                className={`w-full ${UI_STYLES.input}`}
              >
                <option>Dry Store</option>
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
                  <input 
                    autoFocus
                    value={newSupplierName}
                    onChange={e => setNewSupplierName(e.target.value)}
                    className={`flex-1 ${UI_STYLES.input} !text-[11px]`}
                    placeholder="Supplier..."
                  />
                  <button onClick={() => setIsAddingNewSupplier(false)} className="px-1 text-[#666666] hover:text-white font-mono text-xs">X</button>
                </div>
              ) : (
                <select 
                  value={formData.supplier}
                  onChange={e => e.target.value === 'NEW' ? setIsAddingNewSupplier(true) : setFormData({...formData, supplier: e.target.value})}
                  className={`w-full ${UI_STYLES.input}`}
                >
                  {suppliers.filter(s => s !== 'ALL').map(s => <option key={s} value={s}>{s}</option>)}
                  <option value="NEW">+ NEW SUPPLIER</option>
                </select>
              )}
            </div>
          </div>

          {/* Section 2: Economics */}
          <div className="bg-[#1c1c1c] border border-[#333333] p-6 space-y-6">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#888888] border-b border-[#333333] pb-2">Unit & Pack Economics</h4>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div>
                <label className={UI_STYLES.label}>Pack Cost (£)</label>
                <input 
                  type="number"
                  step="0.01"
                  value={formData.packCost}
                  onChange={e => setFormData({...formData, packCost: parseFloat(e.target.value) || 0})}
                  className={`w-full ${UI_STYLES.input}`}
                />
              </div>
              <div>
                <label className={UI_STYLES.label}>Pack Size</label>
                <input 
                  type="number"
                  value={formData.packSize}
                  onChange={e => setFormData({...formData, packSize: parseFloat(e.target.value) || 1})}
                  className={`w-full ${UI_STYLES.input}`}
                />
              </div>
              <div>
                <label className={UI_STYLES.label}>Pack Unit</label>
                <select 
                  value={formData.packUnit}
                  onChange={e => setFormData({...formData, packUnit: e.target.value as Unit})}
                  className={`w-full ${UI_STYLES.input}`}
                >
                  <option value="g">Grams (g)</option>
                  <option value="ml">Milliliters (ml)</option>
                  <option value="kg">Kilograms (kg)</option>
                  <option value="l">Liters (l)</option>
                  <option value="ea">Each (ea)</option>
                </select>
              </div>
              <div>
                <label className={UI_STYLES.label}>Current Stock</label>
                <input 
                  type="number"
                  value={formData.stockLevel}
                  onChange={e => setFormData({...formData, stockLevel: parseFloat(e.target.value) || 0})}
                  className={`w-full ${UI_STYLES.input}`}
                />
              </div>
            </div>

            <div className="flex justify-between items-center p-4 bg-[#111111] border border-[#333333]">
               <div className="flex flex-col">
                  <span className="text-[8px] font-bold uppercase text-[#666666]">Financial Impact</span>
                  <span className="text-xl font-mono text-[#c8a96e]">
                    £{(formData.packCost / (formData.packSize || 1)).toFixed(5)} <span className="text-xs text-[#888888]">per {formData.packUnit}</span>
                  </span>
               </div>
               <div className="text-right">
                  <span className="text-[8px] font-bold uppercase text-[#666666]">Stock Value</span>
                  <span className="text-xl font-mono text-[#e0e0e0]">
                    £{(formData.stockLevel * (formData.packCost / (formData.packSize || 1))).toFixed(2)}
                  </span>
               </div>
            </div>
          </div>

          {/* Section 3: Technical Specs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <label className={UI_STYLES.label}>Yield Profile (%)</label>
              <div className="flex items-center gap-4">
                <input 
                  type="range"
                  min="0"
                  max="100"
                  value={yieldPercent}
                  onChange={e => handleYieldChange(e.target.value)}
                  className="flex-1 accent-[#c8a96e]"
                />
                <span className="text-sm font-mono w-12 text-[#c8a96e]">{yieldPercent}%</span>
              </div>
            </div>

            <div className="space-y-4">
              <label className={UI_STYLES.label}>Nutritional Density (Kcal/100g)</label>
              <input 
                type="number"
                value={formData.kcalPer100}
                onChange={e => setFormData({...formData, kcalPer100: parseFloat(e.target.value) || 0})}
                className={`w-full ${UI_STYLES.input}`}
              />
            </div>
          </div>

          {/* Section 4: Allergens */}
          <div className="space-y-4">
            <label className={UI_STYLES.label}>Allergen Risk Declaration</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {Object.values(Allergen).map((allergen) => (
                <label 
                  key={allergen} 
                  className={`flex items-center p-2 border text-[10px] cursor-pointer transition-all ${
                    formData.allergens.includes(allergen) 
                      ? 'bg-[#c8a96e]/10 border-[#c8a96e] text-[#c8a96e]' 
                      : 'bg-[#1c1c1c] border-[#333333] text-[#666666] hover:border-[#888888]'
                  }`}
                >
                  <input 
                    type="checkbox"
                    className="hidden"
                    checked={formData.allergens.includes(allergen)}
                    onChange={() => toggleAllergen(allergen)}
                  />
                  <span className="truncate uppercase font-bold">{allergen}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-6 border-t border-[#333333] bg-[#1c1c1c] flex justify-end gap-3 shadow-2xl">
          <button 
            onClick={handleResetForm}
            className={`${UI_STYLES.button} border border-[#333333] text-[#888888] hover:bg-[#333333] hover:text-white`}
          >
            {isDirty ? 'Discard' : 'Cancel'}
          </button>
          <button 
            disabled={!isDirty || !formData.name}
            onClick={handleSave}
            className={`${UI_STYLES.button} bg-[#c8a96e] text-black hover:bg-[#b8985e] px-8 font-bold border border-black/20 disabled:opacity-20`}
          >
            {editingId ? 'Update Master Registry' : 'Commit New Entry'}
          </button>
        </div>
      </div>
    </div>
  );
};
