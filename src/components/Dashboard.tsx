import React, { useMemo } from 'react';
import { useIngredients, useRecipes, useDishes, useScrapeLogs, useAllSupplierProducts } from '../hooks/useKitchenData';
import { AlertCircle, AlertTriangle, FileText, CheckCircle, TrendingUp, Check, Clock, Thermometer, Refrigerator, Trash2 } from 'lucide-react';
import { useStore } from '../store/useStore';
import { calculateIngredientCost, getBaseUnit, calculatePlateCost } from '../utils/costing';

export const Dashboard: React.FC = () => {
  const { data: ingredients = [], isLoading: loadingIngs } = useIngredients();
  const { data: recipes = [], isLoading: loadingRecs } = useRecipes();
  const { data: dishes = [], isLoading: loadingDishes } = useDishes();
  const setView = useStore((state) => state.setView);
  const navigateToPantryWithIngredient = useStore((state) => state.navigateToPantryWithIngredient);
  const navigateToStockWithIngredient = useStore((state) => state.navigateToStockWithIngredient);

  const { data: allProductsData } = useAllSupplierProducts();
  const supplierSummary = allProductsData?.bySupplier ?? {};
  const { data: scrapeLogs = [] } = useScrapeLogs();

  const getStockValue = (ing: any) => {
    if (!ing.stockLevel || ing.stockLevel <= 0) return 0;
    // Child cuts (whole-animal breakdown) have no supplier pricing of their
    // own — their cost derives from the parent, always resolved as weight.
    if (ing.parentIngredientId) {
      return calculateIngredientCost(ing, ing.stockLevel, 'g', ingredients);
    }
    const pref = ing.suppliers?.find((s: any) => s.isPreferred) || ing.suppliers?.[0];
    if (!pref) return 0;
    const baseUnit = getBaseUnit(pref.packUnit);
    return calculateIngredientCost(ing, ing.stockLevel, baseUnit, ingredients);
  };

  const getStockWeightKg = (ing: any) => {
    if (!ing.stockLevel || ing.stockLevel <= 0) return 0;
    if (ing.parentIngredientId) return ing.stockLevel / 1000;
    const pref = ing.suppliers?.find((s: any) => s.isPreferred) || ing.suppliers?.[0];
    if (!pref) return 0;
    const baseUnit = getBaseUnit(pref.packUnit);
    if (baseUnit === 'ea') {
      const pieceWeight = ing.pieceWeight || ing.eaWeight || 50;
      return (ing.stockLevel * pieceWeight) / 1000;
    }
    return ing.stockLevel / 1000;
  };

  const stockItemsData = useMemo(() => {
    return ingredients
      .map(ing => {
        const val = getStockValue(ing);
        const wt = getStockWeightKg(ing);
        return {
          id: ing.id,
          name: ing.name,
          category: ing.category,
          stockLevel: ing.stockLevel,
          value: val,
          weight: wt,
          unit: ing.suppliers?.find((s: any) => s.isPreferred)?.packUnit || 'g'
        };
      })
      .filter(item => item.stockLevel > 0);
  }, [ingredients]);

  // Statistical outlier and holding anomaly detection (AI-Free)
  const anomalies = useMemo(() => {
    if (stockItemsData.length === 0) return [];

    const values = stockItemsData.map(item => item.value);
    const weights = stockItemsData.map(item => item.weight);

    const getMedian = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    const medianVal = getMedian(values);
    const valDeviations = values.map(v => Math.abs(v - medianVal));
    const madVal = getMedian(valDeviations) || 1.0;

    const medianWt = getMedian(weights);
    const wtDeviations = weights.map(w => Math.abs(w - medianWt));
    const madWt = getMedian(wtDeviations) || 0.1;

    const list: Array<{
      id: string;
      name: string;
      type: string;
      severity: 'error' | 'warning';
      title: string;
      message: string;
      value: number;
    }> = [];

    stockItemsData.forEach(item => {
      // 1. Negative Stock Alert
      if (item.stockLevel < 0) {
        list.push({
          id: item.id,
          name: item.name,
          type: 'negative',
          severity: 'error',
          title: 'Negative Stock',
          message: `Stock level of ${item.stockLevel} ${item.unit} suggests an input or calculation error.`,
          value: item.value
        });
        return;
      }

      // High-value categories (Meat, Fish, Alcohol) or names containing beef/steak require higher thresholds
      const isHighValueCategory = 
        item.category === 'Meat' || 
        item.category === 'Fish' || 
        item.category === 'Alcohol' || 
        item.name.toLowerCase().includes('beef') || 
        item.name.toLowerCase().includes('steak');

      const cashLockLimit = isHighValueCategory ? 1200 : 500;
      const valueOutlierLimit = isHighValueCategory ? 400 : 150;
      const zScoreThreshold = isHighValueCategory ? 5.0 : 3.0;

      // 2. Critical Cash Lock Alert (Single item value >= cashLockLimit)
      if (item.value >= cashLockLimit) {
        list.push({
          id: item.id,
          name: item.name,
          type: 'cash_lock',
          severity: 'error',
          title: 'Critical Cash Lock',
          message: `Holding £${item.value.toFixed(2)} worth of this ingredient exceeds the £${cashLockLimit} advisory limit for this category.`,
          value: item.value
        });
      }
      // 3. Statistical Value Outlier (High Value Spike)
      else if (item.value > valueOutlierLimit) {
        const zScore = (item.value - medianVal) / (1.4826 * madVal);
        if (zScore > zScoreThreshold) {
          list.push({
            id: item.id,
            name: item.name,
            type: 'value_outlier',
            severity: 'warning',
            title: 'Value Outlier',
            message: `£${item.value.toFixed(2)} is statistically abnormal compared to other pantry items (median: £${medianVal.toFixed(2)}).`,
            value: item.value
          });
        }
      }

      // 4. Statistical Weight/Volume Outlier (High Quantity Spike)
      if (item.weight > 50) {
        const zScoreWt = (item.weight - medianWt) / (1.4826 * madWt);
        if (zScoreWt > 3.5) {
          list.push({
            id: item.id,
            name: item.name,
            type: 'qty_outlier',
            severity: 'warning',
            title: 'Quantity Outlier',
            message: `Holding ${item.weight.toFixed(1)} kg/L is statistically higher than typical volumes.`,
            value: item.value
          });
        }
      }
    });

    // Sort: errors first, then by value descending
    return list.sort((a, b) => {
      if (a.severity === 'error' && b.severity !== 'error') return -1;
      if (a.severity !== 'error' && b.severity === 'error') return 1;
      return b.value - a.value;
    });
  }, [stockItemsData]);

  // Supplier staleness
  const supplierStaleness = useMemo(() => {
    const STALE_DAYS = 30;
    const now = Date.now();
    return Object.entries(supplierSummary)
      .filter(([sup]) => sup !== 'Internal')
      .map(([supplier, { count, latestAt }]) => {
        const lastDate = latestAt ? new Date(latestAt) : null;
        const daysAgo = lastDate ? Math.floor((now - lastDate.getTime()) / 86400000) : null;
        const isStale = daysAgo === null || daysAgo > STALE_DAYS;
        return { supplier, count, daysAgo, isStale, lastDate };
      })
      .sort((a, b) => (b.daysAgo ?? 9999) - (a.daysAgo ?? 9999));
  }, [supplierSummary]);

  // Statistics calculations
  const totalIngredients = ingredients.length;
  const auditedIngredients = ingredients.filter(i => i.audited).length;
  const auditPercent = totalIngredients ? Math.round((auditedIngredients / totalIngredients) * 100) : 0;

  const totalRecipes = recipes.length;
  const totalDishes = dishes.length;

  // Average actual GP% across live-menu dishes only, so the headline number
  // reflects what's actually being sold rather than the full historical list.
  const liveDishGP = useMemo(() => {
    const liveDishes = dishes.filter(d => d.isLive && d.retailPrice > 0);
    if (liveDishes.length === 0) return null;
    const totalGP = liveDishes.reduce((sum, dish) => {
      const cost = calculatePlateCost(dish.items, ingredients, recipes);
      const gp = ((dish.retailPrice - cost) / dish.retailPrice) * 100;
      return sum + gp;
    }, 0);
    return totalGP / liveDishes.length;
  }, [dishes, ingredients, recipes]);

  const isLoading = loadingIngs || loadingRecs || loadingDishes;

  if (isLoading) {
    return (
      <div className="p-8 flex items-center justify-center h-full bg-surface-container-lowest">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
          <span className="label-caps text-outline">Loading Dashboard data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 h-full overflow-y-auto flex flex-col gap-4 sm:gap-8 bg-surface-container-lowest">
      {/* 1. TOP STATS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        {/* Stat Card: Ingredients */}
        <div 
          onClick={() => setView('pantry')}
          className="bg-surface border border-outline-variant p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex justify-between items-start">
            <span className="label-caps text-outline">Master Pantry</span>
            <DatabaseIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="display-lg text-primary mt-2 data-tabular">{totalIngredients}</div>
          <div className="flex items-center gap-1.5 mt-2">
            <CheckCircle className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-on-surface font-semibold">{auditPercent}% Audited & Verified</span>
          </div>
        </div>

        {/* Stat Card: Recipes */}
        <div 
          onClick={() => setView('kitchen')}
          className="bg-surface border border-outline-variant p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex justify-between items-start">
            <span className="label-caps text-outline">Formulations (Recipes)</span>
            <ChefHatIcon className="h-5 w-5 text-primary" />
          </div>
          <div className="display-lg text-primary mt-2 data-tabular">{totalRecipes}</div>
          <div className="flex items-center gap-1.5 mt-2">
            <FileText className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs text-on-surface font-semibold">Active Prep Base</span>
          </div>
        </div>

        {/* Stat Card: Dishes */}
        <div 
          onClick={() => setView('service')}
          className="bg-surface border border-outline-variant p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex justify-between items-start">
            <span className="label-caps text-outline">Menu Dishes (GP%)</span>
            <TrendingUp className="h-5 w-5 text-primary" />
          </div>
          <div className="display-lg text-primary mt-2 data-tabular">{totalDishes}</div>
          <div className="flex items-center gap-1.5 mt-2">
            {liveDishGP !== null ? (
              <span className={`text-xs px-2 py-0.5 font-bold rounded-sm ${liveDishGP >= 70 ? 'text-primary bg-secondary-container' : 'text-error bg-error-container'}`}>
                {liveDishGP.toFixed(1)}% Avg GP (Live Menu)
              </span>
            ) : (
              <span className="text-xs text-outline bg-surface-container px-2 py-0.5 font-bold rounded-sm">No live dishes tagged yet</span>
            )}
          </div>
        </div>
      </div>

      {/* 1b. QUICK ACCESS DURING SERVICE */}
      <div className="grid grid-cols-3 gap-4 sm:gap-6">
        <div
          onClick={() => setView('food-temp')}
          className="bg-surface border border-outline-variant p-4 sm:p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 text-center sm:text-left"
        >
          <Thermometer className="h-5 w-5 text-primary flex-shrink-0" />
          <span className="label-caps text-on-surface font-bold">Food Temps</span>
        </div>

        <div
          onClick={() => setView('equipment-temp')}
          className="bg-surface border border-outline-variant p-4 sm:p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 text-center sm:text-left"
        >
          <Refrigerator className="h-5 w-5 text-primary flex-shrink-0" />
          <span className="label-caps text-on-surface font-bold">Fridge Temps</span>
        </div>

        <div
          onClick={() => setView('stock-waste')}
          className="bg-surface border border-outline-variant p-4 sm:p-6 rounded-sm cursor-pointer hover:bg-surface-container transition-colors flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 text-center sm:text-left"
        >
          <Trash2 className="h-5 w-5 text-primary flex-shrink-0" />
          <span className="label-caps text-on-surface font-bold">Wastage</span>
        </div>
      </div>

      {/* 2. OPERATIONAL BULLETINS & ANOMALIES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Left column: Database Health & Smart Flags */}
        <div className="flex flex-col gap-6">
          {/* Scraper Status Card */}
          <div className="border border-outline-variant p-6 rounded-sm flex flex-col gap-4 bg-surface-container-lowest">
            <div className="flex justify-between items-center border-b border-outline-variant pb-2">
              <h3 className="label-caps text-on-surface font-bold flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                Catalog Freshness
              </h3>
              {supplierStaleness.some(s => s.isStale) && (
                <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase bg-amber-500/10 text-amber-700">
                  {supplierStaleness.filter(s => s.isStale).length} stale
                </span>
              )}
            </div>
            <div className="flex flex-col gap-2">
              {supplierStaleness.length === 0 ? (
                <p className="text-xs text-on-surface-variant">No catalog data found. Run the Chrome extension to scrape supplier prices.</p>
              ) : supplierStaleness.map(s => (
                <div key={s.supplier} className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${s.isStale ? 'text-amber-600' : 'text-on-surface'}`}>{s.supplier}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-on-surface-variant data-tabular">{s.count.toLocaleString()} products</span>
                    <span className={`font-semibold data-tabular ${s.isStale ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {s.daysAgo === null ? 'Never scraped' : s.daysAgo === 0 ? 'Today' : `${s.daysAgo}d ago`}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Stock Holding Alerts Card (Statistical & Absolute Flags - AI-Free) */}
          <div className="border border-outline-variant p-6 rounded-sm flex flex-col gap-4 bg-surface-container-lowest">
            <div className="flex justify-between items-center border-b border-outline-variant pb-2">
              <h3 className="label-caps text-on-surface font-bold flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 text-primary" />
                Smart Stock Flags
              </h3>
              {anomalies.length > 0 && (
                <span className={`px-2.5 py-0.5 text-[10px] font-bold rounded-full uppercase ${
                  anomalies.some(a => a.severity === 'error')
                    ? 'bg-error-container text-error'
                    : 'bg-amber-500/10 text-amber-900 dark:text-amber-200'
                }`}>
                  {anomalies.length} {anomalies.length === 1 ? 'Alert' : 'Alerts'}
                </span>
              )}
            </div>

            {anomalies.length === 0 ? (
              <div className="flex items-center gap-3 p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-sm text-xs text-emerald-700">
                <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0 text-emerald-600">
                  <Check className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-emerald-800">All holdings verified</div>
                  <div className="text-[10px] text-emerald-600 mt-0.5">No statistical outliers or negative stock levels detected in your pantry.</div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                {anomalies.map((anomaly, idx) => (
                  <div
                    key={`${anomaly.id}-${anomaly.type}`}
                    onClick={() => navigateToStockWithIngredient(anomaly.id)}
                    className={`flex gap-3 p-3 border border-outline-variant rounded-sm cursor-pointer hover:bg-surface-container transition-colors ${
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-black/[0.0075]'
                    }`}
                    title={`Click to adjust "${anomaly.name}" stock level`}
                  >
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      anomaly.severity === 'error'
                        ? 'bg-error-container text-error'
                        : 'bg-amber-500/10 text-amber-600'
                    }`}>
                      {anomaly.severity === 'error' ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <AlertTriangle className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center gap-2">
                        <span className="font-semibold text-xs text-on-surface truncate">
                          {anomaly.name}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${
                          anomaly.severity === 'error' ? 'text-error' : 'text-amber-600'
                        }`}>
                          {anomaly.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-on-surface-variant mt-1 leading-relaxed">
                        {anomaly.message}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Simple inline icons to avoid extra imports
const DatabaseIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
    <path d="M3 5V19A9 3 0 0 0 21 19V5"></path>
    <path d="M3 12A9 3 0 0 0 21 12"></path>
  </svg>
);

const ChefHatIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M6 18V6a4 4 0 0 1 8 0v12"></path>
    <path d="M18 18V9a4 4 0 0 0-8 0v9"></path>
    <path d="M3 18h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z"></path>
  </svg>
);
export default Dashboard;
