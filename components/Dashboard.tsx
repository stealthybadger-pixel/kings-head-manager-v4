
import React, { useMemo, useState } from 'react';
import { useKitchenData } from '../hooks/useKitchenData';
import { UI_STYLES } from '../constants';
import { Ingredient, Recipe, Dish } from '../types';
import { DashboardAlerts } from './DashboardAlerts';

interface DashboardProps {
  onNavigate: (view: string, targetId?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { ingredients, recipes, dishes, loading } = useKitchenData();
  const [metric, setMetric] = useState<'value' | 'level'>('value');

  // Helper for safe numeric conversion
  const safeNum = (val: any) => (typeof val === 'number' && !isNaN(val)) ? val : 0;

  const incompleteCount = useMemo(() => {
    return ingredients.filter(i => i.incomplete).length;
  }, [ingredients]);

  const stockData = useMemo(() => {
    const calculated = ingredients.map(i => {
      const pref = i.suppliers.find(s => s.isPreferred) || i.suppliers[0];
      const packCost = pref ? safeNum(pref.packCost) : 0;
      const packSize = pref ? safeNum(pref.packSize) : 1;
      const packUnit = pref ? pref.packUnit : 'ea';
      
      const unitCost = packCost / (packSize || 1);
      
      return {
        id: i.id,
        name: i.name || 'Unknown',
        value: safeNum(i.stockLevel) * unitCost, // stockLevel is in packUnits? Assuming yes for now. Or is it packs? Prompt says "in packUnits".
        level: safeNum(i.stockLevel),
        unit: packUnit,
        category: i.category || 'Other'
      };
    });

    return calculated
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 20);
  }, [ingredients, metric]);

  const totalInventoryValue = useMemo(() => {
    return ingredients.reduce((acc, i) => {
      const pref = i.suppliers.find(s => s.isPreferred) || i.suppliers[0];
      const unitCost = pref ? safeNum(pref.packCost) / (safeNum(pref.packSize) || 1) : 0;
      return acc + (safeNum(i.stockLevel) * unitCost);
    }, 0);
  }, [ingredients]);

  const chartMax = useMemo(() => {
    if (metric === 'value') {
      const maxVal = Math.max(...stockData.map(d => d.value), 0);
      return maxVal > 0 ? maxVal * 1.1 : 500;
    }
    const maxVal = Math.max(...stockData.map(d => d.level), 0);
    return maxVal > 0 ? maxVal * 1.1 : 1000;
  }, [stockData, metric]);

  if (loading) return <div className="p-8 font-mono text-xs text-[#666666] animate-pulse">Initializing Data Stream...</div>;

