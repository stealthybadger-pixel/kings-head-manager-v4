import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useKitchenData, SupplierPriceItem } from '../hooks/useKitchenData';
import { Ingredient, Unit, Allergen } from '../types';
import { UI_STYLES, APPROVED_SUPPLIERS } from '../constants';
import { detectCategory, detectAllergens, normalizeName } from '../utils/intelligence';
import { getProduceYield } from '../utils/yields';

interface Props {
  initialEditId?: string | null;
  isRecursive?: boolean;
  initialName?: string;
  onComplete?: (id: string) => void;
}

const UNITS: Unit[] = ['g', 'kg', 'ml', 'l', 'ea'];
const CATEGORIES = ['Vegetable', 'Fruit', 'Meat', 'Fish', 'Dairy', 'Dry Store', 'Frozen', 'Alcohol', 'Uncategorized'];

const blankForm = (name = '') => ({
  name,
  supplier: 'David Catt',
  packCost: '' as string | number,
  packSize: '' as string | number,
  packUnit: 'kg' as Unit,
  category: name.length > 2 ? detectCategory(name) : 'Dry Store',
  wastePercent: '' as string | number,
  kcalPer100: '' as string | number,
  allergens: name.length > 2 ? detectAllergens(name) : [] as Allergen[],
});

export const IngredientManager: React.FC<Props> = ({ initialEditId, isRecursive, initialName, onComplete }) => {
  const { ingredients, addIngredient, updateIngredient, deleteIngredient, searchSupplierPriceGuide } = useKitchenData();

  const [selectedId, setSelectedId] = useState<string | null>(initialEditId || null);
  const [isNew, setIsNew] = useState(!initialEditId);
  const [search, setSearch] = useState('');
  const [filterSupplier, setFilterSupplier] = useState('ALL');
  const [filterCategory, setFilterCategory] = useState('ALL');
  const [form, setForm] = useState(blankForm(initialName));
  const [suggestions, setSuggestions] = useState<SupplierPriceItem[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Stock take mode
  const [stockTakeMode, setStockTakeMode] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stockInput, setStockInput] = useState('');
  const [pendingChanges, setPendingChanges] = useState<Record<string, number>>({});
  const [isCommitting, setIsCommitting] = useState(false);
  const stockInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus stock input when expanded item changes
  useEffect(() => {
    if (expandedId && stockInputRef.current) {
      stockInputRef.current.focus();
      stockInputRef.current.select();
    }
  }, [expandedId]);

  // Load ingredient into form when selected
  useEffect(() => {
    if (!selectedId) return;
    const ing = ingredients.find(i => i.id === selectedId);
    if (!ing) return;
    const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
    setForm({
      name: ing.name,
      supplier: pref?.name || 'David Catt',
      packCost: pref?.packCost ?? '',
      packSize: pref?.packSize ?? '',
      packUnit: pref?.packUnit || 'kg',
      category: ing.category,
      wastePercent: ing.wastePercent || '',
      kcalPer100: ing.kcalPer100 || '',
      allergens: ing.allergens,
    });
  }, [selectedId, ingredients]);

  // David Catt autocomplete (only on new ingredient)
  useEffect(() => {
    if (form.supplier !== 'David Catt' || String(form.name).length < 2) {
      setSuggestions([]);
      return;
    }
    const t = setTimeout(async () => {
      setSuggestions(await searchSupplierPriceGuide(String(form.name)));
    }, 300);
    return () => clearTimeout(t);
  }, [form.name, form.supplier, searchSupplierPriceGuide]);

  const handleNameChange = (val: string) => {
    setForm(f => ({
      ...f,
      name: val,
      ...(val.length > 2 ? { category: detectCategory(val), allergens: detectAllergens(val) } : {}),
    }));
  };

  const handleSuggestionSelect = (s: SupplierPriceItem) => {
    const category = detectCategory(s.name);
    const yieldPct = getProduceYield(s.name);
    const allergens = s.allergens && s.allergens.length > 0
      ? s.allergens.filter(a => Object.values(Allergen).includes(a as Allergen)) as Allergen[]
      : detectAllergens(s.name);
    setForm(f => ({
      ...f,
      name: s.name,
      packCost: s.packCost,
      packSize: s.packSize,
      packUnit: s.packUnit as Unit,
      category,
      allergens,
      kcalPer100: s.kcalPer100 ?? 0,
      ...(yieldPct !== null ? { wastePercent: 100 - yieldPct } : {}),
    }));
    setSuggestions([]);
  };

  const handleNew = () => {
    setSelectedId(null);
    setIsNew(true);
    setForm(blankForm());
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setIsNew(false);
    setSuggestions([]);
  };

  const handleSave = async () => {
    if (!form.name || !form.packCost || !form.packSize) return;
    setIsSaving(true);
    try {
      const payload: Omit<Ingredient, 'id'> = {
        name: normalizeName(String(form.name)),
        category: form.category,
        suppliers: [{ name: form.supplier, packCost: Number(form.packCost), packSize: Number(form.packSize), packUnit: form.packUnit, isPreferred: true }],
        wastePercent: Number(form.wastePercent) || 0,
        allergens: form.allergens,
        kcalPer100: Number(form.kcalPer100) || 0,
        stockLevel: 0,
        audited: true,
      };
      if (isNew) {
        const created = await addIngredient(payload);
        if (onComplete) { onComplete(created.id); return; }
        setSelectedId(created.id);
        setIsNew(false);
      } else if (selectedId) {
        await updateIngredient(selectedId, payload);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId || !window.confirm('Delete this ingredient?')) return;
    await deleteIngredient(selectedId);
    handleNew();
  };

  const listSuppliers = useMemo(() =>
    ['ALL', ...Array.from(new Set(ingredients.flatMap(i => i.suppliers.map(s => s.name)))).sort()],
    [ingredients]);

  const listCategories = useMemo(() =>
    ['ALL', ...Array.from(new Set(ingredients.map(i => i.category))).sort()],
    [ingredients]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return ingredients.filter(i => {
      const matchesSearch = i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q);
      const matchesSupplier = filterSupplier === 'ALL' || i.suppliers.some(s => s.name === filterSupplier);
      const matchesCategory = filterCategory === 'ALL' || i.category === filterCategory;
      return matchesSearch && matchesSupplier && matchesCategory;
    });
  }, [ingredients, search, filterSupplier, filterCategory]);

  // Stock take handlers
  const handleStockItemClick = useCallback((ing: Ingredient) => {
    if (expandedId === ing.id) {
      setExpandedId(null);
      return;
    }
    const currentVal = pendingChanges[ing.id] ?? ing.stockLevel;
    setExpandedId(ing.id);
    setStockInput(String(currentVal));
  }, [expandedId, pendingChanges]);

  const handleStockInputKey = useCallback((e: React.KeyboardEvent, ing: Ingredient) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const newLevel = parseFloat(stockInput);
      const updated = { ...pendingChanges };
      if (!isNaN(newLevel)) {
        updated[ing.id] = newLevel;
        setPendingChanges(updated);
      }
      // Move to next item in filtered list
      const idx = filtered.findIndex(i => i.id === expandedId);
      const nextItem = filtered[idx + 1];
      if (nextItem) {
        const nextVal = updated[nextItem.id] ?? nextItem.stockLevel;
        setExpandedId(nextItem.id);
        setStockInput(String(nextVal));
      } else {
        setExpandedId(null);
      }
    } else if (e.key === 'Escape') {
      setExpandedId(null);
    }
  }, [stockInput, pendingChanges, filtered, expandedId]);

  const handleCommitStock = async () => {
    const entries = Object.entries(pendingChanges);
    if (entries.length === 0) return;
    setIsCommitting(true);
    try {
      for (const [id, level] of entries) {
        await updateIngredient(id, { stockLevel: level });
      }
      setPendingChanges({});
      setStockTakeMode(false);
      setExpandedId(null);
    } finally {
      setIsCommitting(false);
    }
  };

  const pendingCount = Object.keys(pendingChanges).length;

  const inp = UI_STYLES.input + ' w-full text-[#e0e0e0]';
  const lbl = UI_STYLES.label;
  const selInp = `${UI_STYLES.input} !py-1 !px-2 !text-[9px] w-full`;

  const formPanel = (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="h-12 border-b border-[#333] flex items-center px-6 justify-between flex-shrink-0 bg-[#1c1c1c]">
        <span className="text-[10px] font-bold text-[#c8a96e] uppercase tracking-[0.2em]">
          {isNew ? 'New Ingredient' : (String(form.name) || 'Edit Ingredient')}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div>
          <label className={lbl}>Supplier</label>
          <select value={form.supplier} onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))} className={inp}>
            {APPROVED_SUPPLIERS.filter(s => s !== 'Internal').map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="relative">
          <label className={lbl}>Name</label>
          <input
            type="text"
            value={String(form.name)}
            onChange={e => handleNameChange(e.target.value)}
            placeholder={form.supplier === 'David Catt' && isNew ? 'Type to search price guide…' : 'Ingredient name'}
            className={inp}
            autoComplete="off"
          />
          {suggestions.length > 0 && (
            <div className="absolute z-10 w-full mt-0.5 bg-[#111] border border-[#c8a96e] max-h-48 overflow-y-auto shadow-xl">
              {suggestions.map(s => (
                <div key={s.id} onMouseDown={() => handleSuggestionSelect(s)}
                  className="px-3 py-2 cursor-pointer hover:bg-[#005f73] border-b border-[#222] last:border-0">
                  <div className="text-[10px] font-bold uppercase text-[#c8a96e]">{s.name}</div>
                  <div className="text-[8px] text-[#666] font-mono">£{s.packCost} / {s.packSize}{s.packUnit}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={lbl}>Pack Cost £</label>
            <input type="number" value={form.packCost as any} onChange={e => setForm(f => ({ ...f, packCost: e.target.value }))} className={inp} min="0" step="0.01" />
          </div>
          <div>
            <label className={lbl}>Pack Size</label>
            <input type="number" value={form.packSize as any} onChange={e => setForm(f => ({ ...f, packSize: e.target.value }))} className={inp} min="0" />
          </div>
          <div>
            <label className={lbl}>Unit</label>
            <select value={form.packUnit} onChange={e => setForm(f => ({ ...f, packUnit: e.target.value as Unit }))} className={inp}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={lbl}>Category <span className="text-[#555] normal-case font-normal">(auto-detected)</span></label>
          <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className={inp}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Yield %</label>
            <input type="number"
              value={form.wastePercent === '' ? '' : 100 - Number(form.wastePercent)}
              onChange={e => setForm(f => ({ ...f, wastePercent: e.target.value === '' ? '' : 100 - Number(e.target.value) }))}
              className={inp} min="0" max="100" />
          </div>
          <div>
            <label className={lbl}>Kcal / 100g</label>
            <input type="number" value={form.kcalPer100 as any} onChange={e => setForm(f => ({ ...f, kcalPer100: e.target.value }))} className={inp} min="0" />
          </div>
        </div>

        <div>
          <label className={lbl}>Allergens <span className="text-[#555] normal-case font-normal">(auto-detected, toggle to override)</span></label>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {Object.values(Allergen).map(a => {
              const active = form.allergens.includes(a);
              return (
                <button key={a} type="button"
                  onClick={() => setForm(f => ({ ...f, allergens: active ? f.allergens.filter(x => x !== a) : [...f.allergens, a] }))}
                  className={`text-[9px] uppercase font-bold px-2 py-1 border transition-colors ${active ? 'bg-[#c8a96e] text-black border-[#c8a96e]' : 'text-[#555] border-[#333] hover:border-[#c8a96e] hover:text-[#c8a96e]'}`}>
                  {a}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 border-t border-[#333] px-6 py-4 flex gap-3 bg-[#1c1c1c]">
        <button onClick={handleSave} disabled={isSaving || !form.name}
          className="flex-1 py-2 bg-[#c8a96e] text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#e0c080] disabled:opacity-40 transition-colors">
          {isSaving ? 'Saving…' : 'Save Ingredient'}
        </button>
        {!isNew && selectedId && !isRecursive && (
          <button onClick={handleDelete}
            className="px-4 py-2 border border-[#ff4d4d] text-[#ff4d4d] text-[10px] font-bold uppercase tracking-widest hover:bg-[#ff4d4d] hover:text-black transition-colors">
            Delete
          </button>
        )}
      </div>
    </div>
  );

  if (isRecursive) return formPanel;

  return (
    <div className="flex h-full w-full bg-[#111111]">
      {/* Left: ingredient list */}
      <div className="w-72 flex-shrink-0 border-r border-[#333] flex flex-col h-full">

        {/* Action buttons row */}
        {!stockTakeMode ? (
          <div className="flex flex-col border-b border-[#333]">
            <button onClick={handleNew} className="w-full py-2.5 text-[9px] font-bold uppercase tracking-widest text-[#c8a96e] hover:bg-[#c8a96e] hover:text-black transition-colors border-b border-[#333]">
              + New Ingredient
            </button>
            <button onClick={() => setStockTakeMode(true)} className="w-full py-2.5 text-[9px] font-bold uppercase tracking-widest text-[#888] hover:bg-[#1c1c1c] hover:text-[#c8a96e] transition-colors">
              Stock Take
            </button>
          </div>
        ) : (
          <div className="flex flex-col border-b border-[#333]">
            <div className="flex items-center justify-between px-3 py-2 bg-[#005f73]/20 border-b border-[#005f73]/40">
              <span className="text-[9px] font-bold uppercase tracking-widest text-[#3a9db8]">Stock Take Mode</span>
              <button
                onClick={() => { setStockTakeMode(false); setExpandedId(null); setPendingChanges({}); }}
                className="text-[8px] uppercase tracking-widest text-[#888] hover:text-white border border-[#333] px-2 py-1 hover:border-[#555] transition-colors"
              >
                Exit
              </button>
            </div>
            {pendingCount > 0 && (
              <button
                onClick={handleCommitStock}
                disabled={isCommitting}
                className="w-full py-2.5 text-[9px] font-bold uppercase tracking-widest bg-[#3a9db8] text-black hover:bg-[#2a8fa6] disabled:opacity-50 transition-colors"
              >
                {isCommitting ? 'Saving…' : `Commit ${pendingCount} Change${pendingCount !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        )}

        {/* Search + filters */}
        <div className="p-3 border-b border-[#333] flex-shrink-0 flex flex-col gap-2">
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search ingredients…"
            className="w-full bg-[#1c1c1c] border border-[#333] px-3 py-2 text-[11px] text-[#e0e0e0] focus:outline-none focus:border-[#c8a96e] font-mono placeholder:text-[#444]"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[8px] font-bold uppercase text-[#666] mb-1 block">Supplier</label>
              <select value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)} className={selInp}>
                {listSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[8px] font-bold uppercase text-[#666] mb-1 block">Category</label>
              <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className={selInp}>
                {listCategories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.map((ing, idx) => {
            const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
            const packUnit = pref?.packUnit || '';
            const isExpanded = expandedId === ing.id;
            const hasPending = pendingChanges[ing.id] !== undefined;
            const displayLevel = pendingChanges[ing.id] ?? ing.stockLevel;

            if (stockTakeMode) {
              return (
                <div key={ing.id} className="border-b border-[#1a1a1a] border-r border-[#333]">
                  {/* Item row */}
                  <div
                    onClick={() => handleStockItemClick(ing)}
                    className={`px-4 py-2.5 cursor-pointer flex items-center justify-between transition-colors
                      ${isExpanded ? 'bg-[#005f73]/20 border-l-2 border-l-[#3a9db8]' : hasPending ? 'bg-[#c8a96e]/5 border-l-2 border-l-[#c8a96e]' : 'border-l-2 border-l-transparent hover:bg-[#1c1c1c]'}`}
                  >
                    <div className="flex items-center gap-2 overflow-hidden">
                      {hasPending && !isExpanded && (
                        <div className="w-1.5 h-1.5 rounded-full bg-[#c8a96e] flex-shrink-0" />
                      )}
                      <span className={`text-[10px] font-bold uppercase truncate ${hasPending ? 'text-[#c8a96e]' : 'text-[#e0e0e0]'}`}>
                        {ing.name}
                      </span>
                    </div>
                    <span className="text-[9px] font-mono text-[#666] flex-shrink-0 ml-2">
                      {displayLevel}{packUnit}
                    </span>
                  </div>

                  {/* Accordion */}
                  {isExpanded && (
                    <div className="px-4 py-3 bg-[#041824] border-t border-[#005f73]/30">
                      <label className="text-[8px] font-bold uppercase text-[#3a9db8] mb-1.5 block">
                        New Stock Level ({packUnit})
                      </label>
                      <div className="flex gap-2 items-center">
                        <input
                          ref={stockInputRef}
                          type="number"
                          value={stockInput}
                          onChange={e => setStockInput(e.target.value)}
                          onKeyDown={e => handleStockInputKey(e, ing)}
                          className="flex-1 bg-[#111] border border-[#3a9db8]/40 focus:border-[#3a9db8] px-2 py-1.5 text-[11px] text-white font-mono focus:outline-none"
                          min="0"
                          step="any"
                        />
                        <button
                          onClick={() => handleStockInputKey({ key: 'Enter', preventDefault: () => {} } as any, ing)}
                          className="px-3 py-1.5 bg-[#3a9db8] text-black text-[9px] font-bold uppercase tracking-widest hover:bg-[#2a8fa6] transition-colors flex-shrink-0"
                        >
                          ↵
                        </button>
                      </div>
                      <div className="text-[8px] text-[#446] font-mono mt-1.5">
                        Enter to save &amp; move next · Esc to close
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            // Normal mode
            const unitPrice = pref && pref.packSize > 0 ? `£${(pref.packCost / pref.packSize).toFixed(3)}/${pref.packUnit}` : null;
            const active = selectedId === ing.id;
            return (
              <div key={ing.id} onClick={() => handleSelect(ing.id)}
                className={`px-4 py-3 cursor-pointer border-b border-[#1a1a1a] border-r border-[#333] hover:bg-[#1c1c1c] border-l-2 transition-colors ${active ? 'bg-[#1c1c1c] border-l-[#c8a96e]' : 'border-l-transparent'}`}>
                <div className={`text-[10px] font-bold uppercase truncate ${active ? 'text-[#c8a96e]' : 'text-[#e0e0e0]'}`}>{ing.name}</div>
                <div className="text-[8px] text-[#555] mt-0.5 font-mono">{ing.category} · {pref?.name}{unitPrice ? ` · ${unitPrice}` : ''}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: form */}
      {formPanel}
    </div>
  );
};
