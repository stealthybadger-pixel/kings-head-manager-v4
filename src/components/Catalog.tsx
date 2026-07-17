import React, { useState, useMemo } from 'react';
import { supplierBadgeClass } from '../utils/supplierColors';
import { useSupplierProducts, useSupplierProductsBySupplier, useIngredients, useIngredientMutations, useSupplierProductMutations, useSuppliers, resyncIngredientSuppliersFromProducts, fetchLinkedSupplierProducts } from '../hooks/useKitchenData';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from '../store/useStore';
import { useAuth } from '../hooks/useAuth';
import { 
  Search, 
  TrendingDown, 
  CheckCircle, 
  PlusCircle, 
  Link as LinkIcon, 
  HelpCircle,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { SupplierProduct, Ingredient } from '../types';
import { findBestIngredientMatch, cleanProductName } from '../utils/matching';
import { tokenizeSearchQuery, matchesSearchTokens } from '../utils/search';
import { inferCategory, CATEGORY_KEYWORDS, inferIngredientDefaults, DRY_STORE_SUBCATEGORIES, inferDryStoreSubCategory } from '../utils/ingredientAutofill';
import { getBaseRate, getBaseUnit } from '../utils/costing';
import { getSupplierUrl } from '../utils/supplierUrls';

export const Catalog: React.FC = () => {
  const { appUser } = useAuth();
  const isManager = appUser?.role === 'manager';

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('All');
  const [showCheaperOnly, setShowCheaperOnly] = useState(false);

  // Local-only "Sync Active-Menu Prices" panel — talks to scripts/priceSyncServer.mjs,
  // which only ever runs on a laptop (npm run price-sync:server), never deployed. Only
  // shown in local dev (import.meta.env.DEV) since there's no such server in production.
  const [showPriceSync, setShowPriceSync] = useState(false);
  const [priceSyncStatus, setPriceSyncStatus] = useState<'idle' | 'no-server' | 'no-auth' | 'ready' | 'running' | 'done'>('idle');
  const [priceSyncOutput, setPriceSyncOutput] = useState('');
  const PRICE_SYNC_URL = 'http://localhost:5175';

  const openPriceSync = async () => {
    setShowPriceSync(true);
    setPriceSyncOutput('');
    setPriceSyncStatus('idle');
    try {
      const res = await fetch(`${PRICE_SYNC_URL}/status`);
      const data = await res.json();
      setPriceSyncStatus(data.authReady ? 'ready' : 'no-auth');
    } catch {
      setPriceSyncStatus('no-server');
    }
  };

  const runPriceSync = async (write: boolean) => {
    setPriceSyncStatus('running');
    setPriceSyncOutput('');
    try {
      const res = await fetch(`${PRICE_SYNC_URL}/run?write=${write}`, { method: 'POST' });
      const data = await res.json();
      setPriceSyncOutput(data.output || data.error || 'No output.');
      setPriceSyncStatus('done');
    } catch {
      setPriceSyncOutput('Could not reach the local price-sync server.');
      setPriceSyncStatus('no-server');
    }
  };

  const storeSearchTerm = useStore((state) => state.searchTerm);

  // Sync search query from global store on navigation
  React.useEffect(() => {
    if (storeSearchTerm) {
      setSearchQuery(storeSearchTerm);
    }
  }, [storeSearchTerm]);

  // Debounce search query
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        setActiveSearch(searchQuery);
      } else {
        setActiveSearch('');
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const [page, setPage] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSubCategory, setSelectedSubCategory] = useState<string>('All');
  const PAGE_SIZE = 50;

  const isBrowsingSupplier = selectedSupplier !== 'All';

  React.useEffect(() => { setPage(0); }, [selectedSupplier, activeSearch, selectedCategory, selectedSubCategory]);

  // Data source depends on mode, and only one of these two queries is ever
  // actually enabled at a time:
  //  - a supplier selected -> useSupplierProductsBySupplier (that supplier's
  //    products only, via a Firestore where() clause)
  //  - no supplier, but 2+ chars typed -> useSupplierProducts (full
  //    collection) — searching across every supplier's inconsistent product
  //    names has no server-side equivalent, so this is the one case that
  //    still needs everything (see Task 2 of the Phase 3 optimisation).
  //  - neither -> nothing fetched, matches the existing empty-state message.
  // `hasSearchTerm` intentionally uses the raw (undebounced) searchQuery,
  // not the debounced `activeSearch` used for the placeholder text below —
  // otherwise deep-links like Pantry's "cheaper option" nudge (which sets
  // the search term programmatically via the store, not by typing) would
  // sit on an empty product list for the length of the debounce before the
  // fetch even started.
  const hasSearchTerm = searchQuery.trim().length >= 2;

  const { data: supplierScopedProducts = [], isLoading: loadingSupplierProducts } = useSupplierProductsBySupplier(selectedSupplier);
  const { data: allProducts = [], isLoading: loadingAllProducts } = useSupplierProducts(!isBrowsingSupplier && hasSearchTerm);

  const catalogProducts = isBrowsingSupplier ? supplierScopedProducts : (hasSearchTerm ? allProducts : []);
  const loadingCatalog = isBrowsingSupplier ? loadingSupplierProducts : (hasSearchTerm ? loadingAllProducts : false);

  const { data: ingredients = [], isLoading: loadingIngredients } = useIngredients();
  const { addIngredient } = useIngredientMutations();
  const showToast = useStore((state) => state.showToast);

  // Set when Catalog was opened from Pantry's "Find on Supplier Catalogue" flow — identifies
  // which ingredient a chosen product should be attached to, and drives the return-to-Pantry
  // navigation once a product is picked.
  const linkBackIngredientId = useStore((state) => state.linkBackIngredientId);
  const clearLinkBackIngredient = useStore((state) => state.clearLinkBackIngredient);
  const navigateToPantryWithIngredient = useStore((state) => state.navigateToPantryWithIngredient);
  const linkBackIngredient = useMemo(
    () => (linkBackIngredientId ? ingredients.find(i => i.id === linkBackIngredientId) ?? null : null),
    [linkBackIngredientId, ingredients]
  );

  // Selected item detail state
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);

  // Custom mapping state: manually overriding auto-matches
  const [manualMatches, setManualMatches] = useState<Record<string, string>>({}); // productId -> ingredientId
  const [linkingProductId, setLinkingProductId] = useState<string | null>(null);

  // Unit rate calculation (standardized to base units: g, ml, ea) uses the
  // shared costing helpers so 'oz' is handled consistently everywhere.
  const formatUnitPrice = (cost: number, size: number, unit: string): string => {
    const rate = getBaseRate(cost, size, unit);
    if (unit === 'kg' || unit === 'g' || unit === 'oz') {
      return `£${(rate * 1000).toFixed(2)} / kg`;
    }
    if (unit === 'l' || unit === 'ml') {
      return `£${(rate * 1000).toFixed(2)} / l`;
    }
    return `£${rate.toFixed(2)} / ea`;
  };

  // Filter first (cheap), then paginate, then match (expensive)
  const filteredRaw = useMemo(() => {
    const queryTokens = tokenizeSearchQuery(searchQuery);
    return catalogProducts.filter(p => {
      const matchesSearch = queryTokens.length === 0 ||
        matchesSearchTokens(p.name, queryTokens) ||
        (!!p.originalName && matchesSearchTokens(p.originalName, queryTokens));
      const matchesSupplier = selectedSupplier === 'All' || p.supplier === selectedSupplier;
      const matchesCategory = selectedCategory === 'All' || inferCategory(p.name) === selectedCategory;
      const matchesSubCategory = selectedCategory !== 'Dry Store' || selectedSubCategory === 'All' || inferDryStoreSubCategory(p.name) === selectedSubCategory;
      return matchesSearch && matchesSupplier && matchesCategory && matchesSubCategory;
    });
  }, [catalogProducts, searchQuery, selectedSupplier, selectedCategory, selectedSubCategory]);

  const pageSlice = useMemo(() => filteredRaw.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE), [filteredRaw, page]);

  const processedProducts = useMemo(() => {
    return pageSlice.map(prod => {
      let matchedIng: any = null;
      const manualIngId = manualMatches[prod.id];
      if (manualIngId) {
        matchedIng = ingredients.find(i => i.id === manualIngId) || null;
      } else {
        const matchResult = findBestIngredientMatch(prod.name, ingredients);
        if (matchResult) matchedIng = matchResult.ingredient;
      }

      let isCheaper = false;
      let percentSaved = 0;
      let currentPreferredCostStr = 'N/A';
      let currentPrefRate = 0;

      if (matchedIng && matchedIng.suppliers && matchedIng.suppliers.length > 0) {
        const prefSup = matchedIng.suppliers.find((s: any) => s.isPreferred) || matchedIng.suppliers[0];
        currentPrefRate = getBaseRate(prefSup.packCost, prefSup.packSize, prefSup.packUnit);
        currentPreferredCostStr = `${prefSup.name} (${formatUnitPrice(prefSup.packCost, prefSup.packSize, prefSup.packUnit)})`;
        const ingBaseUnit = getBaseUnit(prefSup.packUnit);
        const prodBaseUnit = getBaseUnit(prod.packUnit);
        if (ingBaseUnit === prodBaseUnit) {
          const prodRate = getBaseRate(prod.packCost, prod.packSize, prod.packUnit);
          if (prodRate < currentPrefRate - 0.00001) {
            isCheaper = true;
            percentSaved = ((currentPrefRate - prodRate) / currentPrefRate) * 100;
          }
        }
      }

      return { ...prod, matchedIngredient: matchedIng, isCheaper, percentSaved, currentPreferredCostStr, currentPrefRate };
    });
  }, [pageSlice, ingredients, manualMatches]);

  const filteredProducts = useMemo(() => {
    return showCheaperOnly ? processedProducts.filter(p => p.isCheaper) : processedProducts;
  }, [processedProducts, showCheaperOnly]);

  const totalPages = Math.ceil(filteredRaw.length / PAGE_SIZE);

  const selectedProduct = useMemo(() => {
    return processedProducts.find(p => p.id === selectedProductId) || null;
  }, [processedProducts, selectedProductId]);

  // Arriving from Pantry's "Cheaper Catalog Option Available" nudge — auto-select and scroll
  // to the specific product instead of leaving the user to spot it in the filtered list.
  const highlightProductId = useStore((state) => state.highlightProductId);
  const clearHighlightProduct = useStore((state) => state.clearHighlightProduct);
  React.useEffect(() => {
    if (!highlightProductId) return;
    if (!processedProducts.some(p => p.id === highlightProductId)) return;
    setSelectedProductId(highlightProductId);
    const t = setTimeout(() => {
      document.getElementById(`catalog-row-${highlightProductId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      clearHighlightProduct();
    }, 100);
    return () => clearTimeout(t);
  }, [highlightProductId, processedProducts, clearHighlightProduct]);

  const { updateSupplierProduct, deleteSupplierProduct, bulkDeleteSupplierProducts } = useSupplierProductMutations();
  const [isEditingProduct, setIsEditingProduct] = useState(false);
  const [editFormState, setEditFormState] = useState<SupplierProduct | null>(null);
  const [selectedForDelete, setSelectedForDelete] = useState<Set<string>>(new Set());

  const toggleSelectForDelete = (id: string) => {
    setSelectedForDelete(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (!isManager || selectedForDelete.size === 0) return;
    if (!confirm(`Delete ${selectedForDelete.size} selected product(s) from the catalogue permanently? This cannot be undone.`)) return;
    try {
      await bulkDeleteSupplierProducts.mutateAsync(Array.from(selectedForDelete));
      if (selectedProductId && selectedForDelete.has(selectedProductId)) setSelectedProductId(null);
      setSelectedForDelete(new Set());
      showToast("Selected catalog products deleted.", "success");
    } catch (err: any) {
      showToast("Error deleting catalog products: " + err.message, "error");
    }
  };

  React.useEffect(() => {
    setIsEditingProduct(false);
    if (selectedProduct) {
      setEditFormState(selectedProduct);
    } else {
      setEditFormState(null);
    }
  }, [selectedProductId, selectedProduct]);

  // Action: link this catalog product to the ingredient (supplierProducts.ingredientId is the
  // single source of truth — see Pantry.tsx's "Supplier Products" section). ingredient.suppliers[]
  // is then regenerated from the full linked set, not written to directly, so this flow can't
  // diverge from what Pantry shows.
  const queryClientForLink = useQueryClient();
  const handleApplyCheaperOption = async (prod: typeof processedProducts[0], ing: Ingredient, makePreferred = true) => {
    if (!isManager || !ing) return;

    try {
      if (makePreferred) {
        // Clear preferred on every other product already linked to this ingredient, same as
        // Pantry's setPreferred — at most one preferred product per ingredient.
        const linked = await fetchLinkedSupplierProducts(ing.id);
        await Promise.all(
          linked
            .filter(p => p.id !== prod.id && p.isPreferred)
            .map(p => updateSupplierProduct.mutateAsync({ id: p.id, data: { isPreferred: false } }))
        );
      }
      await updateSupplierProduct.mutateAsync({
        id: prod.id,
        data: { ingredientId: ing.id, isPreferred: makePreferred }
      });
      await resyncIngredientSuppliersFromProducts(queryClientForLink, ing.id);
      const msg = makePreferred
        ? `Successfully set ${prod.supplier}'s "${prod.name}" as preferred supplier for ${ing.name}!`
        : `Successfully added ${prod.supplier}'s "${prod.name}" as a supplier option for ${ing.name}!`;
      showToast(msg, "success");
    } catch (e: any) {
      console.error(e);
      showToast("Error updating supplier: " + e.message, "error");
    }
  };

  // Action: attach the currently-selected catalog product as a supplier option for the
  // ingredient that sent us here (via Pantry's "Find on Supplier Catalogue" button), then
  // return to Pantry with that ingredient selected, per the linking workflow.
  const handleLinkBackAdd = async (prod: typeof processedProducts[0]) => {
    if (!isManager || !linkBackIngredient) return;
    await handleApplyCheaperOption(prod, linkBackIngredient, false);
    const ingredientId = linkBackIngredient.id;
    clearLinkBackIngredient();
    navigateToPantryWithIngredient(ingredientId);
  };

  // Action: Create a brand new pantry ingredient from a catalog product
  const handleCreateIngredientFromProduct = async (prod: SupplierProduct) => {
    if (!isManager) return;
    const name = prod.originalName || prod.name.replace(/\s*\(Box\)|\s*\(Tray\)|\s*\(Case\)|\s*\(Sachet\)/gi, '');
    const guess = inferIngredientDefaults(name);

    const newIngredient = {
      name: name,
      category: (guess.category ?? 'Dry Store') as any,
      subCategory: guess.subCategory ?? undefined,
      wastePercent: guess.wastePercent ?? 0,
      kcalPer100: guess.kcalPer100 ?? 0,
      stockLevel: 0,
      allergens: guess.allergens,
      suppliers: [], // populated by resyncIngredientSuppliersFromProducts below, from the linked product
      audited: false,
      incomplete: true // Marked as incomplete stub requiring review
    };

    try {
      const created = await addIngredient.mutateAsync(newIngredient);
      await updateSupplierProduct.mutateAsync({ id: prod.id, data: { ingredientId: created.id, isPreferred: true } });
      await resyncIngredientSuppliersFromProducts(queryClientForLink, created.id);
      showToast(`Created master pantry item: "${created.name}"`, "success");
    } catch (e: any) {
      console.error(e);
      showToast("Error creating pantry item: " + e.message, "error");
    }
  };

  const { data: dbSuppliers = [] } = useSuppliers();
  const FALLBACK_SUPPLIERS = ['David Catt', 'Urban', 'Cranbrook', 'Crouch', 'Booker', 'Internal'];
  const uniqueSuppliers = dbSuppliers.length > 0 ? dbSuppliers.map(s => s.name) : FALLBACK_SUPPLIERS;


  return (
    <div className="flex h-full w-full bg-surface-container-lowest overflow-hidden">
      {showPriceSync && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-6">
          <div className="bg-surface w-full max-w-2xl max-h-[80vh] rounded-sm shadow-xl flex flex-col">
            <div className="p-4 border-b border-outline-variant flex items-center justify-between">
              <h3 className="font-bold text-sm">Sync Active-Menu Prices</h3>
              <button onClick={() => setShowPriceSync(false)} className="text-outline hover:text-on-surface text-xs font-bold">
                Close
              </button>
            </div>
            <div className="p-4 flex-1 overflow-y-auto flex flex-col gap-3">
              {priceSyncStatus === 'no-server' && (
                <p className="text-xs text-red-600">
                  Can't reach the local price-sync server. Run <code>npm run price-sync:server</code> in a terminal, then try again.
                </p>
              )}
              {priceSyncStatus === 'no-auth' && (
                <p className="text-xs text-red-600">
                  No saved wholesaler login sessions found. Run <code>npm run scrape:login</code> in a terminal first (log in to Booker/Urban/David Catt when the browser opens).
                </p>
              )}
              {priceSyncStatus === 'ready' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => runPriceSync(false)}
                    className="flex-1 h-9 border border-primary text-primary text-xs font-bold rounded-sm hover:bg-primary/5"
                  >
                    Dry Run (Check Only)
                  </button>
                  <button
                    onClick={() => runPriceSync(true)}
                    className="flex-1 h-9 bg-primary text-white text-xs font-bold rounded-sm hover:bg-primary/90"
                  >
                    Run &amp; Apply Updates
                  </button>
                </div>
              )}
              {priceSyncStatus === 'running' && (
                <div className="flex items-center gap-2 text-xs text-outline">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  Checking active-menu supplier prices — this can take a few minutes...
                </div>
              )}
              {priceSyncOutput && (
                <pre className="text-[11px] leading-relaxed bg-surface-container-lowest border border-outline-variant rounded-sm p-3 whitespace-pre-wrap overflow-x-auto">
                  {priceSyncOutput}
                </pre>
              )}
              {priceSyncStatus === 'done' && (
                <button
                  onClick={() => runPriceSync(false)}
                  className="h-8 text-xs font-semibold text-outline hover:text-on-surface border border-outline rounded-sm px-3 self-start"
                >
                  Run Again
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {/* LEFT COLUMN: Search & Product Registry List */}
      <div className="w-7/12 border-r border-outline-variant flex flex-col h-full bg-surface-container-lowest">
        {linkBackIngredient && (
          <div className="px-6 py-3 bg-primary text-white flex items-center justify-between gap-4 flex-shrink-0">
            <span className="text-xs font-semibold">
              Finding a supplier option for <strong>{linkBackIngredient.name}</strong> — pick a product, then "Add as Supplier Option".
            </span>
            <button
              onClick={() => clearLinkBackIngredient()}
              className="text-[10px] font-bold label-caps border border-white/40 px-2 py-1 rounded-sm hover:bg-white/10 flex-shrink-0"
            >
              Cancel
            </button>
          </div>
        )}
        {/* Search Header Ribbon */}
        <div className="p-6 border-b border-outline-variant flex flex-col gap-4 flex-shrink-0">
          <div className="flex gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-outline" />
              <input
                type="text"
                placeholder="Search supplier product catalogue..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 border border-outline-variant bg-surface-container-low text-sm rounded-sm focus:outline-none focus:border-primary"
              />
            </div>
            
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="px-3 py-2 border border-outline-variant bg-surface-container-low text-xs rounded-sm focus:outline-none"
            >
              <option value="All">All Suppliers</option>
              {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select
              value={selectedCategory}
              onChange={(e) => { setSelectedCategory(e.target.value); setSelectedSubCategory('All'); }}
              className="px-3 py-2 border border-outline-variant bg-surface-container-low text-xs rounded-sm focus:outline-none"
            >
              <option value="All">All Categories</option>
              {Object.keys(CATEGORY_KEYWORDS).map(c => <option key={c} value={c}>{c}</option>)}
            </select>

            {selectedCategory === 'Dry Store' && (
              <select
                value={selectedSubCategory}
                onChange={(e) => setSelectedSubCategory(e.target.value)}
                className="px-3 py-2 border border-outline-variant bg-surface-container-low text-xs rounded-sm focus:outline-none"
              >
                <option value="All">All Sub-Categories</option>
                {DRY_STORE_SUBCATEGORIES.map(sub => <option key={sub} value={sub}>{sub}</option>)}
              </select>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="cheaper_toggle"
                checked={showCheaperOnly}
                onChange={(e) => setShowCheaperOnly(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="cheaper_toggle" className="text-xs font-semibold text-on-surface cursor-pointer select-none">
                Show Cheaper Alternatives Only
              </label>
            </div>

            <div className="flex items-center gap-2">
              {isManager && import.meta.env.DEV && (
                <button
                  onClick={openPriceSync}
                  className="flex items-center gap-1.5 text-xs font-bold text-primary bg-primary/10 border border-primary/30 px-3 py-1.5 rounded-sm hover:bg-primary/20 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Sync Active-Menu Prices
                </button>
              )}
              {isManager && selectedForDelete.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={bulkDeleteSupplierProducts.isPending}
                  className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-500/10 border border-red-500/30 px-3 py-1.5 rounded-sm hover:bg-red-500/20 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Selected ({selectedForDelete.size})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Product List */}
        <div className="flex-1 overflow-y-auto">
          {loadingCatalog ? (
            <div className="flex items-center justify-center h-full">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : !isBrowsingSupplier && activeSearch.trim().length < 2 ? (
            <div className="p-12 text-center text-outline text-sm flex flex-col gap-2 items-center justify-center h-full">
              <span className="text-xl">🔍</span>
              <span>Select a supplier to browse, or type to search across all suppliers.</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="p-12 text-center text-outline text-sm">
              No products found matching filters.
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="px-4 py-2 text-[10px] text-outline border-b border-outline-variant">
                Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredRaw.length)} of {filteredRaw.length}
              </div>
              {filteredProducts.map((prod, idx) => {
                const isSelected = prod.id === selectedProductId;
                return (
                  <div
                    key={prod.id}
                    id={`catalog-row-${prod.id}`}
                    onClick={() => setSelectedProductId(prod.id)}
                    className={`flex items-center justify-between p-4 border-b border-outline-variant cursor-pointer hover:bg-surface-container transition-all duration-300 ${
                      isSelected
                        ? 'bg-surface-container-high border-l-4 border-l-primary'
                        : prod.isCheaper
                          ? 'bg-success-container/25 border-l-4 border-l-success'
                          : idx % 2 === 0
                            ? 'bg-transparent'
                            : 'bg-black/[0.0075]'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2">
                        <span className={supplierBadgeClass(prod.supplier)}>
                          {prod.supplier}
                        </span>
                        {prod.isCheaper && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success-container px-2 py-0.5 rounded-full uppercase">
                            <TrendingDown className="h-3 w-3" />
                            Cheaper (-{Math.round(prod.percentSaved)}%)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <h4 className="font-semibold text-sm text-on-surface truncate">
                          {prod.name}
                        </h4>
                        <a
                          href={getSupplierUrl(prod)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-outline hover:text-primary transition-colors flex-shrink-0"
                          title="View on Supplier Site"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                      {prod.matchedIngredient ? (
                        <div className="text-[10px] text-emerald-700 bg-emerald-500/10 border border-emerald-500/25 px-2 py-0.5 rounded-sm mt-1.5 font-semibold inline-flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-emerald-600" />
                          Linked: {prod.matchedIngredient.name}
                        </div>
                      ) : (
                        <div className="text-[10px] text-outline bg-surface-container-high/40 px-2 py-0.5 rounded-sm mt-1.5 inline-flex items-center gap-1 font-medium">
                          <HelpCircle className="h-3 w-3 text-outline" />
                          Unlinked Item
                        </div>
                      )}
                    </div>

                    <div className="text-right flex-shrink-0 flex items-start gap-2">
                      <div>
                        <div className="text-sm font-bold text-on-surface data-tabular">
                          £{prod.packCost.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-outline mt-0.5 uppercase">
                          {prod.packSize} {prod.packUnit} • {formatUnitPrice(prod.packCost, prod.packSize, prod.packUnit)}
                        </div>
                      </div>
                      {isManager && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            checked={selectedForDelete.has(prod.id)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleSelectForDelete(prod.id)}
                            title="Select for bulk delete"
                            className="h-3.5 w-3.5"
                          />
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (!confirm(`Delete "${prod.name}" (${prod.supplier}) from the catalogue permanently?`)) return;
                              try {
                                await deleteSupplierProduct.mutateAsync(prod.id);
                                if (selectedProductId === prod.id) setSelectedProductId(null);
                                showToast("Catalog product deleted.", "success");
                              } catch (err: any) {
                                showToast("Error deleting catalog product: " + err.message, "error");
                              }
                            }}
                            title="Delete from catalogue"
                            className="text-outline hover:text-red-600 transition-colors p-0.5"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-outline-variant">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 text-xs border border-outline-variant rounded disabled:opacity-30 hover:bg-surface-container transition-colors"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-outline">Page {page + 1} of {totalPages}</span>
                  <button
                    disabled={page >= totalPages - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 text-xs border border-outline-variant rounded disabled:opacity-30 hover:bg-surface-container transition-colors"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Detailed Comparison & Cost Mapping Actions */}
      <div className="w-5/12 flex flex-col h-full bg-surface-container-low p-8 overflow-y-auto">
        {selectedProduct ? (
          <div className="flex flex-col gap-6">
            {/* Catalog Product Header Card */}
            {isEditingProduct && isManager ? (
              <div className="bg-surface border border-[#c8a96e] p-6 rounded-sm space-y-4">
                <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider block">
                  Edit Supplier Product Record
                </span>
                
                <div>
                  <label className="text-[10px] label-caps text-outline block mb-1">Product Name</label>
                  <input
                    type="text"
                    value={editFormState?.name || ''}
                    onChange={(e) => setEditFormState(prev => prev ? { ...prev, name: e.target.value } : null)}
                    className="w-full px-3 py-1.5 border border-outline bg-surface-container-lowest text-xs focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] label-caps text-outline block mb-1">Wholesaler</label>
                    <select
                      value={editFormState?.supplier || ''}
                      onChange={(e) => setEditFormState(prev => prev ? { ...prev, supplier: e.target.value } : null)}
                      className="w-full px-2 py-1.5 border border-outline bg-surface-container-lowest text-xs"
                    >
                      {uniqueSuppliers.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] label-caps text-outline block mb-1">Pack Cost (£)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={editFormState?.packCost ?? 0}
                      onChange={(e) => setEditFormState(prev => prev ? { ...prev, packCost: parseFloat(e.target.value) || 0 } : null)}
                      className="w-full px-2 py-1 border border-outline text-xs data-tabular"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] label-caps text-outline block mb-1">Pack Size</label>
                    <input
                      type="number"
                      value={editFormState?.packSize ?? 1}
                      onChange={(e) => setEditFormState(prev => prev ? { ...prev, packSize: parseFloat(e.target.value) || 1 } : null)}
                      className="w-full px-2 py-1 border border-outline text-xs data-tabular"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] label-caps text-outline block mb-1">Size Unit</label>
                    <select
                      value={editFormState?.packUnit || 'g'}
                      onChange={(e) => setEditFormState(prev => prev ? { ...prev, packUnit: e.target.value as any } : null)}
                      className="w-full px-2 py-1.5 border border-outline bg-surface-container-lowest text-xs"
                    >
                      {['g', 'ml', 'ea', 'kg', 'l', 'oz'].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>

                <div className="flex gap-2 justify-end pt-2">
                  <button
                    onClick={() => setIsEditingProduct(false)}
                    className="h-8 px-3 border border-outline text-[10px] label-caps font-bold rounded-sm bg-transparent text-outline hover:text-on-surface hover:border-on-surface"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!isManager || !editFormState) return;
                      try {
                        const up = editFormState.packSize > 0 ? editFormState.packCost / editFormState.packSize : 0;
                        await updateSupplierProduct.mutateAsync({
                          id: editFormState.id,
                          data: {
                            name: editFormState.name,
                            supplier: editFormState.supplier,
                            packCost: editFormState.packCost,
                            packSize: editFormState.packSize,
                            packUnit: editFormState.packUnit,
                            unitPrice: up
                          }
                        });
                        setIsEditingProduct(false);
                        showToast("Supplier product pricing updated successfully!", "success");
                      } catch (err: any) {
                        showToast("Error updating catalog product: " + err.message, "error");
                      }
                    }}
                    className="h-8 px-4 bg-primary text-white text-[10px] label-caps font-bold rounded-sm hover:opacity-90"
                  >
                    Save Product
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-surface border border-outline-variant p-6 rounded-sm relative">
                <div className="flex justify-between items-start">
                  <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider block">
                    Supplier Product Record
                  </span>
                  {isManager && (
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => {
                          setEditFormState(selectedProduct);
                          setIsEditingProduct(true);
                        }}
                        className="text-xs text-primary font-bold hover:underline bg-transparent border-none p-0 cursor-pointer"
                      >
                        Edit Price/Details
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Delete "${selectedProduct.name}" (${selectedProduct.supplier}) from the catalogue permanently?`)) return;
                          try {
                            await deleteSupplierProduct.mutateAsync(selectedProduct.id);
                            setSelectedProductId(null);
                            showToast("Catalog product deleted.", "success");
                          } catch (err: any) {
                            showToast("Error deleting catalog product: " + err.message, "error");
                          }
                        }}
                        className="text-xs text-red-600 font-bold hover:underline bg-transparent border-none p-0 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
                <h2 className="headline-sm text-on-surface font-semibold mt-1">
                  {selectedProduct.name}
                </h2>
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-outline-variant">
                  <div>
                    <span className="text-[10px] label-caps text-outline block">Wholesaler</span>
                    <span className="text-sm font-bold text-on-surface">{selectedProduct.supplier}</span>
                  </div>
                  <div>
                    <span className="text-[10px] label-caps text-outline block">Pricing Rate</span>
                    <span className="text-sm font-bold text-on-surface">{formatUnitPrice(selectedProduct.packCost, selectedProduct.packSize, selectedProduct.packUnit)}</span>
                  </div>
                  <div>
                    <span className="text-[10px] label-caps text-outline block">Pack Size</span>
                    <span className="text-sm font-bold text-on-surface uppercase">{selectedProduct.packSize} {selectedProduct.packUnit}</span>
                  </div>
                </div>
                <a
                  href={getSupplierUrl(selectedProduct)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex items-center justify-center gap-1.5 w-full py-2 border border-outline-variant hover:bg-surface-container text-xs font-semibold rounded-sm transition-colors text-primary"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View on Supplier Site
                </a>
              </div>
            )}

            {/* Linking mode: attach this product to the ingredient that sent us here from Pantry */}
            {isManager && linkBackIngredient && (
              <div className="bg-primary/5 border border-primary/30 p-5 rounded-sm flex flex-col gap-3">
                <div>
                  <span className="text-[10px] label-caps text-primary block">Linking a Supplier Option</span>
                  <span className="text-sm font-bold text-on-surface">for {linkBackIngredient.name}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleLinkBackAdd(selectedProduct)}
                    className="flex-1 h-10 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90"
                  >
                    Add as Supplier Option
                  </button>
                  <button
                    onClick={() => clearLinkBackIngredient()}
                    className="h-10 px-4 border border-outline-variant text-xs font-bold label-caps rounded-sm hover:bg-surface-container"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* comparison container */}
            <div className="flex flex-col gap-4">
              <h3 className="label-caps text-on-surface font-bold">Integration Analysis</h3>

              {/* Match Card */}
              {selectedProduct.matchedIngredient ? (
                <div className="flex flex-col gap-4 bg-emerald-500/5 border border-emerald-500/20 p-6 rounded-sm">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] label-caps text-emerald-700 block">Linked Pantry Item</span>
                      <span className="text-md font-bold text-emerald-900">{selectedProduct.matchedIngredient.name}</span>
                    </div>
                    {isManager && (
                      <button
                        onClick={() => setLinkingProductId(selectedProduct.id)}
                        className="text-[10px] text-emerald-700 border border-emerald-500/30 hover:bg-emerald-500/10 px-2 py-1 label-caps font-bold rounded-sm"
                      >
                        Remap Link
                      </button>
                    )}
                  </div>

                  {/* Comparisons */}
                  <div className="bg-surface-container p-4 rounded-sm flex flex-col gap-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-outline">Pantry Preferred Cost:</span>
                      <span className="font-semibold text-on-surface">{selectedProduct.currentPreferredCostStr}</span>
                    </div>

                    <div className="flex justify-between text-xs border-t border-outline-variant pt-2">
                      <span className="text-outline">Catalog Product Cost:</span>
                      <span className="font-bold text-on-surface">{formatUnitPrice(selectedProduct.packCost, selectedProduct.packSize, selectedProduct.packUnit)}</span>
                    </div>

                    {selectedProduct.isCheaper ? (
                      <div className="bg-success-container border border-success p-3 text-on-success-container flex gap-2 items-center text-xs mt-2">
                        <Sparkles className="h-4 w-4 text-success" />
                        <div>
                          <span className="font-bold">Cheaper Option Detected!</span>
                          <p className="mt-0.5">
                            This catalog product will save you <span className="font-bold">{Math.round(selectedProduct.percentSaved)}%</span> compared to your current preferred pricing.
                          </p>
                        </div>
                      </div>
                    ) : selectedProduct.currentPrefRate > 0 ? (
                      <div className="bg-surface-container-high border border-outline-variant p-3 text-on-surface-variant flex gap-2 items-center text-xs mt-2">
                        <CheckCircle className="h-4 w-4 text-primary" />
                        <div>
                          <span className="font-semibold">Current preferred pricing is optimized.</span>
                          <p className="mt-0.5">Your pantry preferred price is cheaper or matches this product rate.</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-error-container border border-error p-3 text-on-error-container flex gap-2 items-center text-xs mt-2">
                        <HelpCircle className="h-4 w-4 text-error" />
                        <div>
                          <span className="font-bold">No supplier pricing setup.</span>
                          <p className="mt-0.5">This pantry ingredient has no supplier pricing packages configured yet.</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Save/Use Action Buttons — hidden in linking mode, where the guided
                      "Add as Supplier Option" banner at the top is the single action. */}
                  {linkBackIngredient ? null : isManager ? (
                    <div className="flex flex-col gap-2 mt-2">
                      <button
                        onClick={() => handleApplyCheaperOption(selectedProduct, selectedProduct.matchedIngredient!, true)}
                        className="w-full h-11 bg-primary text-on-primary label-caps font-bold text-xs rounded-sm hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                      >
                        Set as Preferred Supplier Package
                      </button>
                      <button
                        onClick={() => handleApplyCheaperOption(selectedProduct, selectedProduct.matchedIngredient!, false)}
                        className="w-full h-11 border border-primary text-primary hover:bg-surface-container label-caps font-bold text-xs rounded-sm transition-opacity flex items-center justify-center gap-2"
                      >
                        Add as Supplier Option
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-outline label-caps mt-2">View only — ask a manager to update pricing</span>
                  )}
                </div>
              ) : (
                /* Unlinked View */
                <div className="bg-surface border border-outline-variant p-6 rounded-sm flex flex-col gap-4 text-center">
                  <div className="flex flex-col items-center gap-2 py-4">
                    <HelpCircle className="h-10 w-10 text-outline" />
                    <span className="font-bold text-on-surface">Not Linked to Master Registry</span>
                    <p className="text-xs text-outline max-w-sm">
                      This supplier product is not associated with any master ingredient in your pantry database.
                    </p>
                  </div>

                  {isManager ? (
                    <div className="flex flex-col gap-2 border-t border-outline-variant pt-4">
                      <button
                        onClick={() => handleCreateIngredientFromProduct(selectedProduct)}
                        className="w-full h-10 border border-primary text-primary hover:bg-surface-container label-caps font-bold text-xs rounded-sm flex items-center justify-center gap-1.5"
                      >
                        <PlusCircle className="h-4 w-4" />
                        Create Pantry Ingredient
                      </button>

                      <button
                        onClick={() => setLinkingProductId(selectedProduct.id)}
                        className="w-full h-10 border border-outline text-outline hover:text-on-surface hover:border-on-surface label-caps font-bold text-xs rounded-sm flex items-center justify-center gap-1.5"
                      >
                        <LinkIcon className="h-4 w-4" />
                        Link to Existing Ingredient
                      </button>
                    </div>
                  ) : (
                    <span className="text-[10px] text-outline label-caps border-t border-outline-variant pt-4 block">
                      View only — ask a manager to link or create pantry items
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Manual Linking Dialog (if triggered) */}
            {isManager && linkingProductId === selectedProduct.id && (
              <div className="bg-surface border border-primary p-6 rounded-sm">
                <h3 className="text-sm font-bold text-on-surface mb-3">Link Product to Master Ingredient</h3>
                <div className="flex flex-col gap-3">
                  <select
                    className="w-full px-3 py-2 border border-outline bg-surface-container-lowest text-xs focus:outline-none"
                    defaultValue=""
                    onChange={(e) => {
                      const ingId = e.target.value;
                      if (ingId) {
                        setManualMatches(prev => ({ ...prev, [selectedProduct.id]: ingId }));
                        setLinkingProductId(null);
                      }
                    }}
                  >
                    <option value="" disabled>Select Ingredient...</option>
                    {ingredients.map(ing => (
                      <option key={ing.id} value={ing.id}>{ing.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => setLinkingProductId(null)}
                    className="h-8 px-4 text-xs font-semibold text-outline hover:text-on-surface border border-outline rounded-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 flex flex-col justify-center items-center text-center text-outline gap-3">
            <Sparkles className="h-12 w-12 text-outline" />
            <h3 className="font-semibold text-sm">Select a Product</h3>
            <p className="text-xs max-w-xs leading-relaxed">
              Choose a product from the supplier catalogue to view comparisons and set master preferred pricing options.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Catalog;
