import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useIngredients, useRecipes, useDishes, useStockMutations, useStockMovements, useStocktakeReports, useStocktakeMutations, useStocktakeDraft, useStocktakeDraftMutations, useRecipeMutations, useIngredientMutations, useFoodTempChecksHistory, useEquipmentChecksHistory, todayCheckDate } from '../hooks/useKitchenData';
import { useStore } from '../store/useStore';
import { useAuth } from '../hooks/useAuth';
import { useBleScale, isWebBluetoothSupported } from '../hooks/useBleScale';
import { Search, Scale, FileText, CheckCircle2, X, Filter, Printer, Mail, ChevronDown, ChevronRight, BookOpen, ChefHat, PauseCircle } from 'lucide-react';
import { Ingredient, Recipe, RecipeItem, StocktakeReport, Unit } from '../types';
import { DRY_STORE_SUBCATEGORIES } from '../utils/ingredientAutofill';

interface ReportConfig {
  stockLevel: boolean;
  stockValue: boolean;
  category: boolean;
  wastePercent: boolean;
  allergens: boolean;
  kcal: boolean;
  supplier: boolean;
  includeWastage: boolean;
  scope: 'all' | 'menu' | 'nonzero';
}

const DEFAULT_REPORT_CONFIG: ReportConfig = {
  stockLevel: true,
  stockValue: true,
  category: true,
  wastePercent: false,
  allergens: false,
  kcal: false,
  supplier: false,
  includeWastage: true,
  scope: 'nonzero'
};
import { calculateIngredientCost } from '../utils/costing';

// Recursively collect all ingredient IDs referenced by a set of recipe items
function collectIngredientIds(items: RecipeItem[], allRecipes: Recipe[], visited = new Set<string>()): Set<string> {
  const ids = new Set<string>();
  for (const item of items ?? []) {
    if (item.type === 'ingredient' && item.ingredientId) {
      ids.add(item.ingredientId);
    } else if (item.type === 'recipe' && item.subRecipeId && !visited.has(item.subRecipeId)) {
      visited.add(item.subRecipeId);
      const sub = allRecipes.find(r => r.id === item.subRecipeId);
      if (sub) {
        collectIngredientIds(sub.items, allRecipes, visited).forEach(id => ids.add(id));
      }
    }
  }
  return ids;
}

function getIngredientUnitCostPer100g(ing: Ingredient): number {
  const pref = ing.suppliers?.find(s => s.isPreferred) ?? ing.suppliers?.[0];
  if (!pref) return 0;
  return calculateIngredientCost(ing, 100, 'g');
}

const CONTAINER_PROFILES = [
  { id: '10l_tub', name: '10L Tub', tareWeight: 322 },
  { id: '4l_tub', name: '4L Tub', tareWeight: 149 },
  { id: '2l_tub', name: '2L Tub', tareWeight: 98 },
  { id: '1l_tub', name: '1L Tub', tareWeight: 57 },
  { id: 'polycarb_half_deep', name: 'Polycarb 1/2 Gastro Deep', tareWeight: 753 },
  { id: 'polycarb_half_shallow', name: 'Polycarb 1/2 Gastro Shallow', tareWeight: 524 }
];

function getTareWeight(tareId: string | undefined): number {
  if (!tareId || tareId === 'none') return 0;
  return CONTAINER_PROFILES.find(c => c.id === tareId)?.tareWeight || 0;
}

function getContainerName(tareId: string | undefined): string {
  if (!tareId || tareId === 'none') return 'No tub';
  return CONTAINER_PROFILES.find(c => c.id === tareId)?.name || tareId;
}

interface ContainerReading {
  containerId: string;
  netGrams: number;
}

// Reads the live scale weight directly from the store so only this small status bar
// re-renders on each throttled BLE tick — the rest of the Stock Take modal (item list
// etc.) never subscribes to scaleWeightGrams and so never re-renders from scale ticks.
const ScaleStatusBar = React.memo(function ScaleStatusBar() {
  const scaleWeightGrams = useStore((state) => state.scaleWeightGrams);
  return (
    <div className="h-12 bg-surface border-b border-outline-variant flex items-center px-6 text-xs flex-shrink-0">
      <span className="text-outline uppercase label-caps text-[9px] mr-2">Raw Weight:</span>
      <span className="data-tabular font-bold">{scaleWeightGrams} g</span>
      <span className="text-[10px] text-outline ml-4">Pick each item's tub/container from the list below to auto-subtract its weight.</span>
    </div>
  );
});

interface StocktakeRecipeRowProps {
  rec: Recipe;
  scaleConnected: boolean;
  tareId: string;
  onTareChange: (recipeId: string, tareId: string) => void;
  isEditing: boolean;
  countValue: number | undefined;
  onCountChange: (recipeId: string, value: number) => void;
  onStartEdit: (recipeId: string) => void;
  onStopEdit: () => void;
  readings: ContainerReading[];
  onAddReading: (recipeId: string, tareId: string) => void;
  onRemoveReading: (recipeId: string, index: number) => void;
}

const StocktakeRecipeRow = React.memo(function StocktakeRecipeRow({
  rec, scaleConnected, tareId, onTareChange, isEditing, countValue, onCountChange, onStartEdit, onStopEdit, readings, onAddReading, onRemoveReading
}: StocktakeRecipeRowProps) {
  return (
    <div className="flex flex-col gap-2 p-3 sm:p-4 border border-primary/30 bg-secondary-container/20 rounded-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-semibold text-sm text-on-surface truncate flex items-center gap-1.5">
            <ChefHat className="h-3.5 w-3.5 text-primary flex-shrink-0" /> {rec.name}
          </span>
          <div className="text-[10px] text-outline uppercase tracking-wider mt-0.5">
            Prep Recipe • Current: {rec.stockLevel ?? 0} {rec.batchUnit}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scaleConnected && (
            <>
              <select value={tareId} onChange={e => onTareChange(rec.id, e.target.value)}
                className="px-2 py-2 border border-outline-variant bg-surface-container-lowest text-[11px] rounded-sm max-w-[110px] sm:max-w-none">
                <option value="none">No tub</option>
                {CONTAINER_PROFILES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => onAddReading(rec.id, tareId)}
                title="Add container reading (net of tare) to running total"
                className="h-10 w-10 flex-shrink-0 border border-outline flex items-center justify-center rounded-sm bg-surface hover:bg-surface-container">
                <Scale className="h-4 w-4" />
              </button>
            </>
          )}
          {isEditing ? (
            <input type="number" autoFocus value={countValue !== undefined ? countValue : (rec.stockLevel || '')}
              onChange={e => onCountChange(rec.id, parseFloat(e.target.value) || 0)}
              onBlur={onStopEdit}
              className="w-24 sm:w-28 px-3 py-2 border border-primary text-center data-tabular text-sm font-bold bg-surface-container-lowest" />
          ) : (
            <button onClick={() => onStartEdit(rec.id)}
              className="w-24 sm:w-28 px-3 py-2 border border-outline-variant text-center data-tabular text-sm font-bold bg-surface-container-lowest rounded-sm">
              {countValue !== undefined ? countValue : (rec.stockLevel || 0)}
            </button>
          )}
          <span className="text-xs text-outline w-8">{rec.batchUnit}</span>
        </div>
      </div>
      {readings.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pl-5">
          {readings.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-surface border border-outline-variant rounded-full pl-2 pr-1 py-0.5">
              {getContainerName(r.containerId)} {r.netGrams}g
              <button onClick={() => onRemoveReading(rec.id, i)} title="Remove this reading"
                className="h-3.5 w-3.5 flex items-center justify-center rounded-full hover:bg-error-container text-outline hover:text-error">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <span className="text-[10px] font-bold text-primary ml-1">
            {readings.length} container{readings.length > 1 ? 's' : ''} added
          </span>
        </div>
      )}
    </div>
  );
});

interface StocktakeIngredientRowProps {
  ing: Ingredient;
  isAlternateRow: boolean;
  scaleConnected: boolean;
  tareId: string;
  onTareChange: (ingredientId: string, tareId: string) => void;
  isEditing: boolean;
  countValue: number | undefined;
  onCountChange: (ingredientId: string, value: number) => void;
  onStartEdit: (ingredientId: string) => void;
  onStopEdit: () => void;
  readings: ContainerReading[];
  onAddReading: (ingredientId: string, tareId: string) => void;
  onRemoveReading: (ingredientId: string, index: number) => void;
}

