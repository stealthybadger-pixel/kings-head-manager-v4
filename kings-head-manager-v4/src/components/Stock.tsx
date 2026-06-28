import React, { useState, useMemo, useEffect } from 'react';
import { useIngredients, useStockMutations } from '../hooks/useKitchenData';
import { useStore } from '../store/useStore';
import { Search, Plus, Trash2, ArrowUpRight, Scale, FileText, CheckCircle2, ChevronRight, Check } from 'lucide-react';
import { Ingredient, StockMovementType, ContainerProfile, Unit } from '../types';

export const Stock: React.FC = () => {
  const { data: ingredients = [], isLoading } = useIngredients();
  const { logMovement } = useStockMutations();

  // Scale states from Zustand
  const scaleConnected = useStore((state) => state.scaleConnected);
  const showToast = useStore((state) => state.showToast);
  const setScaleConnected = useStore((state) => state.setScaleConnected);
  const scaleWeightGrams = useStore((state) => state.scaleWeightGrams);
  const setScaleWeight = useStore((state) => state.setScaleWeight);
  const selectedIngredientId = useStore((state) => state.selectedIngredientId);
  const selectIngredient = useStore((state) => state.selectIngredient);
  
  // Local dialog triggers
  const [showWastePanel, setShowWastePanel] = useState(false);
  const [showStockTake, setShowStockTake] = useState(false);
  const [showEposImport, setShowEposImport] = useState(false);

  // Stock On Hand Directory state
  const [stockSearchQuery, setStockSearchQuery] = useState('');
  const [selectedStockCategory, setSelectedStockCategory] = useState('All');
  const [editingCounts, setEditingCounts] = useState<Record<string, string>>({});

  // Waste log state
  const [wasteIngId, setWasteIngId] = useState('');
  const [wasteQty, setWasteQty] = useState(0);
  const [wasteUnit, setWasteUnit] = useState<Unit>('g');
  const [wasteReason, setWasteReason] = useState('Spoil');

  // Stock take state
  const [activeLocation, setActiveLocation] = useState('Dry Store');
  const [stockCounts, setStockCounts] = useState<Record<string, number>>({});
  const [scaleTareId, setScaleTareId] = useState<string>('none');

  // EPOS Sales Importer state
  const [eposFile, setEposFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [varianceReport, setVarianceReport] = useState<{
    name: string;
    projected: number;
    actual: number;
    variance: number;
    unit: string;
    costLoss: number;
  }[] | null>(null);

  // Mock container profiles for scale tare demo
  const containerProfiles: ContainerProfile[] = [
    { id: '10l_tub', name: '10L Green Tub', tareWeight: 450 },
    { id: '4l_tub', name: '4L Square Tub', tareWeight: 220 },
    { id: '2l_bottle', name: '2L Squeeze Bottle', tareWeight: 85 },
    { id: '1l_tub', name: '1L Round Tub', tareWeight: 60 }
  ];

  // Mock Bluetooth scale reading trigger
  const handleSimulateScaleWeight = () => {
    if (!scaleConnected) return;
    // Simulate placing a 10L tub with 2kg of soup on scale (2000g + 450g tare = 2450g)
    setScaleWeight(2450);
  };

  const activeTare = useMemo(() => {
    if (scaleTareId === 'none') return 0;
    return containerProfiles.find(c => c.id === scaleTareId)?.tareWeight || 0;
  }, [scaleTareId]);

  const netWeightGrams = useMemo(() => {
    return Math.max(0, scaleWeightGrams - activeTare);
  }, [scaleWeightGrams, activeTare]);

  const isSaving = logMovement.isPending;

  // Handle Waste Save
  const handleSaveWaste = async () => {
    if (!wasteIngId || wasteQty <= 0) return;
    const ingName = ingredients.find(i => i.id === wasteIngId)?.name || 'Ingredient';
    try {
      await logMovement.mutateAsync({
        ingredientId: wasteIngId,
        type: 'waste',
        quantity: -Math.abs(wasteQty),
        date: new Date().toISOString().slice(0, 10),
        costValue: 0 // Will compute based on unit price in production
      });
      showToast(`Recorded waste for ${ingName} (${wasteQty}${wasteUnit}) successfully!`, "success");
      setShowWastePanel(false);
      setWasteIngId('');
      setWasteQty(0);
    } catch(err: any) {
      console.error(err);
      showToast(err.message || `Failed to record waste for ${ingName}`, "error");
    }
  };

  // Handle Sunday Stock Take Commit
  const handleCommitStockTake = async () => {
    try {
      let adjustmentCount = 0;
      // Loop through counts and write adjustments to Firestore
      for (const [ingId, count] of Object.entries(stockCounts)) {
        const ing = ingredients.find(i => i.id === ingId);
        if (ing) {
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
        }
      }
      showToast(
        adjustmentCount > 0 
          ? `Stock take committed successfully with ${adjustmentCount} adjustments.` 
          : "Stock take committed successfully (no changes needed).", 
        "success"
      );
      setShowStockTake(false);
      setStockCounts({});
    } catch(err: any) {
      console.error(err);
      showToast(err.message || "Failed to commit stock take counts", "error");
    }
  };

  // Mock EPOS sales explosion
  const handleRunEposImport = () => {
    if (!eposFile) return;
    setImporting(true);
    
    setTimeout(() => {
      setVarianceReport([
        { name: 'Beef Mince', projected: 4500, actual: 3000, variance: -1500, unit: 'g', costLoss: 13.50 },
        { name: 'Double Cream', projected: 1200, actual: 1200, variance: 0, unit: 'ml', costLoss: 0.00 },
        { name: 'Maris Piper Potatoes', projected: 25, actual: 15, variance: -10, unit: 'kg', costLoss: 8.10 },
        { name: 'Red Wine', projected: 1500, actual: 1400, variance: -100, unit: 'ml', costLoss: 1.60 }
      ]);
      setImporting(false);
    }, 1500);
  };

  // Filtered ingredients for the Stock On Hand Directory
  const filteredStockIngredients = useMemo(() => {
    return ingredients.filter(ing => {
      const matchesSearch = ing.name.toLowerCase().includes(stockSearchQuery.toLowerCase()) || 
                            ing.category.toLowerCase().includes(stockSearchQuery.toLowerCase());
                            
      if (selectedStockCategory === 'All') return matchesSearch;
      
      if (selectedStockCategory === 'Dry Store') {
        return matchesSearch && (ing.category === 'Dry Store' || ing.category === 'Alcohol');
      }
      if (selectedStockCategory === 'Walk-In Fridge') {
        return matchesSearch && (ing.category === 'Dairy' || ing.category === 'Meat' || ing.category === 'Fish' || ing.category === 'Vegetable' || ing.category === 'Fruit');
      }
      if (selectedStockCategory === 'Walk-In Freezer') {
        return matchesSearch && ing.category === 'Frozen';
      }
      return matchesSearch && ing.category === selectedStockCategory;
    });
  }, [ingredients, stockSearchQuery, selectedStockCategory]);

  // Handle single ingredient stock level quick edit
  const handleSaveSingleAdjustment = async (ing: Ingredient) => {
    const typedVal = editingCounts[ing.id];
    if (typedVal === undefined) return;
    const newCount = parseFloat(typedVal) || 0;
    const oldCount = ing.stockLevel || 0;
    const delta = newCount - oldCount;
    
    if (delta !== 0) {
      try {
        await logMovement.mutateAsync({
          ingredientId: ing.id,
          type: 'adjustment',
          quantity: delta,
          date: new Date().toISOString().slice(0, 10),
          costValue: 0
        });
        showToast(`Adjusted ${ing.name} stock level to ${newCount}.`, "success");
        setEditingCounts(prev => {
          const next = { ...prev };
          delete next[ing.id];
          return next;
        });
        // Reset the selection highlight in Zustand
        selectIngredient(null);
      } catch (err: any) {
        showToast(err.message || "Failed to save stock adjustment", "error");
      }
    }
  };

  // Scroll target ingredient from dashboard flag into view and reset filters to show it
  useEffect(() => {
    if (selectedIngredientId) {
      setStockSearchQuery('');
      setSelectedStockCategory('All');
      
      setTimeout(() => {
        const element = document.getElementById(`stock-row-${selectedIngredientId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
    }
  }, [selectedIngredientId]);

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-container-lowest">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="p-8 h-full overflow-y-auto flex flex-col gap-8 bg-surface-container-lowest">
      
      {/* 1. CONTROL BAR */}
      <div className="flex justify-between items-center border-b border-outline-variant pb-4">
        <div>
          <h2 className="headline-sm font-semibold">Stock Ledger & Audits</h2>
          <span className="text-xs text-outline label-caps">EPOS COMPONENT WATERFALL</span>
        </div>
        
        <div className="flex gap-4">
          <button 
            onClick={() => setShowEposImport(true)}
            className="h-10 px-4 border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container"
          >
            Import EPOS Sales
          </button>
          
          <button 
            onClick={() => setShowWastePanel(true)}
            className="h-10 px-4 border border-error text-error text-xs font-bold label-caps rounded-sm hover:bg-error-container"
          >
            Log Waste
          </button>
          
          <button 
            onClick={() => setShowStockTake(true)}
            className="h-10 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90"
          >
            Sunday Stock Take
          </button>
        </div>
      </div>

      {/* 2. SUMMARY GRID */}
      <div className="grid grid-cols-2 gap-6">
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

      {/* 3. STOCK ON HAND DIRECTORY (QUICK EDIT) */}
      <div className="border border-outline-variant p-6 rounded-sm flex flex-col gap-4 bg-surface-container-lowest">
        <div className="flex justify-between items-center border-b border-outline-variant pb-2 flex-wrap gap-4">
          <div>
            <h3 className="label-caps text-on-surface font-bold flex items-center gap-1.5">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Stock On Hand Directory
            </h3>
            <span className="text-[10px] text-outline mt-0.5 block">Review and adjust stock quantities directly. Click dashboard alerts to highlight items.</span>
          </div>
          
          <div className="flex gap-4 items-center flex-wrap">
            {/* Search Box */}
            <div className="relative flex items-center bg-surface-container-low border border-outline-variant rounded-sm px-3 py-1">
              <Search className="h-3.5 w-3.5 text-outline mr-2" />
              <input 
                type="text" 
                placeholder="Search stock..." 
                value={stockSearchQuery}
                onChange={(e) => setStockSearchQuery(e.target.value)}
                className="w-40 text-xs bg-transparent outline-none border-none focus:ring-0 p-0"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedStockCategory}
              onChange={(e) => setSelectedStockCategory(e.target.value)}
              className="px-2 py-1 border border-outline-variant bg-surface-container-low text-xs rounded-sm focus:outline-none"
            >
              <option value="All">All Locations</option>
              <option value="Dry Store">Dry Store & Alcohol</option>
              <option value="Walk-In Fridge">Walk-In Fridge (Meat, Veg, Dairy)</option>
              <option value="Walk-In Freezer">Walk-In Freezer (Frozen)</option>
            </select>
          </div>
        </div>

        {filteredStockIngredients.length === 0 ? (
          <div className="py-8 text-center text-outline text-xs">
            No ingredients found matching filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[400px] overflow-y-auto pr-1">
            {filteredStockIngredients.map((ing, idx) => {
              const pref = ing.suppliers?.find((s: any) => s.isPreferred) || ing.suppliers?.[0];
              const displayUnit = pref?.packUnit || 'g';
              const displayVal = editingCounts[ing.id] !== undefined 
                ? editingCounts[ing.id] 
                : (ing.stockLevel !== undefined && ing.stockLevel !== null ? ing.stockLevel : '');
              const hasChanged = editingCounts[ing.id] !== undefined && parseFloat(editingCounts[ing.id]) !== (ing.stockLevel || 0);
              const isHighlighted = selectedIngredientId === ing.id;

              return (
                <div 
                  key={ing.id}
                  id={`stock-row-${ing.id}`}
                  className={`p-4 border rounded-sm flex items-center justify-between transition-all duration-300 ${
                    isHighlighted 
                      ? 'border-primary bg-primary/[0.03] ring-1 ring-primary' 
                      : idx % 2 === 0 
                        ? 'border-outline-variant bg-transparent' 
                        : 'border-outline-variant bg-black/[0.0075]'
                  }`}
                >
                  <div className="min-w-0 flex-1 pr-4">
                    <div className="font-semibold text-xs text-on-surface flex items-center gap-2">
                      <span className="truncate">{ing.name}</span>
                      {isHighlighted && (
                        <span className="bg-primary text-white text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider animate-pulse flex-shrink-0">
                          Target
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-outline uppercase tracking-wider mt-1">
                      {ing.category} • Current: {ing.stockLevel || 0} {displayUnit}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input 
                      type="number"
                      step="any"
                      value={displayVal}
                      onChange={(e) => setEditingCounts(prev => ({ ...prev, [ing.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveSingleAdjustment(ing);
                      }}
                      className={`w-20 px-2 py-1 border border-outline-variant text-center data-tabular text-xs font-bold bg-surface-container-lowest focus:border-primary ${
                        hasChanged ? 'border-primary ring-1 ring-primary/20' : ''
                      }`}
                    />
                    <span className="text-xs font-semibold text-on-surface-variant w-8">
                      {displayUnit}
                    </span>
                    {hasChanged ? (
                      <button
                        onClick={() => handleSaveSingleAdjustment(ing)}
                        className="h-8 px-3 bg-primary text-white text-[10px] font-bold label-caps rounded-sm hover:bg-opacity-90 transition-colors"
                      >
                        Save
                      </button>
                    ) : (
                      <div className="w-12 h-8"></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. TABLET-FRIENDLY DAILY WASTE LOGGING DRAWER / MODAL */}
      {showWastePanel && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-8">
          <div className="w-full max-w-lg bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col p-6 relative">
            <h2 className="headline-sm font-semibold border-b border-outline-variant pb-3 mb-4">
              Daily Wastage Entry
            </h2>
            
            <div className="flex flex-col gap-6">
              <div>
                <label className="label-caps text-outline block mb-2">Select Waste Item</label>
                <select 
                  value={wasteIngId}
                  onChange={(e) => setWasteIngId(e.target.value)}
                  className="w-full px-3 py-3 border border-outline-variant bg-surface-container-lowest text-sm"
                >
                  <option value="">-- Choose Ingredient --</option>
                  {ingredients.map(ing => (
                    <option key={ing.id} value={ing.id}>{ing.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label-caps text-outline block mb-2">Quantity Wasted</label>
                  <input 
                    type="number" 
                    value={wasteQty || ''}
                    onChange={(e) => setWasteQty(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-3 border border-outline-variant text-sm data-tabular text-center"
                    placeholder="0.0"
                  />
                </div>
                <div>
                  <label className="label-caps text-outline block mb-2">Unit</label>
                  <select 
                    value={wasteUnit}
                    onChange={(e) => setWasteUnit(e.target.value as any)}
                    className="w-full px-3 py-3 border border-outline-variant bg-surface-container-lowest text-sm"
                  >
                    <option value="g">grams (g)</option>
                    <option value="kg">kilograms (kg)</option>
                    <option value="ml">milliliters (ml)</option>
                    <option value="l">liters (l)</option>
                    <option value="ea">each (ea)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label-caps text-outline block mb-2">Waste Reason</label>
                <div className="grid grid-cols-3 gap-3">
                  {['Spoil', 'Prep Trim', 'Dropped'].map(reason => (
                    <button 
                      key={reason}
                      onClick={() => setWasteReason(reason)}
                      className={`h-12 border text-xs font-bold label-caps rounded-sm transition-colors ${
                        wasteReason === reason 
                          ? 'bg-primary text-white border-primary' 
                          : 'border-outline-variant bg-surface hover:bg-surface-container'
                      }`}
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-outline-variant pt-4 mt-2">
                <button 
                  onClick={() => setShowWastePanel(false)}
                  className="h-12 px-6 border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container"
                >
                  Discard [ESC]
                </button>
                 <button 
                  onClick={handleSaveWaste}
                  disabled={isSaving || !wasteIngId || wasteQty <= 0}
                  className={`h-12 px-8 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 flex items-center gap-2 ${isSaving || !wasteIngId || wasteQty <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {isSaving ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Save Waste'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. EPOS IMPORTER & VARIANCE MODAL */}
      {showEposImport && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-8">
          <div className="w-full max-w-3xl bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col p-6 relative max-h-[90vh]">
            <h2 className="headline-sm font-semibold border-b border-outline-variant pb-3 mb-4 flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              EPOS Sales Importer & Variance Auditor
            </h2>

            <div className="flex flex-col gap-4 overflow-y-auto pr-1">
              <p className="text-xs text-on-surface-variant leading-relaxed">
                Drag in your weekly EPOS Sales CSV/Excel export. The system will calculate theoretical ingredient usage from your recipes and compare it against your Sunday stock count.
              </p>

              <div className="border-2 border-dashed border-outline-variant p-6 text-center bg-surface hover:bg-surface-container cursor-pointer transition-colors">
                <input 
                  type="file" 
                  onChange={(e) => setEposFile(e.target.files?.[0] || null)}
                  className="hidden" 
                  id="epos-file-input"
                />
                <label htmlFor="epos-file-input" className="cursor-pointer">
                  {eposFile ? (
                    <span className="font-semibold text-sm text-primary">{eposFile.name}</span>
                  ) : (
                    <span className="text-xs text-outline label-caps">Select EPOS Sales CSV/Excel</span>
                  )}
                </label>
              </div>

              {varianceReport && (
                <div className="flex flex-col gap-3 mt-2">
                  <h3 className="label-caps font-bold text-xs text-error">Variance Audit Discrepancies</h3>
                  <div className="border border-outline-variant rounded-sm overflow-hidden bg-surface">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="bg-surface-container border-b border-outline-variant">
                          <th className="p-3 label-caps text-[10px] text-outline font-bold">Ingredient</th>
                          <th className="p-3 label-caps text-[10px] text-outline font-bold text-center">Projected</th>
                          <th className="p-3 label-caps text-[10px] text-outline font-bold text-center">Actual Count</th>
                          <th className="p-3 label-caps text-[10px] text-outline font-bold text-center">Variance</th>
                          <th className="p-3 label-caps text-[10px] text-outline font-bold text-right">Cash Loss (£)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant">
                        {varianceReport.map((row, i) => (
                          <tr key={i} className="hover:bg-surface-container-low">
                            <td className="p-3 font-semibold text-on-surface">{row.name}</td>
                            <td className="p-3 text-center data-tabular text-secondary">{row.projected} {row.unit}</td>
                            <td className="p-3 text-center data-tabular text-on-surface font-semibold">{row.actual} {row.unit}</td>
                            <td className={`p-3 text-center data-tabular font-bold ${row.variance < 0 ? 'text-error' : 'text-primary'}`}>
                              {row.variance} {row.unit}
                            </td>
                            <td className={`p-3 text-right data-tabular font-bold ${row.costLoss > 0 ? 'text-error' : 'text-secondary'}`}>
                              {row.costLoss > 0 ? `-£${row.costLoss.toFixed(2)}` : '£0.00'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 border-t border-outline-variant pt-4 mt-2">
                <button 
                  onClick={() => {
                    setShowEposImport(false);
                    setEposFile(null);
                    setVarianceReport(null);
                  }}
                  className="h-10 px-4 border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container"
                >
                  Close
                </button>
                <button 
                  onClick={handleRunEposImport}
                  disabled={!eposFile || importing}
                  className="h-10 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 disabled:opacity-50"
                >
                  {importing ? 'Processing...' : 'Run Sales Explosion'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. SUNDAY STOCK TAKE PANEL (LOCATION SORTED + TARE PROFILE SELECT) */}
      {showStockTake && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-8">
          <div className="w-full max-w-4xl h-[90vh] bg-surface-container-lowest border border-outline-variant rounded-sm flex flex-col relative overflow-hidden">
            {/* Header info */}
            <div className="h-16 border-b border-outline-variant bg-surface flex items-center px-6 justify-between flex-shrink-0">
              <div>
                <h2 className="headline-sm font-semibold">Sunday Stock Take</h2>
                <span className="text-xs text-outline label-caps">Scale-Ready count</span>
              </div>
              
              {/* Bluetooth Scale status box */}
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setScaleConnected(!scaleConnected)}
                  className={`h-9 px-4 text-xs font-bold label-caps rounded-sm flex items-center gap-2 border transition-colors ${
                    scaleConnected 
                      ? 'bg-secondary-container border-[#90a8ff] text-primary' 
                      : 'border-outline text-outline bg-surface hover:bg-surface-container'
                  }`}
                >
                  <Scale className="h-4 w-4" />
                  {scaleConnected ? 'Scale Connected' : 'Link Bluetooth Scale'}
                </button>
                {scaleConnected && (
                  <button 
                    onClick={handleSimulateScaleWeight}
                    className="h-9 px-3 border border-primary text-primary text-[10px] label-caps font-bold rounded-sm bg-surface hover:bg-surface-container"
                  >
                    Place Tub
                  </button>
                )}
              </div>
            </div>

            {/* Scale reading ribbon */}
            {scaleConnected && (
              <div className="h-14 bg-surface border-b border-outline-variant flex items-center px-6 justify-between text-xs flex-shrink-0">
                <div className="flex items-center gap-6">
                  <div>
                    <span className="text-outline uppercase label-caps text-[9px] mr-2">Tare Container:</span>
                    <select 
                      value={scaleTareId}
                      onChange={(e) => setScaleTareId(e.target.value)}
                      className="px-2 py-1 border border-outline-variant bg-surface-container-lowest text-xs rounded-sm"
                    >
                      <option value="none">None (0g)</option>
                      {containerProfiles.map(c => (
                        <option key={c.id} value={c.id}>{c.name} ({c.tareWeight}g)</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <span className="text-outline uppercase label-caps text-[9px] mr-2">Raw Weight:</span>
                    <span className="data-tabular font-bold text-on-surface">{scaleWeightGrams} g</span>
                  </div>
                  <div>
                    <span className="text-outline uppercase label-caps text-[9px] mr-2">Net Weight:</span>
                    <span className="data-tabular font-bold text-primary">{netWeightGrams} g</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs text-secondary italic">Place container, choose tare type, and tap ingredient count field.</span>
                </div>
              </div>
            )}

            {/* Locations Navigation Ribbon */}
            <div className="h-12 border-b border-outline-variant bg-surface flex items-center px-6 gap-2 flex-shrink-0">
              {['Dry Store', 'Walk-In Fridge', 'Walk-In Freezer'].map(loc => (
                <button 
                  key={loc}
                  onClick={() => setActiveLocation(loc)}
                  className={`h-8 px-4 text-xs font-bold label-caps rounded-sm transition-colors ${
                    activeLocation === loc 
                      ? 'bg-primary text-white' 
                      : 'text-outline hover:bg-surface-container'
                  }`}
                >
                  {loc}
                </button>
              ))}
            </div>

            {/* Ingredients Lists by Location */}
            <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-3">
              {ingredients
                .filter(i => {
                  // Mock grouping: map categories to physical locations
                  if (activeLocation === 'Dry Store') return i.category === 'Dry Store' || i.category === 'Alcohol';
                  if (activeLocation === 'Walk-In Fridge') return i.category === 'Dairy' || i.category === 'Meat' || i.category === 'Fish' || i.category === 'Vegetable' || i.category === 'Fruit';
                  return i.category === 'Frozen';
                })
                .map((ing, idx) => {
                  const currentVal = stockCounts[ing.id] ?? ing.stockLevel ?? 0;
                  return (
                    <div 
                      key={ing.id} 
                      className={`flex items-center justify-between p-4 border border-outline-variant rounded-sm transition-colors ${
                        idx % 2 === 0 ? 'bg-transparent' : 'bg-black/[0.0075]'
                      }`}
                    >
                      <div>
                        <span className="font-semibold text-sm text-on-surface">{ing.name}</span>
                        <div className="text-[10px] text-outline uppercase tracking-wider mt-0.5">
                          Category: {ing.category} • Current Stock: {ing.stockLevel}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {scaleConnected && (
                          <button 
                            onClick={() => {
                              // Auto-deduct tare and convert to kg/l if needed
                              setStockCounts(prev => ({
                                ...prev,
                                [ing.id]: netWeightGrams
                              }));
                            }}
                            className="h-10 w-10 border border-outline flex items-center justify-center rounded-sm bg-surface hover:bg-surface-container"
                          >
                            <Scale className="h-4 w-4" />
                          </button>
                        )}
                        <input 
                          type="number" 
                          value={stockCounts[ing.id] !== undefined ? stockCounts[ing.id] : (ing.stockLevel || '')}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setStockCounts(prev => ({ ...prev, [ing.id]: val }));
                          }}
                          className="w-28 px-3 py-2 border border-outline-variant text-center data-tabular text-sm font-bold bg-surface-container-lowest"
                        />
                      </div>
                    </div>
                  );
                })}
            </div>

            {/* Footer Buttons */}
            <div className="h-16 border-t border-outline-variant bg-surface flex items-center px-6 justify-end gap-4 flex-shrink-0">
              <button 
                onClick={() => {
                  setShowStockTake(false);
                  setStockCounts({});
                }}
                className="h-10 px-4 border border-outline text-xs font-bold label-caps rounded-sm hover:bg-surface-container"
              >
                Cancel
              </button>
               <button 
                onClick={handleCommitStockTake}
                disabled={isSaving}
                className={`h-10 px-6 bg-primary text-white text-xs font-bold label-caps rounded-sm hover:bg-opacity-90 flex items-center gap-2 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isSaving ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Committing...
                  </>
                ) : (
                  'Commit Sunday Counts'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
export default Stock;
