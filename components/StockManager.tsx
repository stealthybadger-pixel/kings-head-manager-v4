
import React, { useState, useMemo, useRef } from 'react';
import { Ingredient, Unit, StockMovement, Invoice } from '../types';
import { useKitchenData } from '../hooks/useKitchenData';
import { UI_STYLES, COLORS, APPROVED_SUPPLIERS } from '../constants';
import { InvoiceScanner } from './InvoiceScanner';

// ── Helpers ─────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

const formatDate = (d: string) =>
  new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const TYPE_BADGE: Record<string, { label: string; color: string }> = {
  delivery:   { label: 'Delivery',   color: 'bg-[#005f73] text-white' },
  waste:      { label: 'Waste',      color: 'bg-red-900/60 text-red-300' },
  stock_take: { label: 'Stock Take', color: 'bg-[#c8a96e]/20 text-[#c8a96e]' },
  adjustment: { label: 'Adjustment', color: 'bg-[#444] text-[#ccc]' },
};

const WASTE_REASONS = ['Spoilage', 'Prep waste', 'Accident / spillage', 'Expired', 'Other'];

// ── Sub-components ───────────────────────────────────────────────────────────

/** Simple ingredient autocomplete input */
const IngredientSearch: React.FC<{
  ingredients: Ingredient[];
  value: string;
  onSelect: (ing: Ingredient) => void;
  placeholder?: string;
}> = ({ ingredients, value, onSelect, placeholder = 'Search ingredient...' }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(value);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!search || search.length < 2) return [];
    const lower = search.toLowerCase();
    return ingredients
      .filter(i => i.name.toLowerCase().includes(lower))
      .sort((a, b) => {
        const aS = a.name.toLowerCase().startsWith(lower);
        const bS = b.name.toLowerCase().startsWith(lower);
        return aS === bS ? a.name.localeCompare(b.name) : aS ? -1 : 1;
      })
      .slice(0, 20);
  }, [ingredients, search]);

  // Close on outside click
  React.useEffect(() => {
    const h = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={`${UI_STYLES.input} w-full`}
        placeholder={placeholder}
        value={search}
        onChange={e => { setSearch(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute top-full left-0 w-full z-50 bg-[#1c1c1c] border border-[#444] max-h-48 overflow-y-auto shadow-xl">
          {filtered.map(ing => (
            <div
              key={ing.id}
              onMouseDown={e => { e.preventDefault(); onSelect(ing); setSearch(ing.name); setOpen(false); }}
              className="px-3 py-2 hover:bg-[#005f73] cursor-pointer text-xs font-bold uppercase text-[#e0e0e0] flex justify-between"
            >
              <span>{ing.name}</span>
              <span className="text-[#666] font-normal">{ing.category}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ── Main Component ───────────────────────────────────────────────────────────

type Tab = 'stock_take' | 'deliveries' | 'waste' | 'history' | 'invoice_scanner';
type DeliveryMode = 'supplier' | 'adhoc';

export const StockManager: React.FC = () => {
  const { ingredients, stockMovements, invoices, addInvoice, logWaste, commitStockTake } = useKitchenData();
  const [tab, setTab] = useState<Tab>('stock_take');
  const [showInvoiceScanner, setShowInvoiceScanner] = useState(false);

  // ── STOCK TAKE state ──────────────────────────────────────────────────────
  const [stockSearch, setStockSearch] = useState('');
  const [stockFilterSupplier, setStockFilterSupplier] = useState('ALL');
  const [stockFilterCategory, setStockFilterCategory] = useState('ALL');
  const [pendingLevels, setPendingLevels] = useState<Record<string, number>>({});
  const [isCommitting, setIsCommitting] = useState(false);

  const stockCategories = useMemo(() => ['ALL', ...Array.from(new Set(ingredients.map(i => i.category))).sort()], [ingredients]);
  const stockSuppliers = useMemo(() => {
    const s = new Set<string>();
    ingredients.forEach(i => i.suppliers.forEach(sup => s.add(sup.name)));
    return ['ALL', ...Array.from(s).sort()];
  }, [ingredients]);

  const filteredStock = useMemo(() => {
    const term = stockSearch.toLowerCase();
    return ingredients.filter(i => {
      const matchSearch = !term || i.name.toLowerCase().includes(term);
      const matchSupplier = stockFilterSupplier === 'ALL' || i.suppliers.some(s => s.name === stockFilterSupplier);
      const matchCategory = stockFilterCategory === 'ALL' || i.category === stockFilterCategory;
      return matchSearch && matchSupplier && matchCategory;
    });
  }, [ingredients, stockSearch, stockFilterSupplier, stockFilterCategory]);

  const stockTotalValue = useMemo(() => ingredients.reduce((sum, ing) => {
    const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
    const unitCost = pref ? pref.packCost / (pref.packSize || 1) : 0;
    return sum + (ing.stockLevel || 0) * unitCost;
  }, 0), [ingredients]);

  const handleCommitStockTake = async () => {
    const changes = Object.entries(pendingLevels).map(([id, newLevel]) => ({ id, newLevel }));
    if (!changes.length) return;
    setIsCommitting(true);
    try {
      await commitStockTake(changes);
      setPendingLevels({});
    } finally {
      setIsCommitting(false);
    }
  };

  // ── DELIVERIES state ──────────────────────────────────────────────────────
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('supplier');
  const [deliverySupplier, setDeliverySupplier] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(today());
  const [deliveryRef, setDeliveryRef] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  // supplier mode: map of ingredientId → qty entered
  const [supplierQtys, setSupplierQtys] = useState<Record<string, string>>({});
  // adhoc mode: staged lines
  const [adhocLines, setAdhocLines] = useState<{ ingredientId: string; name: string; quantity: number; unit: Unit; unitCost: number }[]>([]);
  const [adhocQty, setAdhocQty] = useState('');
  const [adhocUnit, setAdhocUnit] = useState<Unit>('kg');
  const [adhocCost, setAdhocCost] = useState('');
  const [adhocIngredient, setAdhocIngredient] = useState<Ingredient | null>(null);
  const [isLoggingDelivery, setIsLoggingDelivery] = useState(false);

  const supplierIngredients = useMemo(() =>
    deliverySupplier ? ingredients.filter(i => i.suppliers.some(s => s.name === deliverySupplier)) : [],
  [ingredients, deliverySupplier]);

  const deliveryTotal = useMemo(() => {
    if (deliveryMode === 'supplier') {
      return supplierIngredients.reduce((sum, ing) => {
        const qty = parseFloat(supplierQtys[ing.id] || '0') || 0;
        const pref = ing.suppliers.find(s => s.name === deliverySupplier) || ing.suppliers[0];
        const unitCost = pref ? pref.packCost / (pref.packSize || 1) : 0;
        return sum + qty * unitCost;
      }, 0);
    }
    return adhocLines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  }, [deliveryMode, supplierIngredients, supplierQtys, adhocLines, deliverySupplier]);

  const handleLogDelivery = async () => {
    setIsLoggingDelivery(true);
    try {
      const movements: Omit<StockMovement, 'id'>[] = [];
      const invoiceItems: Invoice['items'] = [];

      if (deliveryMode === 'supplier') {
        supplierIngredients.forEach(ing => {
          const qty = parseFloat(supplierQtys[ing.id] || '0') || 0;
          if (qty <= 0) return;
          const pref = ing.suppliers.find(s => s.name === deliverySupplier) || ing.suppliers[0];
          const unitCost = pref ? pref.packCost / (pref.packSize || 1) : 0;
          movements.push({ ingredientId: ing.id, type: 'delivery', quantity: qty, unit: pref?.packUnit || 'g', date: deliveryDate, supplierName: deliverySupplier });
          invoiceItems.push({ ingredientId: ing.id, quantity: qty, unit: pref?.packUnit || 'g', unitCost });
        });
      } else {
        adhocLines.forEach(l => {
          movements.push({ ingredientId: l.ingredientId, type: 'delivery', quantity: l.quantity, unit: l.unit, date: deliveryDate, supplierName: deliverySupplier || 'Ad-hoc' });
          invoiceItems.push({ ingredientId: l.ingredientId, quantity: l.quantity, unit: l.unit, unitCost: l.unitCost });
        });
      }

      if (!movements.length) return;

      await addInvoice({
        supplier: deliverySupplier || 'Ad-hoc',
        date: deliveryDate,
        reference: deliveryRef,
        notes: deliveryNotes,
        items: invoiceItems,
        totalCost: deliveryTotal,
      }, movements);

      // Reset
      setSupplierQtys({});
      setAdhocLines([]);
      setDeliveryRef('');
      setDeliveryNotes('');
    } finally {
      setIsLoggingDelivery(false);
    }
  };

  // ── WASTE state ───────────────────────────────────────────────────────────
  const [wasteIngredient, setWasteIngredient] = useState<Ingredient | null>(null);
  const [wasteQty, setWasteQty] = useState('');
  const [wasteUnit, setWasteUnit] = useState<Unit>('g');
  const [wasteReason, setWasteReason] = useState(WASTE_REASONS[0]);
  const [wasteNotes, setWasteNotes] = useState('');
  const [wasteDate, setWasteDate] = useState(today());
  const [isLoggingWaste, setIsLoggingWaste] = useState(false);

  const todayWaste = useMemo(() =>
    stockMovements.filter(m => m.type === 'waste' && m.date === today()),
  [stockMovements]);

  const handleLogWaste = async () => {
    if (!wasteIngredient || !wasteQty || parseFloat(wasteQty) <= 0) return;
    setIsLoggingWaste(true);
    try {
      await logWaste(wasteIngredient.id, parseFloat(wasteQty), wasteUnit, `${wasteReason}${wasteNotes ? ': ' + wasteNotes : ''}`, wasteDate);
      setWasteIngredient(null);
      setWasteQty('');
      setWasteNotes('');
    } finally {
      setIsLoggingWaste(false);
    }
  };

  // ── HISTORY state ─────────────────────────────────────────────────────────
  const [historyFrom, setHistoryFrom] = useState('');
  const [historyTo, setHistoryTo] = useState('');
  const [historyTypes, setHistoryTypes] = useState<Record<string, boolean>>({ delivery: true, waste: true, stock_take: true, adjustment: true });
  const [historyIngredientSearch, setHistoryIngredientSearch] = useState('');
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  const filteredHistory = useMemo(() => {
    const ingTerm = historyIngredientSearch.toLowerCase();
    return stockMovements.filter(m => {
      if (!historyTypes[m.type]) return false;
      if (historyFrom && m.date < historyFrom) return false;
      if (historyTo && m.date > historyTo) return false;
      if (ingTerm) {
        const ing = ingredients.find(i => i.id === m.ingredientId);
        if (!ing || !ing.name.toLowerCase().includes(ingTerm)) return false;
      }
      return true;
    });
  }, [stockMovements, historyTypes, historyFrom, historyTo, historyIngredientSearch, ingredients]);

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string }[] = [
    { id: 'stock_take', label: 'Stock Take' },
    { id: 'deliveries', label: 'Deliveries' },
    { id: 'invoice_scanner', label: 'Invoice Scanner' },
    { id: 'waste', label: 'Waste Log' },
    { id: 'history', label: 'History' },
  ];

  const pendingCount = Object.keys(pendingLevels).length;

  return (
    <div className="flex flex-col h-full bg-[#111111] overflow-hidden">
      {/* Header */}
      <div className="border-b border-[#333] bg-[#1c1c1c] px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#888]">Stock & Waste</span>
          <div className="flex items-center gap-6 mt-1">
            <span className="text-xs font-mono text-[#c8a96e]">Total Inventory Value: <span className="font-bold">£{stockTotalValue.toFixed(2)}</span></span>
          </div>
        </div>
        {/* Tab bar */}
        <div className="flex border border-[#333]">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 text-[10px] font-bold uppercase tracking-widest border-r last:border-r-0 border-[#333] transition-all
                ${tab === t.id ? 'bg-[#c8a96e] text-black' : 'text-[#888] hover:bg-[#1c1c1c] hover:text-white'}`}
            >
              {t.label}
              {t.id === 'stock_take' && pendingCount > 0 && (
                <span className="ml-2 bg-yellow-500 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-full">{pendingCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* ── STOCK TAKE ─────────────────────────────────────────────────── */}
        {tab === 'stock_take' && (
          <div className="p-6">
            {/* Filters */}
            <div className="flex gap-3 mb-4 flex-wrap items-end">
              <input
                className={`${UI_STYLES.input} w-56`}
                placeholder="Search ingredients..."
                value={stockSearch}
                onChange={e => setStockSearch(e.target.value)}
              />
              <select className={`${UI_STYLES.input} w-40`} value={stockFilterSupplier} onChange={e => setStockFilterSupplier(e.target.value)}>
                {stockSuppliers.map(s => <option key={s}>{s}</option>)}
              </select>
              <select className={`${UI_STYLES.input} w-40`} value={stockFilterCategory} onChange={e => setStockFilterCategory(e.target.value)}>
                {stockCategories.map(c => <option key={c}>{c}</option>)}
              </select>
              <div className="ml-auto flex items-center gap-3">
                {pendingCount > 0 && (
                  <span className="text-[10px] font-mono text-yellow-400">{pendingCount} unsaved change{pendingCount > 1 ? 's' : ''}</span>
                )}
                <button
                  onClick={handleCommitStockTake}
                  disabled={pendingCount === 0 || isCommitting}
                  className={`${UI_STYLES.button} bg-[#005f73] text-white hover:bg-[#004a5d] disabled:opacity-30 border border-transparent`}
                >
                  {isCommitting ? 'Saving...' : `Commit ${pendingCount > 0 ? `(${pendingCount})` : ''} Changes`}
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="border border-[#333] bg-[#0d0d0d]">
              <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] border-b border-[#333] px-4 py-2 bg-[#1c1c1c]">
                {['Ingredient', 'Category', 'Supplier', 'Unit', 'Current Stock', 'New Level', 'Unit Value'].map(h => (
                  <span key={h} className="text-[9px] font-bold uppercase text-[#666]">{h}</span>
                ))}
              </div>
              {filteredStock.map(ing => {
                const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
                const unitCost = pref ? pref.packCost / (pref.packSize || 1) : 0;
                const hasPending = pendingLevels[ing.id] !== undefined;
                const displayLevel = hasPending ? pendingLevels[ing.id] : (ing.stockLevel || 0);
                return (
                  <div
                    key={ing.id}
                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_1fr] px-4 py-2.5 border-b border-[#1c1c1c] hover:bg-[#141414] transition-colors
                      ${hasPending ? 'bg-yellow-950/10' : ''}`}
                  >
                    <span className={`text-xs font-bold uppercase ${hasPending ? 'text-yellow-300' : 'text-[#e0e0e0]'}`}>{ing.name}</span>
                    <span className="text-[10px] text-[#666] uppercase">{ing.category}</span>
                    <span className="text-[10px] text-[#666]">{pref?.name || '—'}</span>
                    <span className="text-[10px] font-mono text-[#888]">{pref?.packUnit || '—'}</span>
                    <span className={`text-[10px] font-mono ${(ing.stockLevel || 0) === 0 ? 'text-red-500' : 'text-[#c8a96e]'}`}>
                      {ing.stockLevel || 0}
                    </span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={displayLevel}
                      onChange={e => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val !== (ing.stockLevel || 0)) {
                          setPendingLevels(prev => ({ ...prev, [ing.id]: val }));
                        } else {
                          setPendingLevels(prev => { const next = { ...prev }; delete next[ing.id]; return next; });
                        }
                      }}
                      className={`bg-transparent text-right font-mono text-xs w-20 outline-none border-b
                        ${hasPending ? 'border-yellow-500 text-yellow-300' : 'border-[#333] text-[#c8a96e]'} focus:border-[#c8a96e]`}
                    />
                    <span className="text-[10px] font-mono text-[#555]">£{unitCost.toFixed(4)}/{pref?.packUnit || 'u'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DELIVERIES ─────────────────────────────────────────────────── */}
        {tab === 'deliveries' && (
          <div className="p-6 max-w-5xl">
            {/* Delivery header fields */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 p-4 border border-[#333] bg-[#1c1c1c]">
              <div>
                <label className={UI_STYLES.label}>Date</label>
                <input type="date" className={`${UI_STYLES.input} w-full`} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
              </div>
              <div>
                <label className={UI_STYLES.label}>Invoice / Ref</label>
                <input className={`${UI_STYLES.input} w-full`} placeholder="INV-0001" value={deliveryRef} onChange={e => setDeliveryRef(e.target.value)} />
              </div>
              <div>
                <label className={UI_STYLES.label}>Supplier</label>
                <select className={`${UI_STYLES.input} w-full`} value={deliverySupplier} onChange={e => { setDeliverySupplier(e.target.value); setSupplierQtys({}); }}>
                  <option value="">— Select —</option>
                  {APPROVED_SUPPLIERS.map(s => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className={UI_STYLES.label}>Notes</label>
                <input className={`${UI_STYLES.input} w-full`} placeholder="Optional..." value={deliveryNotes} onChange={e => setDeliveryNotes(e.target.value)} />
              </div>
            </div>

            {/* Mode toggle */}
            <div className="flex border border-[#333] w-fit mb-6">
              {(['supplier', 'adhoc'] as DeliveryMode[]).map(m => (
                <button key={m} onClick={() => setDeliveryMode(m)}
                  className={`px-5 py-2 text-[10px] font-bold uppercase tracking-widest border-r last:border-r-0 border-[#333] transition-all
                    ${deliveryMode === m ? 'bg-[#005f73] text-white' : 'text-[#888] hover:bg-[#1c1c1c]'}`}>
                  {m === 'supplier' ? 'By Supplier' : 'Ad-hoc / Line-by-line'}
                </button>
              ))}
            </div>

            {/* ── By Supplier ── */}
            {deliveryMode === 'supplier' && (
              <>
                {!deliverySupplier ? (
                  <div className="text-[#555] text-xs font-mono p-8 border border-[#333] text-center">Select a supplier above to see their ingredients</div>
                ) : supplierIngredients.length === 0 ? (
                  <div className="text-[#555] text-xs font-mono p-8 border border-[#333] text-center">No ingredients found for {deliverySupplier}</div>
                ) : (
                  <div className="border border-[#333] bg-[#0d0d0d]">
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] border-b border-[#333] px-4 py-2 bg-[#1c1c1c]">
                      {['Ingredient', 'Pack Unit', 'Unit Cost', 'Current Stock', 'Qty Delivered'].map(h => (
                        <span key={h} className="text-[9px] font-bold uppercase text-[#666]">{h}</span>
                      ))}
                    </div>
                    {supplierIngredients.map(ing => {
                      const pref = ing.suppliers.find(s => s.name === deliverySupplier) || ing.suppliers[0];
                      const unitCost = pref ? pref.packCost / (pref.packSize || 1) : 0;
                      return (
                        <div key={ing.id} className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] px-4 py-2.5 border-b border-[#1c1c1c] hover:bg-[#141414]">
                          <span className="text-xs font-bold uppercase text-[#e0e0e0]">{ing.name}</span>
                          <span className="text-[10px] font-mono text-[#888]">{pref?.packUnit || '—'}</span>
                          <span className="text-[10px] font-mono text-[#c8a96e]">£{unitCost.toFixed(4)}</span>
                          <span className="text-[10px] font-mono text-[#666]">{ing.stockLevel || 0}</span>
                          <input
                            type="number" min="0" step="any"
                            value={supplierQtys[ing.id] || ''}
                            onChange={e => setSupplierQtys(prev => ({ ...prev, [ing.id]: e.target.value }))}
                            placeholder="0"
                            className="bg-transparent text-right font-mono text-xs w-20 outline-none border-b border-[#333] focus:border-[#c8a96e] text-[#c8a96e]"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ── Ad-hoc ── */}
            {deliveryMode === 'adhoc' && (
              <>
                <div className="flex gap-3 items-end flex-wrap mb-4 p-4 border border-[#333] bg-[#1c1c1c]">
                  <div className="flex-1 min-w-[200px]">
                    <label className={UI_STYLES.label}>Ingredient</label>
                    <IngredientSearch
                      ingredients={ingredients}
                      value={adhocIngredient?.name || ''}
                      onSelect={ing => {
                        setAdhocIngredient(ing);
                        const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
                        if (pref) { setAdhocUnit(pref.packUnit); setAdhocCost((pref.packCost / (pref.packSize || 1)).toFixed(4)); }
                      }}
                    />
                  </div>
                  <div>
                    <label className={UI_STYLES.label}>Qty</label>
                    <input type="number" min="0" step="any" className={`${UI_STYLES.input} w-24`} value={adhocQty} onChange={e => setAdhocQty(e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className={UI_STYLES.label}>Unit</label>
                    <select className={`${UI_STYLES.input} w-20`} value={adhocUnit} onChange={e => setAdhocUnit(e.target.value as Unit)}>
                      {(['g','kg','ml','l','ea'] as Unit[]).map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={UI_STYLES.label}>Unit Cost (£)</label>
                    <input type="number" min="0" step="any" className={`${UI_STYLES.input} w-28`} value={adhocCost} onChange={e => setAdhocCost(e.target.value)} placeholder="0.0000" />
                  </div>
                  <button
                    onClick={() => {
                      if (!adhocIngredient || !adhocQty || parseFloat(adhocQty) <= 0) return;
                      setAdhocLines(prev => [...prev, {
                        ingredientId: adhocIngredient.id,
                        name: adhocIngredient.name,
                        quantity: parseFloat(adhocQty),
                        unit: adhocUnit,
                        unitCost: parseFloat(adhocCost) || 0,
                      }]);
                      setAdhocIngredient(null); setAdhocQty(''); setAdhocCost('');
                    }}
                    className={`${UI_STYLES.button} bg-[#005f73] text-white border border-transparent hover:bg-[#004a5d]`}
                  >+ Add Line</button>
                </div>
                {adhocLines.length > 0 && (
                  <div className="border border-[#333] bg-[#0d0d0d] mb-4">
                    <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] border-b border-[#333] px-4 py-2 bg-[#1c1c1c]">
                      {['Ingredient', 'Qty', 'Unit', 'Line Total', ''].map(h => (
                        <span key={h} className="text-[9px] font-bold uppercase text-[#666]">{h}</span>
                      ))}
                    </div>
                    {adhocLines.map((l, i) => (
                      <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] px-4 py-2.5 border-b border-[#1c1c1c] items-center">
                        <span className="text-xs font-bold uppercase text-[#e0e0e0]">{l.name}</span>
                        <span className="text-[10px] font-mono text-[#c8a96e]">{l.quantity}</span>
                        <span className="text-[10px] font-mono text-[#888]">{l.unit}</span>
                        <span className="text-[10px] font-mono text-[#c8a96e]">£{(l.quantity * l.unitCost).toFixed(2)}</span>
                        <button onClick={() => setAdhocLines(prev => prev.filter((_, j) => j !== i))} className="text-[#444] hover:text-red-500 px-2">×</button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Footer: total + log button */}
            <div className="mt-6 flex items-center justify-between p-4 border border-[#333] bg-[#1c1c1c]">
              <div>
                <span className={UI_STYLES.label}>Delivery Total</span>
                <div className="font-mono text-xl text-[#c8a96e]">£{deliveryTotal.toFixed(2)}</div>
              </div>
              <button
                onClick={handleLogDelivery}
                disabled={isLoggingDelivery || deliveryTotal === 0}
                className={`${UI_STYLES.button} bg-[#005f73] text-white border border-transparent hover:bg-[#004a5d] disabled:opacity-30 px-8 py-3 text-sm`}
              >
                {isLoggingDelivery ? 'Logging...' : 'Log Delivery'}
              </button>
            </div>
          </div>
        )}

        {/* ── WASTE LOG ──────────────────────────────────────────────────── */}
        {tab === 'waste' && (
          <div className="p-6 max-w-3xl">
            <div className="p-4 border border-[#333] bg-[#1c1c1c] mb-6">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className={UI_STYLES.label}>Date</label>
                  <input type="date" className={`${UI_STYLES.input} w-full`} value={wasteDate} onChange={e => setWasteDate(e.target.value)} />
                </div>
                <div className="col-span-2">
                  <label className={UI_STYLES.label}>Ingredient</label>
                  <IngredientSearch
                    ingredients={ingredients}
                    value={wasteIngredient?.name || ''}
                    onSelect={ing => { setWasteIngredient(ing); const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0]; if (pref) setWasteUnit(pref.packUnit); }}
                  />
                </div>
                <div>
                  <label className={UI_STYLES.label}>Quantity</label>
                  <input type="number" min="0" step="any" className={`${UI_STYLES.input} w-full`} value={wasteQty} onChange={e => setWasteQty(e.target.value)} placeholder="0" />
                </div>
                <div>
                  <label className={UI_STYLES.label}>Unit</label>
                  <select className={`${UI_STYLES.input} w-full`} value={wasteUnit} onChange={e => setWasteUnit(e.target.value as Unit)}>
                    {(['g','kg','ml','l','ea'] as Unit[]).map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className={UI_STYLES.label}>Reason</label>
                  <select className={`${UI_STYLES.input} w-full`} value={wasteReason} onChange={e => setWasteReason(e.target.value)}>
                    {WASTE_REASONS.map(r => <option key={r}>{r}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={UI_STYLES.label}>Notes (optional)</label>
                  <input className={`${UI_STYLES.input} w-full`} placeholder="Additional details..." value={wasteNotes} onChange={e => setWasteNotes(e.target.value)} />
                </div>
              </div>
              <button
                onClick={handleLogWaste}
                disabled={isLoggingWaste || !wasteIngredient || !wasteQty || parseFloat(wasteQty) <= 0}
                className={`${UI_STYLES.button} bg-red-900 text-red-200 hover:bg-red-800 border border-red-800 disabled:opacity-30`}
              >
                {isLoggingWaste ? 'Logging...' : 'Record Waste'}
              </button>
            </div>

            {/* Today's waste */}
            {todayWaste.length > 0 && (
              <>
                <div className="text-[9px] font-bold uppercase text-[#666] mb-2">Today's Waste</div>
                <div className="border border-[#333] bg-[#0d0d0d]">
                  {todayWaste.map(m => {
                    const ing = ingredients.find(i => i.id === m.ingredientId);
                    return (
                      <div key={m.id} className="flex items-center px-4 py-2.5 border-b border-[#1c1c1c] last:border-0">
                        <span className="flex-1 text-xs font-bold uppercase text-[#e0e0e0]">{ing?.name || 'Unknown'}</span>
                        <span className="font-mono text-[10px] text-red-400 mr-4">{Math.abs(m.quantity)} {m.unit}</span>
                        <span className="text-[10px] text-[#666]">{m.notes}</span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── HISTORY ────────────────────────────────────────────────────── */}
        {tab === 'history' && (
          <div className="p-6">
            {/* Filters */}
            <div className="flex gap-3 flex-wrap items-end mb-4">
              <div>
                <label className={UI_STYLES.label}>From</label>
                <input type="date" className={`${UI_STYLES.input}`} value={historyFrom} onChange={e => setHistoryFrom(e.target.value)} />
              </div>
              <div>
                <label className={UI_STYLES.label}>To</label>
                <input type="date" className={`${UI_STYLES.input}`} value={historyTo} onChange={e => setHistoryTo(e.target.value)} />
              </div>
              <div>
                <label className={UI_STYLES.label}>Ingredient</label>
                <input className={`${UI_STYLES.input} w-40`} placeholder="Search..." value={historyIngredientSearch} onChange={e => setHistoryIngredientSearch(e.target.value)} />
              </div>
              <div className="flex gap-3 items-center ml-2">
                {Object.entries(TYPE_BADGE).map(([type, { label, color }]) => (
                  <label key={type} className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input type="checkbox" checked={historyTypes[type]} onChange={e => setHistoryTypes(prev => ({ ...prev, [type]: e.target.checked }))} className="accent-[#c8a96e]" />
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 ${color}`}>{label}</span>
                  </label>
                ))}
              </div>
              <span className="ml-auto text-[10px] font-mono text-[#555]">{filteredHistory.length} records</span>
            </div>

            {/* Table */}
            <div className="border border-[#333] bg-[#0d0d0d]">
              <div className="grid grid-cols-[120px_100px_2fr_100px_80px_1fr_1fr] border-b border-[#333] px-4 py-2 bg-[#1c1c1c]">
                {['Date', 'Type', 'Ingredient', 'Qty', 'Unit', 'Supplier / Reason', 'Invoice Ref'].map(h => (
                  <span key={h} className="text-[9px] font-bold uppercase text-[#666]">{h}</span>
                ))}
              </div>
              {filteredHistory.length === 0 ? (
                <div className="px-4 py-8 text-center text-[10px] font-mono text-[#555]">No records match the current filters</div>
              ) : filteredHistory.map(m => {
                const ing = ingredients.find(i => i.id === m.ingredientId);
                const badge = TYPE_BADGE[m.type] || TYPE_BADGE.adjustment;
                const linkedInvoice = m.invoiceId ? invoices.find(inv => inv.id === m.invoiceId) : null;
                const isExpanded = expandedInvoice === m.invoiceId && !!m.invoiceId;
                return (
                  <React.Fragment key={m.id}>
                    <div
                      className={`grid grid-cols-[120px_100px_2fr_100px_80px_1fr_1fr] px-4 py-2.5 border-b border-[#1c1c1c] hover:bg-[#141414] transition-colors
                        ${m.invoiceId ? 'cursor-pointer' : ''}`}
                      onClick={() => m.invoiceId && setExpandedInvoice(isExpanded ? null : m.invoiceId!)}
                    >
                      <span className="text-[10px] font-mono text-[#888]">{formatDate(m.date)}</span>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 w-fit h-fit ${badge.color}`}>{badge.label}</span>
                      <span className="text-xs font-bold uppercase text-[#e0e0e0]">{ing?.name || m.ingredientId}</span>
                      <span className={`text-[10px] font-mono ${m.quantity < 0 ? 'text-red-400' : 'text-green-400'}`}>
                        {m.quantity > 0 ? '+' : ''}{m.quantity}
                      </span>
                      <span className="text-[10px] font-mono text-[#888]">{m.unit}</span>
                      <span className="text-[10px] text-[#666]">{m.supplierName || m.notes || '—'}</span>
                      <span className="text-[10px] font-mono text-[#555]">{linkedInvoice?.reference || m.invoiceId?.slice(0, 8) || '—'}</span>
                    </div>
                    {/* Expanded invoice view */}
                    {isExpanded && linkedInvoice && (
                      <div className="col-span-full border-b border-[#333] bg-[#0a1a1a] px-8 py-3">
                        <div className="text-[9px] font-bold uppercase text-[#005f73] mb-2">Invoice: {linkedInvoice.reference || linkedInvoice.id.slice(0, 8)} — {linkedInvoice.supplier} — £{linkedInvoice.totalCost.toFixed(2)}</div>
                        {linkedInvoice.items.map((item, idx) => {
                          const lineIng = ingredients.find(i => i.id === item.ingredientId);
                          return (
                            <div key={idx} className="flex gap-8 text-[10px] font-mono text-[#888] py-0.5">
                              <span className="text-[#ccc] w-48">{lineIng?.name || item.ingredientId}</span>
                              <span>{item.quantity} {item.unit}</span>
                              <span>£{item.unitCost.toFixed(4)}/unit</span>
                              <span className="text-[#c8a96e]">£{(item.quantity * item.unitCost).toFixed(2)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}

        {/* ── INVOICE SCANNER ────────────────────────────────────────────────── */}
        {tab === 'invoice_scanner' && (
          <div className="p-6 text-center text-[#555]">
            <div className="flex flex-col items-center gap-4 py-16">
              <div className="text-[12px] font-bold text-[#666] uppercase tracking-[0.4em]">INVOICE_SCANNER</div>
              <button
                onClick={() => setShowInvoiceScanner(true)}
                className="px-8 py-4 bg-[#c8a96e] text-black text-[11px] font-bold uppercase tracking-widest hover:bg-[#d4b896] transition-all"
              >
                OPEN SCANNER
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Invoice Scanner Modal */}
      {showInvoiceScanner && (
        <InvoiceScanner onCancel={() => setShowInvoiceScanner(false)} />
      )}
    </div>
  );
};