  return (
    <div className="flex flex-col h-full bg-[#111111] overflow-y-auto p-4 md:p-6 space-y-3 md:space-y-4 pb-24 max-w-7xl mx-auto w-full">
      
      {/* Dashboard Header - Minimal Spacing */}
      <div className="border-b border-[#333333] pb-1.5 flex flex-col md:flex-row justify-between items-start md:items-end gap-1">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-[#c8a96e]">Dashboard</h2>
          <p className="font-mono text-[9px] text-[#444444] mt-0.5 uppercase">Operational Status: Optimal // {new Date().toLocaleDateString()}</p>
        </div>
        <div className="flex gap-6 md:gap-8 w-full md:w-auto">
          {incompleteCount > 0 && (
            <button 
              onClick={() => onNavigate('ingredients')}
              className="text-right flex-1 md:flex-none animate-pulse bg-red-950/20 px-4 py-2 border border-red-900/40"
            >
              <div className="text-[8px] font-bold uppercase text-red-500">Incomplete Records</div>
              <div className="text-lg md:text-xl font-mono text-red-400">{incompleteCount} <span className="text-[10px]">Action Required</span></div>
            </button>
          )}
          <div className="text-right flex-1 md:flex-none">
            <div className="text-[8px] font-bold uppercase text-[#666666]">Total Inventory Value</div>
            <div className="text-lg md:text-xl font-mono text-white">£{totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="text-right border-l border-[#333333] pl-6 md:pl-8 flex-1 md:flex-none">
            <div className="text-[8px] font-bold uppercase text-[#666666]">Database Sync</div>
            <div className="text-lg md:text-xl font-mono text-[#c8a96e]">LIVE</div>
          </div>
        </div>
      </div>

      {/* INTELLIGENCE MODULES */}
      <DashboardAlerts />

      {/* Primary Action Grid - Ultra-short buttons */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 md:gap-2">
        <button 
          onClick={() => onNavigate('ingredients')}
          className="bg-[#1a1a1a] border border-[#333333] p-1.5 md:p-2 text-left hover:border-[#c8a96e] transition-all group"
        >
          <div className="flex justify-between items-start">
            <div className="text-[8px] font-bold uppercase tracking-widest text-[#888888]">Master Registry</div>
            <div className="text-[10px] text-[#444] font-mono">01</div>
          </div>
          <div className="text-xl md:text-2xl font-mono text-[#e0e0e0] group-hover:text-[#c8a96e] transition-colors">{ingredients.length}</div>
          <div className="text-[8px] font-mono text-[#666] uppercase tracking-tighter">Linked Components</div>
        </button>

        <button 
          onClick={() => onNavigate('kitchen')}
          className="bg-[#1a1a1a] border border-[#333333] p-1.5 md:p-2 text-left hover:border-[#c8a96e] transition-all group"
        >
          <div className="flex justify-between items-start">
            <div className="text-[8px] font-bold uppercase tracking-widest text-[#888888]">Recipe Library</div>
            <div className="text-[10px] text-[#444] font-mono">02</div>
          </div>
          <div className="text-xl md:text-2xl font-mono text-[#e0e0e0] group-hover:text-[#c8a96e] transition-colors">{recipes.length}</div>
          <div className="text-[8px] font-mono text-[#666] uppercase tracking-tighter">Formulations</div>
        </button>

        <button 
          onClick={() => onNavigate('service')}
          className="bg-[#1a1a1a] border border-[#333333] p-1.5 md:p-2 text-left hover:border-[#c8a96e] transition-all group"
        >
          <div className="flex justify-between items-start">
            <div className="text-[8px] font-bold uppercase tracking-widest text-[#888888]">Dish Development</div>
            <div className="text-[10px] text-[#444] font-mono">03</div>
          </div>
          <div className="text-xl md:text-2xl font-mono text-[#e0e0e0] group-hover:text-[#c8a96e] transition-colors">{dishes.length}</div>
          <div className="text-[8px] font-mono text-[#666] uppercase tracking-tighter">Active Plates</div>
        </button>
      </div>

      {/* Chart Section */}
      <div className="border border-[#333333] bg-[#161616] flex-1 min-h-[400px] flex flex-col shadow-2xl relative overflow-hidden">
        <div className="p-2 md:p-3 border-b border-[#333333] flex justify-between items-center bg-[#1c1c1c]">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#c8a96e]">Inventory Analysis</h3>
            <p className="text-[8px] font-mono text-[#666] uppercase mt-0.5">Top 20 items ranked by {metric}</p>
          </div>
          <div className="flex border border-[#333333] bg-black">
            <button 
              onClick={() => setMetric('value')}
              className={`px-3 md:px-5 py-1 text-[8px] uppercase font-bold tracking-widest transition-all ${metric === 'value' ? 'bg-[#c8a96e] text-black' : 'text-[#666] hover:text-[#888]'}`}
            >
              Value
            </button>
            <button 
              onClick={() => setMetric('level')}
              className={`px-3 md:px-5 py-1 text-[8px] uppercase font-bold tracking-widest border-l border-[#333333] transition-all ${metric === 'level' ? 'bg-[#c8a96e] text-black' : 'text-[#666] hover:text-[#888]'}`}
            >
              Stock
            </button>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col p-4 md:p-8 pt-8 md:pt-10 overflow-hidden relative min-h-0">
          <div className="flex-1 flex items-end relative border-b border-[#333333] h-full">
             <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-0.5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="w-full flex items-center gap-3 md:gap-5">
                    <span className="text-[7px] md:text-[8px] font-mono text-[#444] w-10 md:w-14 text-right">
                      {metric === 'value' 
                        ? `£${(chartMax - (i * (chartMax/5))).toFixed(0)}` 
                        : (chartMax - (i * (chartMax/5))).toFixed(0)}
                    </span>
                    <div className="flex-1 border-t border-[#222]"></div>
                  </div>
                ))}
             </div>

             <div className="absolute inset-0 left-12 md:left-20 right-2 md:right-4 flex items-end gap-1 md:gap-1.5 px-0.5 pb-0 z-10">
                {stockData.length > 0 ? stockData.map((data) => {
                  const val = data[metric];
                  const percentage = Math.max((val / chartMax) * 100, val > 0 ? 0.8 : 0);
                  
                  return (
                    <div 
                      key={data.id} 
                      className="flex-1 h-full flex flex-col justify-end group cursor-pointer relative"
                      onClick={() => onNavigate('ingredients', data.id)}
                    >
                      <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 bg-black border border-[#c8a96e] p-2 absolute mb-2 z-40 bottom-full left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap shadow-[0_0_20px_rgba(0,0,0,0.8)] border-b-2">
                          <div className="text-[8px] uppercase font-bold text-[#c8a96e] mb-0.5 tracking-wider">{data.name}</div>
                          <div className="text-[10px] font-mono text-white">
                            {metric === 'value' ? `£${data.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `${data.level.toLocaleString()} ${data.unit}`}
                          </div>
                      </div>

                      <div className="w-full bg-[#111]/40 border-t border-x border-[#222] relative flex flex-col justify-end h-full transition-all group-hover:border-[#444]">
                        <div 
                          className={`w-full transition-all duration-500 ease-out group-hover:bg-white ${val > chartMax ? 'bg-[#ff4d4d]' : 'bg-[#c8a96e]'}`}
                          style={{ height: `${Math.min(percentage, 100)}%` }}
                        >
                          <div className="h-full w-full opacity-30 bg-gradient-to-t from-black/50 via-transparent to-transparent"></div>
                        </div>
                      </div>
                    </div>
                  );
                }) : null}
             </div>
          </div>
          
          <div className="h-6 mt-4 flex justify-between items-center text-[8px] font-mono text-[#444] uppercase tracking-widest shrink-0 border-t border-[#222] pt-2">
             <div className="flex items-center gap-2">
                <span className="text-[#666]">Y:</span>
                <span className="text-white">{metric.toUpperCase()}</span>
             </div>
             <div className="flex items-center gap-2">
                <span className="text-[#666]">X:</span>
                <span className="text-white">RANKED_ITEMS</span>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};