const StocktakeIngredientRow = React.memo(function StocktakeIngredientRow({
  ing, isAlternateRow, scaleConnected, tareId, onTareChange, isEditing, countValue, onCountChange, onStartEdit, onStopEdit, readings, onAddReading, onRemoveReading
}: StocktakeIngredientRowProps) {
  return (
    <div className={`flex flex-col gap-2 p-3 sm:p-4 border border-outline-variant rounded-sm ${isAlternateRow ? 'bg-black/[0.0075]' : 'bg-transparent'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-semibold text-sm text-on-surface truncate block">{ing.name}</span>
          <div className="text-[10px] text-outline uppercase tracking-wider mt-0.5">
            {ing.category} • Current: {ing.stockLevel ?? 0}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scaleConnected && (
            <>
              <select value={tareId} onChange={e => onTareChange(ing.id, e.target.value)}
                className="px-2 py-2 border border-outline-variant bg-surface-container-lowest text-[11px] rounded-sm max-w-[110px] sm:max-w-none">
                <option value="none">No tub</option>
                {CONTAINER_PROFILES.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => onAddReading(ing.id, tareId)}
                title="Add container reading (net of tare) to running total"
                className="h-10 w-10 flex-shrink-0 border border-outline flex items-center justify-center rounded-sm bg-surface hover:bg-surface-container">
                <Scale className="h-4 w-4" />
              </button>
            </>
          )}
          {isEditing ? (
            <input type="number" autoFocus value={countValue !== undefined ? countValue : (ing.stockLevel || '')}
              onChange={e => onCountChange(ing.id, parseFloat(e.target.value) || 0)}
              onBlur={onStopEdit}
              className="w-24 sm:w-28 px-3 py-2 border border-primary text-center data-tabular text-sm font-bold bg-surface-container-lowest" />
          ) : (
            <button onClick={() => onStartEdit(ing.id)}
              className="w-24 sm:w-28 px-3 py-2 border border-outline-variant text-center data-tabular text-sm font-bold bg-surface-container-lowest rounded-sm">
              {countValue !== undefined ? countValue : (ing.stockLevel || 0)}
            </button>
          )}
        </div>
      </div>
      {readings.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap pl-0.5">
          {readings.map((r, i) => (
            <span key={i} className="inline-flex items-center gap-1 text-[10px] bg-secondary-container/40 border border-outline-variant rounded-full pl-2 pr-1 py-0.5">
              {getContainerName(r.containerId)} {r.netGrams}g
              <button onClick={() => onRemoveReading(ing.id, i)} title="Remove this reading"
                className="h-3.5 w-3.5 flex items-center justify-center rounded-full hover:bg-error-container text-outline hover:text-error">
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
          <span className="text-[10px] font-bold text-primary ml-1">
            {readings.length} container{readings.length > 1 ? 's' : ''} added
          </span>
        </div>
      )}
    </div>
  );
});

export const Stock: React.FC = () => {
  const { data: ingredients = [], isLoading } = useIngredients();
  const { data: recipes = [] } = useRecipes();
  const { data: dishes = [] } = useDishes();
  const { logMovement } = useStockMutations();
  const { data: wasteMovements = [] } = useStockMovements('waste');
  const { data: stocktakeReports = [] } = useStocktakeReports();
  const { saveReport } = useStocktakeMutations();
  const { data: stocktakeDraft, isLoading: isDraftLoading } = useStocktakeDraft();
  const { saveDraft, clearDraft } = useStocktakeDraftMutations();
  const { updateRecipe } = useRecipeMutations();
  const { updateIngredient } = useIngredientMutations();
  const { data: foodTempChecks = [] } = useFoodTempChecksHistory();
  const { data: equipmentTempChecks = [] } = useEquipmentChecksHistory();
  const { appUser } = useAuth();

  const scaleConnected = useStore((state) => state.scaleConnected);
  const showToast = useStore((state) => state.showToast);
  const setScaleConnected = useStore((state) => state.setScaleConnected);
  const setScaleWeight = useStore((state) => state.setScaleWeight);
  const selectedIngredientId = useStore((state) => state.selectedIngredientId);
  const selectIngredient = useStore((state) => state.selectIngredient);

  const bleScale = useBleScale({ onWeight: (grams) => setScaleWeight(grams) });
  useEffect(() => { setScaleConnected(bleScale.connected); }, [bleScale.connected, setScaleConnected]);
  useEffect(() => {
    if (bleScale.error) showToast(bleScale.error, 'error');
  }, [bleScale.error, showToast]);

  const [showWastePanel, setShowWastePanel] = useState(false);
  const [showStockTake, setShowStockTake] = useState(false);
  const [showEposImport, setShowEposImport] = useState(false);
  const [showWastageHistory, setShowWastageHistory] = useState(false);
  const [showReports, setShowReports] = useState(false);
  const [showReportConfig, setShowReportConfig] = useState(false);
  const [reportConfig, setReportConfig] = useState<ReportConfig>(DEFAULT_REPORT_CONFIG);

  // Stock on hand directory
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [selectedStockCategory, setSelectedStockCategory] = useState('All');
  const [editingCounts, setEditingCounts] = useState<Record<string, string>>({});

  // Waste log entry
  const [wasteIngId, setWasteIngId] = useState('');
  const [wasteQty, setWasteQty] = useState(0);
  const [wasteUnit, setWasteUnit] = useState<Unit>('g');
  const [wasteReason, setWasteReason] = useState('Spoil');

  // Wastage history filters
  const [wasteDateFrom, setWasteDateFrom] = useState('');
  const [wasteDateTo, setWasteDateTo] = useState('');
  const [wasteIngFilter, setWasteIngFilter] = useState('');

  // Stock take
  const [activeLocation, setActiveLocation] = useState('All');
  const [dryStoreSubCategory, setDryStoreSubCategory] = useState('All');
  const [stockCounts, setStockCounts] = useState<Record<string, number>>({});
  const [recipeCounts, setRecipeCounts] = useState<Record<string, number>>({});
  const [itemTareIds, setItemTareIds] = useState<Record<string, string>>({});
  // Per-item list of individual container weigh-ins that sum to stockCounts/recipeCounts —
  // lets a chef add several containers of the same item as a running total instead of one
  // overwrite-only reading. Keyed the same as stockCounts (ingredient id) or itemTareIds
  // (`recipe-${id}`) for recipes. Mirrored into a ref so add/remove handlers can read the
  // latest list synchronously without depending on (and re-creating) on every reading.
  const [itemReadings, setItemReadings] = useState<Record<string, ContainerReading[]>>({});
  const itemReadingsRef = useRef<Record<string, ContainerReading[]>>({});
  const [menuOnlyMode, setMenuOnlyMode] = useState(false);
  const [stocktakeSearch, setStocktakeSearch] = useState('');
  const [editingCountKey, setEditingCountKey] = useState<string | null>(null);
  // Whether the counts currently in state came from resuming a paused draft
  // (rather than starting fresh) — drives the "Resuming stocktake..." banner.
  const [resumedDraftInfo, setResumedDraftInfo] = useState<{ updatedAt: string; updatedByName?: string } | null>(null);
  const draftHydratedRef = useRef(false);

  // On opening Stock Take, if there's a paused draft on Firestore, load it into
  // local state exactly once so a chef can resume counting where they (or someone
  // on a different device) left off, rather than starting over from ing.stockLevel.
  useEffect(() => {
    if (!showStockTake || draftHydratedRef.current || isDraftLoading) return;
    draftHydratedRef.current = true;
    if (stocktakeDraft) {
      setStockCounts(stocktakeDraft.stockCounts);
      setRecipeCounts(stocktakeDraft.recipeCounts);
      setItemTareIds(stocktakeDraft.itemTareIds);
      itemReadingsRef.current = stocktakeDraft.itemReadings;
      setItemReadings(stocktakeDraft.itemReadings);
      if (stocktakeDraft.menuOnlyMode) setMenuOnlyMode(true);
      setResumedDraftInfo({ updatedAt: stocktakeDraft.updatedAt, updatedByName: stocktakeDraft.updatedByName });
    }
  }, [showStockTake, stocktakeDraft, isDraftLoading]);

  // EPOS
  const [eposFile, setEposFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [varianceReport, setVarianceReport] = useState<{
    name: string; projected: number; actual: number; variance: number; unit: string; costLoss: number;
  }[] | null>(null);

  // ── Feature 1: cascade live menu → ingredient IDs ─────────────────────────
  const menuIngredientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const dish of dishes.filter(d => (d as any).isLive)) {
      for (const item of (dish.items ?? [])) {
        if (item.type === 'ingredient' && item.ingredientId) {
          ids.add(item.ingredientId);
        } else if (item.type === 'recipe' && item.subRecipeId) {
          const recipe = recipes.find(r => r.id === item.subRecipeId);
          if (recipe) collectIngredientIds(recipe.items, recipes).forEach(id => ids.add(id));
        }
      }
    }
    return ids;
  }, [dishes, recipes]);

  // ── Feature 2: wastage history calculations ────────────────────────────────
  const ingMap = useMemo(() => new Map(ingredients.map(i => [i.id, i])), [ingredients]);

  const filteredWaste = useMemo(() => {
    return wasteMovements.filter(m => {
      if (wasteDateFrom && m.date < wasteDateFrom) return false;
      if (wasteDateTo && m.date > wasteDateTo) return false;
      if (wasteIngFilter) {
        const name = ingMap.get(m.ingredientId)?.name?.toLowerCase() ?? '';
        if (!name.includes(wasteIngFilter.toLowerCase())) return false;
      }
      return true;
    });
  }, [wasteMovements, wasteDateFrom, wasteDateTo, wasteIngFilter, ingMap]);

  const wasteTotalCost = useMemo(() => {
    return filteredWaste.reduce((sum, m) => {
      const ing = ingMap.get(m.ingredientId);
      if (!ing) return sum;
      const qty = Math.abs(m.quantity);
      return sum + calculateIngredientCost(ing, qty, 'g', ingredients);
    }, 0);
  }, [filteredWaste, ingMap]);

  // ── Stocktake helpers ──────────────────────────────────────────────────────
  const stocktakeIngredients = useMemo(() => {
    let base = activeLocation === 'All' || activeLocation === 'Prep'
      ? (activeLocation === 'Prep' ? [] : ingredients)
      : ingredients.filter(i => i.category === activeLocation);
    if (activeLocation === 'Dry Store' && dryStoreSubCategory !== 'All') {
      base = base.filter(i => (i.subCategory || 'Other') === dryStoreSubCategory);
    }
    if (menuOnlyMode) {
      base = base.filter(i => menuIngredientIds.has(i.id));
    }
    if (stocktakeSearch.trim()) {
      const q = stocktakeSearch.trim().toLowerCase();
      base = base.filter(i => i.name.toLowerCase().includes(q));
    }
    return base;
  }, [ingredients, activeLocation, dryStoreSubCategory, menuOnlyMode, menuIngredientIds, stocktakeSearch]);

  // Recipes prepped in batches (e.g. Mash Potato) that are directly used as a component
  // of a currently-live dish — these get their own stock-take line alongside raw ingredients.
  const liveRecipeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const dish of dishes.filter(d => (d as any).isLive)) {
      for (const item of (dish.items ?? [])) {
        if (item.type === 'recipe' && item.subRecipeId) ids.add(item.subRecipeId);
      }
    }
    return ids;
  }, [dishes]);

  const stocktakeRecipes = useMemo(() => {
    if (activeLocation !== 'All' && activeLocation !== 'Prep') return [];
    let base = recipes.filter(r => liveRecipeIds.has(r.id));
    if (stocktakeSearch.trim()) {
      const q = stocktakeSearch.trim().toLowerCase();
      base = base.filter(r => r.name.toLowerCase().includes(q));
    }
    return base;
  }, [recipes, liveRecipeIds, activeLocation, stocktakeSearch]);

  // Stable row-callback handlers — passed as props to memoized rows so their identity
  // never changes across renders, which is required for React.memo to actually skip re-renders.
  const handleTareChange = useCallback((key: string, tareId: string) => {
    setItemTareIds(prev => ({ ...prev, [key]: tareId }));
  }, []);
  // Manually typing a count overrides any accumulated container readings for that item —
  // once someone types a number directly it's a manual total, not a sum of weigh-ins.
  const handleIngredientCountChange = useCallback((id: string, value: number) => {
    itemReadingsRef.current = { ...itemReadingsRef.current, [id]: [] };
    setItemReadings(itemReadingsRef.current);
    setStockCounts(prev => ({ ...prev, [id]: value }));
  }, []);
  const handleRecipeCountChange = useCallback((id: string, value: number) => {
    const key = `recipe-${id}`;
    itemReadingsRef.current = { ...itemReadingsRef.current, [key]: [] };
    setItemReadings(itemReadingsRef.current);
    setRecipeCounts(prev => ({ ...prev, [id]: value }));
  }, []);
  const handleStartEdit = useCallback((key: string) => setEditingCountKey(key), []);
  const handleStopEdit = useCallback(() => setEditingCountKey(null), []);

  // Adds one container's net weight (scale reading minus its tare) to the ingredient's
  // running total, rather than overwriting — lets a chef weigh several tubs of the same
  // item in sequence. itemReadingsRef is read/written synchronously so the summed total
  // is always correct even if this fires again before a re-render lands.
  const handleAddIngredientReading = useCallback((id: string, tareId: string) => {
    const rawGrams = useStore.getState().scaleWeightGrams;
    const net = Math.max(0, rawGrams - getTareWeight(tareId));
    const list = [...(itemReadingsRef.current[id] || []), { containerId: tareId, netGrams: net }];
    itemReadingsRef.current = { ...itemReadingsRef.current, [id]: list };
    setItemReadings(itemReadingsRef.current);
    setStockCounts(prev => ({ ...prev, [id]: list.reduce((s, r) => s + r.netGrams, 0) }));
  }, []);
  const handleRemoveIngredientReading = useCallback((id: string, index: number) => {
    const list = (itemReadingsRef.current[id] || []).filter((_, i) => i !== index);
    itemReadingsRef.current = { ...itemReadingsRef.current, [id]: list };
    setItemReadings(itemReadingsRef.current);
    setStockCounts(prev => ({ ...prev, [id]: list.reduce((s, r) => s + r.netGrams, 0) }));
  }, []);

  const handleAddRecipeReading = useCallback((id: string, tareId: string) => {
    const key = `recipe-${id}`;
    const rec = recipes.find(r => r.id === id);
    const rawGrams = useStore.getState().scaleWeightGrams;
    const net = Math.max(0, rawGrams - getTareWeight(tareId));
    const list = [...(itemReadingsRef.current[key] || []), { containerId: tareId, netGrams: net }];
    itemReadingsRef.current = { ...itemReadingsRef.current, [key]: list };
    setItemReadings(itemReadingsRef.current);
    const totalGrams = list.reduce((s, r) => s + r.netGrams, 0);
    const totalInBatchUnit = rec && (rec.batchUnit === 'kg' || rec.batchUnit === 'l') ? totalGrams / 1000 : totalGrams;
    setRecipeCounts(prev => ({ ...prev, [id]: totalInBatchUnit }));
  }, [recipes]);
  const handleRemoveRecipeReading = useCallback((id: string, index: number) => {
    const key = `recipe-${id}`;
    const rec = recipes.find(r => r.id === id);
    const list = (itemReadingsRef.current[key] || []).filter((_, i) => i !== index);
    itemReadingsRef.current = { ...itemReadingsRef.current, [key]: list };
    setItemReadings(itemReadingsRef.current);
    const totalGrams = list.reduce((s, r) => s + r.netGrams, 0);
    const totalInBatchUnit = rec && (rec.batchUnit === 'kg' || rec.batchUnit === 'l') ? totalGrams / 1000 : totalGrams;
    setRecipeCounts(prev => ({ ...prev, [id]: totalInBatchUnit }));
  }, [recipes]);

  const isSaving = logMovement.isPending || saveReport.isPending;

  const handleSaveWaste = async () => {
    if (!wasteIngId || wasteQty <= 0) return;
    const ingName = ingredients.find(i => i.id === wasteIngId)?.name || 'Ingredient';
    try {
      await logMovement.mutateAsync({
        ingredientId: wasteIngId,
        type: 'waste',
        quantity: -Math.abs(wasteQty),
        date: new Date().toISOString().slice(0, 10),
        costValue: 0,
        notes: wasteReason
      });
      showToast(`Waste logged: ${ingName} (${wasteQty}${wasteUnit})`, 'success');
      setShowWastePanel(false);
      setWasteIngId(''); setWasteQty(0);
    } catch (err: any) {
      showToast(err.message || 'Failed to log waste', 'error');
    }
  };

  // ── Feature 3: commit stocktake + save report ──────────────────────────────
  const handleCommitStockTake = async () => {
    try {
      let adjustmentCount = 0;
      let totalValue = 0;
      const counts: Record<string, number> = {};

      for (const [ingId, count] of Object.entries(stockCounts)) {
        const ing = ingredients.find(i => i.id === ingId);
        if (!ing) continue;
        counts[ingId] = count;
        totalValue += calculateIngredientCost(ing, count, 'g', ingredients);
        const delta = count - (ing.stockLevel || 0);
        if (delta !== 0) {
          await logMovement.mutateAsync({
            ingredientId: ingId,
            type: 'stock_take',
            quantity: delta,
            date: new Date().toISOString().slice(0, 10),
            costValue: 0
          });
          adjustmentCount++;
        }

        // Remember whichever container was used for the most recent scale
        // reading on this ingredient, so next stocktake pre-selects it —
        // only once it's actually committed, so an added-then-undone
        // reading never overwrites what's remembered.
        const lastReading = itemReadingsRef.current[ingId]?.slice(-1)[0];
        if (lastReading && lastReading.containerId !== 'none' && lastReading.containerId !== ing.defaultContainerId) {
          await updateIngredient.mutateAsync({ id: ingId, data: { defaultContainerId: lastReading.containerId } });
        }
      }

      // Save the report snapshot
      await saveReport.mutateAsync({
        date: new Date().toISOString().slice(0, 10),
        counts,
        totalValue,
        itemCount: Object.keys(counts).length,
        menuOnly: menuOnlyMode
      });

      // Persist counted prep-recipe batches (e.g. Mash Potato)
      for (const [recipeId, count] of Object.entries(recipeCounts)) {
        const rec = recipes.find(r => r.id === recipeId);
        if (!rec || count === (rec.stockLevel ?? 0)) continue;
        await updateRecipe.mutateAsync({ id: recipeId, data: { stockLevel: count } });
        adjustmentCount++;
      }

      // Clear any paused draft now that it's been fully committed — if none
      // existed this is a harmless no-op delete.
      if (stocktakeDraft) {
        await clearDraft.mutateAsync();
      }

      showToast(
        adjustmentCount > 0
          ? `Stock take committed — ${adjustmentCount} adjustments saved`
          : 'Stock take committed — no changes needed',
        'success'
      );
      setShowStockTake(false);
      setStockCounts({});
      setRecipeCounts({});
      itemReadingsRef.current = {};
      setItemReadings({});
      setStocktakeSearch('');
      setEditingCountKey(null);
      setResumedDraftInfo(null);
      draftHydratedRef.current = false;
    } catch (err: any) {
      showToast(err.message || 'Failed to commit stock take', 'error');
    }
  };

  // Save current progress to Firestore as a draft and exit the modal — lets a
  // chef step away mid-count (or hand the tablet to someone else) and resume
  // later exactly where they left off, on any device, instead of being stuck
  // in the modal until the whole stocktake is finished or losing everything
  // via Cancel.
  const handlePauseStockTake = async () => {
    try {
      await saveDraft.mutateAsync({
        stockCounts,
        recipeCounts,
        itemTareIds,
        itemReadings: itemReadingsRef.current,
        menuOnlyMode,
        updatedAt: new Date().toISOString(),
        updatedByName: appUser?.displayName || appUser?.email || undefined
      });
      showToast('Stock take paused — resume any time from Stock Take', 'success');
      setShowStockTake(false);
      setStockCounts({});
      setRecipeCounts({});
      itemReadingsRef.current = {};
      setItemReadings({});
      setStocktakeSearch('');
      setEditingCountKey(null);
      setResumedDraftInfo(null);
      draftHydratedRef.current = false;
    } catch (err: any) {
      showToast(err.message || 'Failed to pause stock take', 'error');
    }
  };

  // Discard everything — both the in-progress local counts and any paused
  // draft on Firestore, so Cancel always means "throw this stocktake away."
  const handleCancelStockTake = async () => {
    setShowStockTake(false);
    setStockCounts({});
    setRecipeCounts({});
    itemReadingsRef.current = {};
    setItemReadings({});
    setStocktakeSearch('');
    setEditingCountKey(null);
    setResumedDraftInfo(null);
    draftHydratedRef.current = false;
    if (stocktakeDraft) {
      try {
        await clearDraft.mutateAsync();
      } catch (err: any) {
        showToast(err.message || 'Failed to discard paused stock take', 'error');
      }
    }
  };

  // ── Feature 3b: generate snapshot report from current stock ───────────────
  const handleGenerateReport = async (cfg: ReportConfig) => {
    const scopedIngredients = ingredients.filter(ing => {
      if (cfg.scope === 'nonzero') return (ing.stockLevel ?? 0) > 0;
      if (cfg.scope === 'menu') return menuIngredientIds.has(ing.id);
      return true;
    });

    const counts: Record<string, number> = {};
    let totalValue = 0;
    for (const ing of scopedIngredients) {
      const level = ing.stockLevel ?? 0;
      counts[ing.id] = level;
      if (cfg.stockValue) totalValue += calculateIngredientCost(ing, level, 'g', ingredients);
    }

    const columns = Object.entries(cfg)
      .filter(([k, v]) => v === true && k !== 'includeWastage')
      .map(([k]) => k);

    let wastageTotal: number | undefined;
    let wastageCount: number | undefined;
    if (cfg.includeWastage) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const recentWaste = wasteMovements.filter(m => m.date >= cutoffStr);
      wastageCount = recentWaste.length;
      wastageTotal = recentWaste.reduce((sum, m) => {
        const ing = ingMap.get(m.ingredientId);
        return sum + (ing ? calculateIngredientCost(ing, Math.abs(m.quantity), 'g', ingredients) : 0);
      }, 0);
    }

    try {
      await saveReport.mutateAsync({
        date: new Date().toISOString().slice(0, 10),
        counts,
        totalValue,
        itemCount: Object.keys(counts).length,
        type: 'snapshot',
        columns,
        scope: cfg.scope,
        wastageTotal,
        wastageCount
      });
      showToast('Report generated', 'success');
      setShowReportConfig(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to generate report', 'error');
    }
  };

  // ── Reports: print + email ─────────────────────────────────────────────────
  const getReportRecipients = (): string[] => {
    try { return JSON.parse(localStorage.getItem('reportRecipients') || '[]'); } catch { return []; }
  };

  const handlePrintReport = (report: StocktakeReport) => {
    const cols = report.columns ?? ['stockLevel', 'stockValue', 'category'];
    const showCategory  = cols.includes('category');
    const showLevel     = cols.includes('stockLevel');
    const showValue     = cols.includes('stockValue');
    const showWaste     = cols.includes('wastePercent');
    const showAllergens = cols.includes('allergens');
    const showKcal      = cols.includes('kcal');
    const showSupplier  = cols.includes('supplier');

    const headerCells = [
      '<th>Ingredient</th>',
      showCategory  ? '<th>Category</th>'       : '',
      showLevel     ? '<th style="text-align:right">Stock Level</th>' : '',
      showValue     ? '<th style="text-align:right">Value (£)</th>'   : '',
      showWaste     ? '<th style="text-align:right">Waste %</th>'     : '',
      showAllergens ? '<th>Allergens</th>'       : '',
      showKcal      ? '<th style="text-align:right">kcal/100g</th>'   : '',
      showSupplier  ? '<th>Supplier</th>'        : ''
    ].join('');

    const rows = Object.entries(report.counts).map(([id, count]) => {
      const ing = ingMap.get(id);
      const value = (ing && showValue) ? calculateIngredientCost(ing, count, 'g', ingredients) : 0;
      const pref = ing?.suppliers?.find(s => s.isPreferred) ?? ing?.suppliers?.[0];
      return `<tr>
        <td>${ing?.name ?? id}</td>
        ${showCategory  ? `<td>${ing?.category ?? ''}</td>` : ''}
        ${showLevel     ? `<td style="text-align:right">${count}</td>` : ''}
        ${showValue     ? `<td style="text-align:right">£${value.toFixed(2)}</td>` : ''}
        ${showWaste     ? `<td style="text-align:right">${ing?.wastePercent ?? 0}%</td>` : ''}
        ${showAllergens ? `<td>${(ing?.allergens ?? []).join(', ') || '—'}</td>` : ''}
        ${showKcal      ? `<td style="text-align:right">${ing?.kcalPer100 ?? '—'}</td>` : ''}
        ${showSupplier  ? `<td>${pref?.name ?? '—'}</td>` : ''}
      </tr>`;
    }).join('');

    const scopeLabel = report.scope === 'menu' ? 'Menu items only' : report.scope === 'nonzero' ? 'Items with stock' : 'All ingredients';
    const wastageSection = report.wastageTotal !== undefined
      ? `<h2 style="margin-top:24px;font-size:14px">Wastage (last 7 days)</h2>
         <p>${report.wastageCount ?? 0} entries · Total cost: <strong>£${report.wastageTotal.toFixed(2)}</strong></p>`
      : '';

    const win = window.open('', '_blank');
    if (!win) return;
    const colSpan = [true, showCategory, showLevel, showValue, showWaste, showAllergens, showKcal, showSupplier].filter(Boolean).length;
    win.document.write(`<!DOCTYPE html><html><head><title>${report.type === 'snapshot' ? 'Stock Report' : 'Stock Take'} ${report.date}</title>
      <style>body{font-family:sans-serif;font-size:12px;padding:20px}h1{font-size:16px}h2{font-size:14px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ccc;padding:6px 8px}th{background:#f5f5f5;text-align:left}tfoot td{font-weight:bold}</style>
      </head><body>
      <h1>${report.type === 'snapshot' ? 'Stock Report' : 'Stock Take'} — ${report.date}</h1>
      <p>${report.itemCount} items · ${scopeLabel} · Stock value: £${report.totalValue.toFixed(2)}</p>
      <table><thead><tr>${headerCells}</tr></thead>
      <tbody>${rows}</tbody>
      ${showValue ? `<tfoot><tr><td colspan="${colSpan - 1}">Total</td><td style="text-align:right">£${report.totalValue.toFixed(2)}</td></tr></tfoot>` : ''}
      </table>
      ${wastageSection}
      </body></html>`);
    win.document.close();
    win.print();
  };

  const handleEmailReport = (report: StocktakeReport) => {
    const recipients = getReportRecipients();
    const lines = Object.entries(report.counts)
      .map(([id, count]) => `  ${ingMap.get(id)?.name ?? id}: ${count}`)
      .join('\n');
    const subject = `Stock Take Report — ${report.date}`;
    const body = `Stock Take: ${report.date}\n${report.itemCount} items · Total value: £${report.totalValue.toFixed(2)}${report.menuOnly ? ' (menu items only)' : ''}\n\n${lines}`;
    window.location.href = `mailto:${recipients.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // Today's food + equipment temp checks, merged and sorted for the daily
  // HACCP log — same print/email pattern as the stock reports above.
  const todaysComplianceRows = useMemo(() => {
    const today = todayCheckDate();
    const food = foodTempChecks
      .filter(r => r.checkDate === today)
      .map(r => ({ time: r.checkedAt, item: r.itemName, detail: `${r.checkType} (min ${r.requiredMinC}°C)`, temp: r.temperatureC, pass: r.pass, user: r.userDisplayName }));
    const equipment = equipmentTempChecks
      .filter(r => r.checkDate === today)
      .map(r => ({ time: r.checkedAt, item: r.equipmentName, detail: `Equipment (${r.minC}°C to ${r.maxC}°C)`, temp: r.temperatureC, pass: r.pass, user: r.userDisplayName }));
    return [...food, ...equipment].sort((a, b) => a.time.localeCompare(b.time));
  }, [foodTempChecks, equipmentTempChecks]);

  const handlePrintComplianceReport = () => {
    const today = todayCheckDate();
    const rows = todaysComplianceRows.map(r => `<tr>
      <td>${new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
      <td>${r.item}</td>
      <td>${r.detail}</td>
      <td style="text-align:right">${r.temp}&deg;C</td>
      <td>${r.pass ? 'Pass' : 'Fail'}</td>
      <td>${r.user}</td>
    </tr>`).join('');

    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Compliance Temp Log ${today}</title>
      <style>body{font-family:sans-serif;font-size:12px;padding:20px}h1{font-size:16px}table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border:1px solid #ccc;padding:6px 8px}th{background:#f5f5f5;text-align:left}</style>
      </head><body>
      <h1>Compliance Temperature Log — ${today}</h1>
      <p>${todaysComplianceRows.length} checks recorded</p>
      <table><thead><tr><th>Time</th><th>Item</th><th>Check</th><th style="text-align:right">Temp</th><th>Result</th><th>Checked By</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6">No checks recorded today.</td></tr>'}</tbody>
      </table>
      </body></html>`);
    win.document.close();
    win.print();
  };

  const handleEmailComplianceReport = () => {
    const recipients = getReportRecipients();
    const today = todayCheckDate();
    const lines = todaysComplianceRows
      .map(r => `  ${new Date(r.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${r.item} — ${r.detail} — ${r.temp}°C — ${r.pass ? 'Pass' : 'Fail'} — ${r.user}`)
      .join('\n');
    const subject = `Compliance Temperature Log — ${today}`;
    const body = `Compliance Temperature Log: ${today}\n${todaysComplianceRows.length} checks recorded\n\n${lines || '  No checks recorded today.'}`;
    window.location.href = `mailto:${recipients.join(',')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  const handleSaveSingleAdjustment = async (ing: Ingredient) => {
    const typedVal = editingCounts[ing.id];
    if (typedVal === undefined) return;
    const newCount = parseFloat(typedVal) || 0;
    const delta = newCount - (ing.stockLevel || 0);
    if (delta !== 0) {
      try {
        await logMovement.mutateAsync({
          ingredientId: ing.id, type: 'adjustment', quantity: delta,
          date: new Date().toISOString().slice(0, 10), costValue: 0
        });
        showToast(`Adjusted ${ing.name} to ${newCount}`, 'success');
        setEditingCounts(prev => { const n = { ...prev }; delete n[ing.id]; return n; });
        selectIngredient(null);
      } catch (err: any) {
        showToast(err.message || 'Failed to save adjustment', 'error');
      }
    }
  };

  const filteredStockIngredients = useMemo(() => {
    return ingredients.filter(ing => {
      const q = stockSearchQuery.toLowerCase();
      const matchesSearch = ing.name.toLowerCase().includes(q) || ing.category.toLowerCase().includes(q);
      if (selectedStockCategory === 'All') return matchesSearch;
      return matchesSearch && ing.category === selectedStockCategory;
    });
  }, [ingredients, stockSearchQuery, selectedStockCategory]);

  useEffect(() => {
    if (selectedIngredientId) {
      setStockSearchQuery(''); setSelectedStockCategory('All');
      setTimeout(() => {
        document.getElementById(`stock-row-${selectedIngredientId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    }
  }, [selectedIngredientId]);

  const handleRunEposImport = () => {
    if (!eposFile) return;
    setImporting(true);
    setTimeout(() => {
      setVarianceReport([
        { name: 'Beef Mince', projected: 4500, actual: 3000, variance: -1500, unit: 'g', costLoss: 13.50 },
        { name: 'Double Cream', projected: 1200, actual: 1200, variance: 0, unit: 'ml', costLoss: 0 },
        { name: 'Maris Piper Potatoes', projected: 25, actual: 15, variance: -10, unit: 'kg', costLoss: 8.10 },
        { name: 'Red Wine', projected: 1500, actual: 1400, variance: -100, unit: 'ml', costLoss: 1.60 }
      ]);
      setImporting(false);
    }, 1500);
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-container-lowest">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const categories = ['All', 'Prep', 'Dry Store', 'Dairy', 'Meat', 'Fish', 'Vegetable', 'Fruit', 'Frozen', 'Alcohol'];

  // Merge prep recipes + ingredients into one list for virtualization (weak-device DOM-node budget).
  type StocktakeRow =
    | { kind: 'recipe'; rec: Recipe }
    | { kind: 'ingredient'; ing: Ingredient; isAlternateRow: boolean };
  const stocktakeRows: StocktakeRow[] = useMemo(() => [
    ...stocktakeRecipes.map((rec): StocktakeRow => ({ kind: 'recipe', rec })),
    ...stocktakeIngredients.map((ing, idx): StocktakeRow => ({ kind: 'ingredient', ing, isAlternateRow: idx % 2 === 1 }))
  ], [stocktakeRecipes, stocktakeIngredients]);

  const stocktakeScrollRef = useRef<HTMLDivElement>(null);
  const stocktakeRowVirtualizer = useVirtualizer({
    count: stocktakeRows.length,
    getScrollElement: () => stocktakeScrollRef.current,
    estimateSize: () => 84,
    overscan: 8,
  });

  return (
    <div className="p-4 sm:p-8 h-full overflow-y-auto flex flex-col gap-4 sm:gap-8 bg-surface-container-lowest">

      {/* 1. CONTROL BAR */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 border-b border-outline-variant pb-4">
        <div>
          <h2 className="headline-sm font-semibold">Stock Ledger & Audits</h2>
          <span className="text-xs text-outline label-caps">EPOS COMPONENT WATERFALL</span>
        </div>
        <div className="flex gap-3 flex-wrap sm:justify-end">
          <button onClick={() => setShowReports(true)}
            className="h-10 px-4 border border-outline-variant text-xs font-bold label-caps rounded-sm hover:bg-surface-container flex items-center gap-1.5">
            <BookOpen className="h-4 w-4" /> Reports
          </button>
          <button onClick={() => setShowWastageHistory(true)}
            className="h-10 px-4 border border-outline-variant text-xs font-bold label-caps rounded-sm hover:bg-surface-container flex items-center gap-1.5">
            <Filter className="h-4 w-4" /> Waste History
          </button>
          <button onClick={() => setShowEposImport(true)}
            className="h-10 px-4 border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container">
            Import EPOS Sales
          </button>
          <button onClick={() => setShowWastePanel(true)}
            className="h-10 px-4 border border-error text-error text-xs font-bold label-caps rounded-sm hover:bg-error-container">
            Log Waste
          </button>
          <button onClick={() => setShowStockTake(true)}
            className="relative h-10 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90">
            {stocktakeDraft ? 'Resume Stock Take' : 'Stock Take'}
            {stocktakeDraft && (
              <span className="absolute -top-1.5 -right-1.5 h-3 w-3 rounded-full bg-amber-400 border-2 border-surface-container-lowest" title="A paused stock take is waiting to be resumed" />
            )}
          </button>
        </div>
      </div>

      {/* 2. SUMMARY GRID */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
        <div className="bg-surface border border-outline-variant p-6 rounded-sm">
          <h3 className="label-caps text-outline font-bold mb-4">Pantry Inventory Value</h3>
          <div className="display-lg text-primary data-tabular">£1,840.40</div>
          <span className="text-xs text-secondary mt-1 block">Value of stock currently inside the kitchen</span>
        </div>
        <div className="bg-surface border border-outline-variant p-6 rounded-sm">
          <h3 className="label-caps text-outline font-bold mb-4">Recent Wastage (Weekly)</h3>
          <div className="display-lg text-error data-tabular">£23.20</div>
          <span className="text-xs text-error mt-1 block font-semibold">Excludes unresolved sales shrinkage</span>
        </div>
      </div>

      {/* 3. STOCK ON HAND DIRECTORY */}
      <div className="border border-outline-variant p-4 sm:p-6 rounded-sm flex flex-col gap-4 bg-surface-container-lowest">
        <div className="flex justify-between items-center border-b border-outline-variant pb-2 flex-wrap gap-4">
          <div>
            <h3 className="label-caps text-on-surface font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Stock On Hand Directory
            </h3>
            <span className="text-[10px] text-outline mt-0.5 block">Click dashboard alerts to highlight items.</span>
          </div>
          <div className="flex gap-3 items-center flex-wrap">
            <div className="relative flex items-center bg-surface-container-low border border-outline-variant rounded-sm px-3 py-1">
              <Search className="h-3.5 w-3.5 text-outline mr-2" />
              <input type="text" placeholder="Search stock..." value={stockSearchQuery}
                onChange={e => setStockSearchQuery(e.target.value)}
                className="w-40 text-xs bg-transparent outline-none border-none focus:ring-0 p-0" />
            </div>
            <select value={selectedStockCategory} onChange={e => setSelectedStockCategory(e.target.value)}
              className="px-2 py-1 border border-outline-variant bg-surface-container-low text-xs rounded-sm focus:outline-none">
              {categories.map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {filteredStockIngredients.length === 0 ? (
          <div className="py-8 text-center text-outline text-xs">No ingredients found.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-1">
            {filteredStockIngredients.map((ing, idx) => {
              const pref = ing.suppliers?.find(s => s.isPreferred) || ing.suppliers?.[0];
              const displayUnit = pref?.packUnit || 'g';
              const displayVal = editingCounts[ing.id] !== undefined ? editingCounts[ing.id] : (ing.stockLevel ?? '');
              const hasChanged = editingCounts[ing.id] !== undefined && parseFloat(editingCounts[ing.id]) !== (ing.stockLevel || 0);
              const isHighlighted = selectedIngredientId === ing.id;
              return (
                <div key={ing.id} id={`stock-row-${ing.id}`}
                  className={`p-4 border rounded-sm flex items-center justify-between transition-all duration-300 ${isHighlighted ? 'border-primary bg-primary/[0.03] ring-1 ring-primary' : idx % 2 === 0 ? 'border-outline-variant bg-transparent' : 'border-outline-variant bg-black/[0.0075]'}`}>
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="font-semibold text-xs text-on-surface flex items-center gap-2">
                      <span className="truncate">{ing.name}</span>
                      {isHighlighted && <span className="bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider animate-pulse flex-shrink-0">Target</span>}
                    </div>
                    <div className="text-[10px] text-outline uppercase tracking-wider mt-1">
                      {ing.category} • Current: {ing.stockLevel || 0} {displayUnit}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input type="number" step="any" value={displayVal}
                      onChange={e => setEditingCounts(prev => ({ ...prev, [ing.id]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleSaveSingleAdjustment(ing)}
                      className={`w-20 px-2 py-1 border border-outline-variant text-center data-tabular text-xs font-bold bg-surface-container-lowest focus:border-primary ${hasChanged ? 'border-primary ring-1 ring-primary/20' : ''}`} />
                    <span className="text-xs font-semibold text-on-surface-variant w-8">{displayUnit}</span>
                    {hasChanged ? (
                      <button onClick={() => handleSaveSingleAdjustment(ing)}
                        className="h-8 px-3 bg-primary text-white text-[10px] font-bold label-caps rounded-sm hover:bg-opacity-90">
                        Save
                      </button>
                    ) : <div className="w-12 h-8" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}

      {/* WASTE LOG */}
      {showWastePanel && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-3 sm:p-8">
          <div className="w-full max-w-lg bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col p-6">
            <h2 className="headline-sm font-semibold border-b border-outline-variant pb-3 mb-4">Daily Wastage Entry</h2>
            <div className="flex flex-col gap-6">
              <div>
                <label className="label-caps text-outline block mb-2">Select Waste Item</label>
                <select value={wasteIngId} onChange={e => setWasteIngId(e.target.value)}
                  className="w-full px-3 py-3 border border-outline-variant bg-surface-container-lowest text-sm">
                  <option value="">-- Choose Ingredient --</option>
                  {ingredients.map(ing => <option key={ing.id} value={ing.id}>{ing.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-caps text-outline block mb-2">Quantity Wasted</label>
                  <input type="number" value={wasteQty || ''} onChange={e => setWasteQty(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-3 border border-outline-variant text-sm data-tabular text-center" placeholder="0.0" />
                </div>
                <div>
                  <label className="label-caps text-outline block mb-2">Unit</label>
                  <select value={wasteUnit} onChange={e => setWasteUnit(e.target.value as Unit)}
                    className="w-full px-3 py-3 border border-outline-variant bg-surface-container-lowest text-sm">
                    <option value="g">grams (g)</option>
                    <option value="kg">kilograms (kg)</option>
                    <option value="oz">ounces (oz)</option>
                    <option value="ml">milliliters (ml)</option>
                    <option value="l">liters (l)</option>
                    <option value="ea">each (ea)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label-caps text-outline block mb-2">Waste Reason</label>
                <div className="grid grid-cols-3 gap-3">
                  {['Spoil', 'Prep Trim', 'Dropped'].map(r => (
                    <button key={r} onClick={() => setWasteReason(r)}
                      className={`h-12 border text-xs font-bold label-caps rounded-sm transition-colors ${wasteReason === r ? 'bg-primary text-white border-primary' : 'border-outline-variant bg-surface hover:bg-surface-container'}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
                <button onClick={() => setShowWastePanel(false)}
                  className="h-12 px-6 border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container">
                  Discard [ESC]
                </button>
                <button onClick={handleSaveWaste} disabled={isSaving || !wasteIngId || wasteQty <= 0}
                  className="h-12 px-8 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 disabled:opacity-50 flex items-center gap-2">
                  {isSaving ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving...</> : 'Save Waste'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FEATURE 2: WASTAGE HISTORY */}
      {showWastageHistory && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-3 sm:p-8">
          <div className="w-full max-w-3xl h-[85vh] bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface flex-shrink-0">
              <div>
                <h2 className="font-bold text-on-surface">Wastage History</h2>
                <span className="text-[10px] text-outline label-caps">{filteredWaste.length} entries · Total cost: <span className="text-error font-bold">£{wasteTotalCost.toFixed(2)}</span></span>
              </div>
              <button onClick={() => setShowWastageHistory(false)} className="p-1 text-outline hover:text-on-surface">
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Filters */}
            <div className="px-6 py-3 border-b border-outline-variant bg-surface flex gap-4 flex-wrap items-end flex-shrink-0">
              <div>
                <label className="label-caps text-outline text-[9px] block mb-1">From</label>
                <input type="date" value={wasteDateFrom} onChange={e => setWasteDateFrom(e.target.value)}
                  className="px-2 py-1.5 border border-outline-variant text-xs rounded-sm bg-surface-container-lowest" />
              </div>
              <div>
                <label className="label-caps text-outline text-[9px] block mb-1">To</label>
                <input type="date" value={wasteDateTo} onChange={e => setWasteDateTo(e.target.value)}
                  className="px-2 py-1.5 border border-outline-variant text-xs rounded-sm bg-surface-container-lowest" />
              </div>
              <div className="flex-1 min-w-32">
                <label className="label-caps text-outline text-[9px] block mb-1">Ingredient</label>
                <input type="text" placeholder="Filter by ingredient..." value={wasteIngFilter} onChange={e => setWasteIngFilter(e.target.value)}
                  className="w-full px-2 py-1.5 border border-outline-variant text-xs rounded-sm bg-surface-container-lowest" />
              </div>
              {(wasteDateFrom || wasteDateTo || wasteIngFilter) && (
                <button onClick={() => { setWasteDateFrom(''); setWasteDateTo(''); setWasteIngFilter(''); }}
                  className="h-8 px-3 border border-outline-variant text-xs label-caps font-bold rounded-sm hover:bg-surface-container">
                  Clear
                </button>
              )}
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto">
              {filteredWaste.length === 0 ? (
                <div className="py-12 text-center text-outline text-xs">No waste entries match the current filters.</div>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead className="sticky top-0 bg-surface-container border-b border-outline-variant">
                    <tr>
                      <th className="p-3 text-left label-caps text-[10px] text-outline font-bold">Date</th>
                      <th className="p-3 text-left label-caps text-[10px] text-outline font-bold">Ingredient</th>
                      <th className="p-3 text-left label-caps text-[10px] text-outline font-bold">Category</th>
                      <th className="p-3 text-center label-caps text-[10px] text-outline font-bold">Qty (g)</th>
                      <th className="p-3 text-left label-caps text-[10px] text-outline font-bold">Reason</th>
                      <th className="p-3 text-right label-caps text-[10px] text-outline font-bold">Est. Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant">
                    {filteredWaste.map(m => {
                      const ing = ingMap.get(m.ingredientId);
                      const cost = ing ? calculateIngredientCost(ing, Math.abs(m.quantity), 'g', ingredients) : 0;
                      return (
                        <tr key={m.id} className="hover:bg-surface-container-low">
                          <td className="p-3 data-tabular text-on-surface">{m.date}</td>
                          <td className="p-3 font-semibold text-on-surface">{ing?.name ?? m.ingredientId}</td>
                          <td className="p-3 text-outline">{ing?.category ?? '—'}</td>
                          <td className="p-3 text-center data-tabular text-on-surface">{Math.abs(m.quantity).toFixed(0)}</td>
                          <td className="p-3 text-outline">{m.notes ?? '—'}</td>
                          <td className="p-3 text-right data-tabular font-bold text-error">£{cost.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-surface border-t border-outline-variant">
                    <tr>
                      <td colSpan={5} className="p-3 label-caps text-[10px] text-outline font-bold">Total ({filteredWaste.length} entries)</td>
                      <td className="p-3 text-right data-tabular font-bold text-error">£{wasteTotalCost.toFixed(2)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FEATURE 3: REPORTS */}
      {showReports && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-3 sm:p-8">
          <div className="w-full max-w-2xl h-[80vh] bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface flex-shrink-0">
              <h2 className="font-bold text-on-surface">Stocktake Reports</h2>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => { setReportConfig(DEFAULT_REPORT_CONFIG); setShowReportConfig(true); }}
                  className="h-8 px-4 bg-primary text-white text-[10px] font-bold label-caps rounded-sm hover:bg-opacity-90 flex items-center gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Generate Report
                </button>
                <button
                  onClick={handlePrintComplianceReport}
                  title="Print today's food + equipment temperature checks"
                  className="h-8 px-3 border border-outline-variant text-[10px] font-bold label-caps rounded-sm hover:bg-surface-container flex items-center gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Compliance Log
                </button>
                <button
                  onClick={handleEmailComplianceReport}
                  title="Email today's food + equipment temperature checks"
                  className="h-8 px-3 border border-outline-variant text-[10px] font-bold label-caps rounded-sm hover:bg-surface-container flex items-center gap-1.5"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Email Compliance Log
                </button>
                <button onClick={() => setShowReports(false)} className="p-1 text-outline hover:text-on-surface">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-outline-variant">
              {stocktakeReports.length === 0 ? (
                <div className="py-12 text-center text-outline text-xs">No reports yet. Commit a Stock Take to create one.</div>
              ) : (
                stocktakeReports.map(report => (
                  <div key={report.id} className="px-6 py-4 flex items-center justify-between hover:bg-surface-container-low">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-on-surface">{report.date}</span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm label-caps ${report.type === 'snapshot' ? 'bg-surface-container text-outline' : 'bg-primary/10 text-primary'}`}>
                          {report.type === 'snapshot' ? 'Snapshot' : 'Stock Take'}
                        </span>
                      </div>
                      <div className="text-[10px] text-outline label-caps mt-0.5">
                        {report.itemCount} items · £{report.totalValue.toFixed(2)}
                        {report.menuOnly ? ' · Menu only' : ''}
                        {report.wastageTotal !== undefined ? ` · Wastage: £${report.wastageTotal.toFixed(2)}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handlePrintReport(report)}
                        title="Print report"
                        className="h-8 px-3 border border-outline-variant text-xs font-bold label-caps rounded-sm hover:bg-surface-container flex items-center gap-1.5">
                        <Printer className="h-3.5 w-3.5" /> Print
                      </button>
                      <button onClick={() => handleEmailReport(report)}
                        title="Email report"
                        className="h-8 px-3 border border-outline-variant text-xs font-bold label-caps rounded-sm hover:bg-surface-container flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" /> Email
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="px-6 py-3 border-t border-outline-variant bg-surface flex-shrink-0">
              <p className="text-[10px] text-outline">Email recipients are configured in <span className="font-bold">Help → Settings → Report Recipients</span>.</p>
            </div>
          </div>
        </div>
      )}

      {/* EPOS IMPORTER */}
      {showEposImport && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-3 sm:p-8">
          <div className="w-full max-w-3xl bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col p-6 max-h-[90vh]">
            <h2 className="headline-sm font-semibold border-b border-outline-variant pb-3 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />EPOS Sales Importer & Variance Auditor
            </h2>
            <div className="flex flex-col gap-4 overflow-y-auto pr-1">
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Drop in your weekly EPOS Sales CSV. The system calculates theoretical ingredient usage and compares against your latest stock count.
              </p>
              <div className="border-2 border-dashed border-outline-variant p-6 text-center bg-surface hover:bg-surface-container cursor-pointer">
                <input type="file" onChange={e => setEposFile(e.target.files?.[0] || null)} className="hidden" id="epos-file-input" />
                <label htmlFor="epos-file-input" className="cursor-pointer">
                  {eposFile ? <span className="font-semibold text-sm text-primary">{eposFile.name}</span>
                    : <span className="text-xs text-outline label-caps">Select EPOS Sales CSV/Excel</span>}
                </label>
              </div>
              {varianceReport && (
                <div className="flex flex-col gap-3 mt-2">
                  <h3 className="label-caps font-bold text-xs text-error">Variance Audit Discrepancies</h3>
                  <table className="w-full border-collapse text-left text-xs border border-outline-variant rounded-sm overflow-hidden bg-surface">
                    <thead><tr className="bg-surface-container border-b border-outline-variant">
                      <th className="p-3 label-caps text-[10px] text-outline font-bold">Ingredient</th>
                      <th className="p-3 label-caps text-[10px] text-outline font-bold text-center">Projected</th>
                      <th className="p-3 label-caps text-[10px] text-outline font-bold text-center">Actual</th>
                      <th className="p-3 label-caps text-[10px] text-outline font-bold text-center">Variance</th>
                      <th className="p-3 label-caps text-[10px] text-outline font-bold text-right">Cash Loss</th>
                    </tr></thead>
                    <tbody className="divide-y divide-outline-variant">
                      {varianceReport.map((row, i) => (
                        <tr key={i} className="hover:bg-surface-container-low">
                          <td className="p-3 font-semibold">{row.name}</td>
                          <td className="p-3 text-center data-tabular text-secondary">{row.projected} {row.unit}</td>
                          <td className="p-3 text-center data-tabular font-semibold">{row.actual} {row.unit}</td>
                          <td className={`p-3 text-center data-tabular font-bold ${row.variance < 0 ? 'text-error' : 'text-primary'}`}>{row.variance} {row.unit}</td>
                          <td className={`p-3 text-right data-tabular font-bold ${row.costLoss > 0 ? 'text-error' : 'text-secondary'}`}>{row.costLoss > 0 ? `-£${row.costLoss.toFixed(2)}` : '£0.00'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="flex justify-end gap-3 border-t border-outline-variant pt-4">
                <button onClick={() => { setShowEposImport(false); setEposFile(null); setVarianceReport(null); }}
                  className="h-10 px-4 border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container">Close</button>
                <button onClick={handleRunEposImport} disabled={!eposFile || importing}
                  className="h-10 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 disabled:opacity-50">
                  {importing ? 'Processing...' : 'Run Sales Explosion'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REPORT CONFIG MODAL */}
      {showReportConfig && (
        <div className="fixed inset-0 z-[110] bg-black/40 flex items-center justify-center p-3 sm:p-8">
          <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-outline-variant bg-surface">
              <h2 className="font-bold text-on-surface">Report Options</h2>
              <button onClick={() => setShowReportConfig(false)} className="p-1 text-outline hover:text-on-surface"><X className="h-4 w-4" /></button>
            </div>

            <div className="p-6 flex flex-col gap-6">

              {/* Scope */}
              <div>
                <label className="label-caps text-outline text-[10px] font-bold block mb-3">Which Ingredients</label>
                <div className="flex flex-col gap-2">
                  {([
                    ['nonzero', 'Items with stock (non-zero levels only)'],
                    ['menu',    'Menu items only (live dishes + their recipes)'],
                    ['all',     'All ingredients']
                  ] as const).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-3 cursor-pointer text-sm">
                      <input type="radio" name="scope" checked={reportConfig.scope === val}
                        onChange={() => setReportConfig(c => ({ ...c, scope: val }))}
                        className="accent-primary" />
                      <span className={reportConfig.scope === val ? 'text-on-surface font-semibold' : 'text-on-surface-variant'}>{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Columns */}
              <div>
                <label className="label-caps text-outline text-[10px] font-bold block mb-3">Ingredient Data to Include</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    ['stockLevel',   'Stock level'],
                    ['stockValue',   'Stock value (£)'],
                    ['category',     'Category'],
                    ['wastePercent', 'Waste %'],
                    ['allergens',    'Allergens'],
                    ['kcal',         'Calories (kcal/100g)'],
                    ['supplier',     'Preferred supplier'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer text-sm">
                      <input type="checkbox" checked={reportConfig[key] as boolean}
                        onChange={e => setReportConfig(c => ({ ...c, [key]: e.target.checked }))}
                        className="accent-primary" />
                      <span className="text-on-surface-variant">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Wastage */}
              <div className="border-t border-outline-variant pt-4">
                <label className="flex items-center gap-3 cursor-pointer text-sm">
                  <input type="checkbox" checked={reportConfig.includeWastage}
                    onChange={e => setReportConfig(c => ({ ...c, includeWastage: e.target.checked }))}
                    className="accent-primary" />
                  <span className="text-on-surface">Include wastage summary (last 7 days)</span>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t border-outline-variant bg-surface">
              <button onClick={() => setShowReportConfig(false)}
                className="h-10 px-4 border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container">
                Cancel
              </button>
              <button
                onClick={() => handleGenerateReport(reportConfig)}
                disabled={saveReport.isPending}
                className="h-10 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {saveReport.isPending
                  ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Generating...</>
                  : 'Generate Report'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FEATURE 1: SUNDAY STOCK TAKE */}
      {showStockTake && (
        <div className={`fixed inset-0 flex items-center justify-center p-3 sm:p-8 transition-opacity ${bleScale.connecting ? 'z-0 opacity-0 pointer-events-none' : 'z-[100] bg-black/40'}`}>
          <div className="w-full max-w-4xl h-full sm:h-[90vh] bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col overflow-hidden">
            <div className="min-h-16 border-b border-outline-variant bg-surface flex flex-col sm:flex-row sm:items-center gap-3 px-4 sm:px-6 py-3 sm:py-0 justify-between flex-shrink-0">
              <div>
                <h2 className="headline-sm font-semibold">Stock Take</h2>
                <span className="text-xs text-outline label-caps">
                  {menuOnlyMode ? `${menuIngredientIds.size} menu-relevant ingredients` : `${ingredients.length} total ingredients`}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Menu-only toggle */}
                <button
                  onClick={() => setMenuOnlyMode(m => !m)}
                  title={menuOnlyMode ? 'Showing menu items only — click to show all' : 'Click to show only ingredients used in live menu dishes'}
                  className={`h-9 px-4 text-xs font-bold label-caps rounded-sm flex items-center gap-2 border transition-colors ${menuOnlyMode ? 'bg-primary text-white border-primary' : 'border-outline text-outline bg-surface hover:bg-surface-container'}`}>
                  {menuOnlyMode ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {menuOnlyMode ? 'Menu Items Only' : 'All Ingredients'}
                </button>
                {isWebBluetoothSupported() ? (
                  <button onClick={() => scaleConnected ? bleScale.disconnect() : bleScale.connect()}
                    className={`h-9 px-4 text-xs font-bold label-caps rounded-sm flex items-center gap-2 border transition-colors ${scaleConnected ? 'bg-secondary-container border-[#90a8ff] text-primary' : 'border-outline text-outline bg-surface hover:bg-surface-container'}`}>
                    <Scale className="h-4 w-4" />
                    {scaleConnected ? 'Scale Connected' : 'Link Scale'}
                  </button>
                ) : (
                  <span title="Bluetooth scale linking needs Chrome (Android) or the Bluefy browser (iPhone)"
                    className="h-9 px-4 text-xs font-bold label-caps rounded-sm flex items-center gap-2 border border-outline-variant text-outline/50 cursor-not-allowed">
                    <Scale className="h-4 w-4" />
                    Scale Unavailable
                  </span>
                )}
              </div>
            </div>

            {resumedDraftInfo && (
              <div className="h-10 bg-amber-500/10 border-b border-amber-500/30 flex items-center px-6 text-xs text-amber-700 flex-shrink-0 gap-2">
                <PauseCircle className="h-3.5 w-3.5" />
                Resuming a stock take paused {new Date(resumedDraftInfo.updatedAt).toLocaleString()}
                {resumedDraftInfo.updatedByName ? ` by ${resumedDraftInfo.updatedByName}` : ''} —
                {' '}{Object.keys(stockCounts).length + Object.keys(recipeCounts).length} items already counted.
              </div>
            )}

            {scaleConnected && <ScaleStatusBar />}

            <div className="border-b border-outline-variant bg-surface flex items-center px-6 gap-2 flex-shrink-0 overflow-x-auto h-12">
              {categories.map(cat => (
                <button key={cat} onClick={() => { setActiveLocation(cat); setDryStoreSubCategory('All'); }}
                  className={`h-8 px-4 text-xs font-bold label-caps rounded-sm transition-colors whitespace-nowrap ${activeLocation === cat ? 'bg-primary text-white' : 'text-outline hover:bg-surface-container'}`}>
                  {cat}
                </button>
              ))}
            </div>

            {activeLocation === 'Dry Store' && (
              <div className="border-b border-outline-variant bg-surface-container-lowest flex items-center px-6 gap-2 flex-shrink-0 overflow-x-auto h-10">
                {['All', ...DRY_STORE_SUBCATEGORIES].map(sub => (
                  <button key={sub} onClick={() => setDryStoreSubCategory(sub)}
                    className={`h-7 px-3 text-[10px] font-bold label-caps rounded-sm transition-colors whitespace-nowrap ${dryStoreSubCategory === sub ? 'bg-secondary-container text-primary' : 'text-outline hover:bg-surface-container'}`}>
                    {sub}
                  </button>
                ))}
              </div>
            )}

            <div className="border-b border-outline-variant bg-surface px-4 sm:px-6 py-2 flex-shrink-0">
              <div className="relative flex items-center bg-surface-container-lowest border border-outline-variant rounded-sm px-3 py-1.5 max-w-sm">
                <Search className="h-3.5 w-3.5 text-outline mr-2 flex-shrink-0" />
                <input type="text" placeholder="Search this stock take..." value={stocktakeSearch}
                  onChange={e => setStocktakeSearch(e.target.value)}
                  className="flex-1 text-sm bg-transparent outline-none border-none focus:ring-0 p-0 min-w-0" />
              </div>
            </div>

            <div ref={stocktakeScrollRef} className="flex-1 overflow-y-auto p-3 sm:p-6">
              {stocktakeRows.length === 0 ? (
                <div className="py-12 text-center text-outline text-xs">
                  {stocktakeSearch ? 'No items match your search.' : menuOnlyMode ? 'No menu-relevant ingredients in this category.' : 'No ingredients in this category.'}
                </div>
              ) : (
                <div style={{ height: stocktakeRowVirtualizer.getTotalSize(), position: 'relative' }}>
                  {stocktakeRowVirtualizer.getVirtualItems().map(vRow => {
                    const row = stocktakeRows[vRow.index];
                    return (
                      <div key={vRow.key} data-index={vRow.index} ref={stocktakeRowVirtualizer.measureElement}
                        style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vRow.start}px)`, paddingBottom: 12 }}>
                        {row.kind === 'recipe' ? (
                          <StocktakeRecipeRow
                            rec={row.rec}
                            scaleConnected={scaleConnected}
                            tareId={itemTareIds[`recipe-${row.rec.id}`] || 'none'}
                            onTareChange={(id, tareId) => handleTareChange(`recipe-${id}`, tareId)}
                            isEditing={editingCountKey === `recipe-${row.rec.id}`}
                            countValue={recipeCounts[row.rec.id]}
                            onCountChange={handleRecipeCountChange}
                            onStartEdit={(id) => handleStartEdit(`recipe-${id}`)}
                            onStopEdit={handleStopEdit}
                            readings={itemReadings[`recipe-${row.rec.id}`] || []}
                            onAddReading={handleAddRecipeReading}
                            onRemoveReading={handleRemoveRecipeReading}
                          />
                        ) : (
                          <StocktakeIngredientRow
                            ing={row.ing}
                            isAlternateRow={row.isAlternateRow}
                            scaleConnected={scaleConnected}
                            tareId={itemTareIds[row.ing.id] ?? (row.ing.defaultContainerId || 'none')}
                            onTareChange={handleTareChange}
                            isEditing={editingCountKey === `ing-${row.ing.id}`}
                            countValue={stockCounts[row.ing.id]}
                            onCountChange={handleIngredientCountChange}
                            onStartEdit={(id) => handleStartEdit(`ing-${id}`)}
                            onStopEdit={handleStopEdit}
                            readings={itemReadings[row.ing.id] || []}
                            onAddReading={handleAddIngredientReading}
                            onRemoveReading={handleRemoveIngredientReading}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="min-h-16 border-t border-outline-variant bg-surface flex flex-col sm:flex-row items-center gap-3 px-4 sm:px-6 py-3 sm:py-0 justify-between flex-shrink-0">
              <span className="text-xs text-outline order-2 sm:order-1">
                {Object.keys(stockCounts).length} items counted
              </span>
              <div className="flex gap-3 w-full sm:w-auto order-1 sm:order-2">
                <button onClick={handleCancelStockTake}
                  title="Discard this stocktake completely, including any paused progress"
                  className="h-10 px-4 flex-1 sm:flex-none border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container">
                  Cancel
                </button>
                <button onClick={handlePauseStockTake} disabled={saveDraft.isPending}
                  title="Save progress and exit — resume later from Stock Take"
                  className="h-10 px-4 flex-1 sm:flex-none border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container flex items-center justify-center gap-1.5 whitespace-nowrap">
                  <PauseCircle className="h-3.5 w-3.5" />
                  {saveDraft.isPending ? 'Pausing...' : 'Pause & Exit'}
                </button>
                <button onClick={handleCommitStockTake} disabled={isSaving}
                  className="h-10 px-4 sm:px-6 flex-1 sm:flex-none bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 disabled:opacity-50 flex items-center justify-center gap-2 whitespace-nowrap">
                  {isSaving ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />Committing...</> : 'Commit Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default Stock;
