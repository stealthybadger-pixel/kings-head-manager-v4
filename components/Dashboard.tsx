
import React, { useMemo, useState } from 'react';
import { useKitchenData } from '../hooks/useKitchenData';
import { UI_STYLES } from '../constants';
import { Ingredient, Recipe, Dish } from '../types';

interface DashboardProps {
  onNavigate: (view: string, targetId?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { ingredients, recipes, dishes, loading } = useKitchenData();
  const [metric, setMetric] = useState<'value' | 'level'>('value');

  // Helper for safe numeric conversion
  const safeNum = (val: any) => (typeof val === 'number' && !isNaN(val)) ? val : 0;

  const stockData = useMemo(() => {
    const calculated = ingredients.map(i => {
      const unitCost = safeNum(i.packCost) / (safeNum(i.packSize) || 1);
      return {
        id: i.id,
        name: i.name || 'Unknown',
        value: safeNum(i.stockLevel) * unitCost,
        level: safeNum(i.stockLevel),
        unit: i.packUnit || '?',
        category: i.category || 'Other'
      };
    });

    return calculated
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 20);
  }, [ingredients, metric]);

  const totalInventoryValue = useMemo(() => {
    return ingredients.reduce((acc, i) => {
      const unitCost = safeNum(i.packCost) / (safeNum(i.packSize) || 1);
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
    <div className="flex flex-col h-full bg-[#111111] overflow-y-auto p-4 md:p-8 space-y-6 md:space-y-8 pb-32 max-w-7xl mx-auto w-full">
      
      {/* Mission Control Header */}
      <div className="border-b border-[#333333] pb-4 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-[#c8a96e]">Mission Control</h2>
          <p className="font-mono text-[9px] text-[#444444] mt-1 uppercase">Operational Status: Optimal // {new Date().toLocaleDateString()}</p>
        </div>
        <div className="flex gap-8 md:gap-12 w-full md:w-auto">
          <div className="text-right flex-1 md:flex-none">
            <div className="text-[8px] font-bold uppercase text-[#666666]">Total Inventory Value</div>
            <div className="text-xl md:text-2xl font-mono text-white">£{totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="text-right border-l border-[#333333] pl-8 md:pl-12 flex-1 md:flex-none">
            <div className="text-[8px] font-bold uppercase text-[#666666]">Database Sync</div>
            <div className="text-xl md:text-2xl font-mono text-[#c8a96e]">LIVE</div>
          </div>
        </div>
      </div>

      {/* Primary Action Grid - Reduced height and padding */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
        <button 
          onClick={() => onNavigate('ingredients')}
          className="bg-[#1a1a1a] border border-[#333333] p-4 md:p-5 text-left hover:border-[#c8a96e] transition-all group"
        >
          <div className="flex justify-between items-start">
            <div className="text-[8px] font-bold uppercase tracking-widest text-[#888888]">Master Registry</div>
            <div className="text-[10px] text-[#444] font-mono">01</div>
          </div>
          <div className="text-3xl md:text-4xl font-mono text-[#e0e0e0] my-2 group-hover:text-[#c8a96e] transition-colors">{ingredients.length}</div>
          <div className="text-[8px] font-mono text-[#666] uppercase tracking-tighter">Verified Components Linked</div>
        </button>

        <button 
          onClick={() => onNavigate('kitchen')}
          className="bg-[#1a1a1a] border border-[#333333] p-4 md:p-5 text-left hover:border-[#c8a96e] transition-all group"
        >
          <div className="flex justify-between items-start">
            <div className="text-[8px] font-bold uppercase tracking-widest text-[#888888]">Recipe Dev</div>
            <div className="text-[10px] text-[#444] font-mono">02</div>
          </div>
          <div className="text-3xl md:text-4xl font-mono text-[#e0e0e0] my-2 group-hover:text-[#c8a96e] transition-colors">{recipes.length}</div>
          <div className="text-[8px] font-mono text-[#666] uppercase tracking-tighter">Standardized Formulations</div>
        </button>

        <button 
          onClick={() => onNavigate('service')}
          className="bg-[#1a1a1a] border border-[#333333] p-4 md:p-5 text-left hover:border-[#c8a96e] transition-all group"
        >
          <div className="flex justify-between items-start">
            <div className="text-[8px] font-bold uppercase tracking-widest text-[#888888]">Dish Development</div>
            <div className="text-[10px] text-[#444] font-mono">03</div>
          </div>
          <div className="text-3xl md:text-4xl font-mono text-[#c8a96e] my-2 uppercase">Service</div>
          <div className="text-[8px] font-mono text-[#666] uppercase tracking-tighter">Live Plate Costing Interface</div>
        </button>
      </div>

      {/* Expanded Vertical Bar Chart - Still taking center stage */}
      <div className="border border-[#333333] bg-[#161616] flex flex-col h-[600px] md:h-[800px] lg:h-[900px] shadow-2xl relative">
        <div className="p-4 md:p-6 border-b border-[#333333] flex justify-between items-center bg-[#1c1c1c]">
          <div>
            <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#c8a96e]">Inventory Concentration Analysis</h3>
            <p className="text-[8px] font-mono text-[#666] uppercase mt-1">Top 20 high-density items ranked by selected metric</p>
          </div>
          <div className="flex border border-[#333333] bg-black">
            <button 
              onClick={() => setMetric('value')}
              className={`px-5 md:px-7 py-2 text-[9px] uppercase font-bold tracking-widest transition-all ${metric === 'value' ? 'bg-[#c8a96e] text-black' : 'text-[#666] hover:text-[#888] hover:bg-[#111]'}`}
            >
              Cost Value
            </button>
            <button 
              onClick={() => setMetric('level')}
              className={`px-5 md:px-7 py-2 text-[9px] uppercase font-bold tracking-widest border-l border-[#333333] transition-all ${metric === 'level' ? 'bg-[#c8a96e] text-black' : 'text-[#666] hover:text-[#888] hover:bg-[#111]'}`}
            >
              Stock Level
            </button>
          </div>
        </div>
        
        <div className="flex-1 flex flex-col p-6 md:p-12 pt-12 md:pt-16 overflow-hidden relative min-h-0">
          <div className="flex-1 flex items-end relative border-b border-[#333333] h-full">
             {/* Dynamic Scale Lines */}
             <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-0.5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="w-full flex items-center gap-3 md:gap-6">
                    <span className="text-[7px] md:text-[9px] font-mono text-[#444] w-10 md:w-16 text-right">
                      {metric === 'value' 
                        ? `£${(chartMax - (i * (chartMax/5))).toFixed(0)}` 
                        : (chartMax - (i * (chartMax/5))).toFixed(0)}
                    </span>
                    <div className="flex-1 border-t border-[#222]"></div>
                  </div>
                ))}
             </div>

             {/* Vertical Bar Rendering Area */}
             <div className="absolute inset-0 left-14 md:left-24 right-4 md:right-8 flex items-end gap-1 md:gap-2 px-1 pb-0 z-10">
                {stockData.length > 0 ? stockData.map((data) => {
                  const val = data[metric];
                  const percentage = Math.max((val / chartMax) * 100, val > 0 ? 0.8 : 0);
                  
                  return (
                    <div 
                      key={data.id} 
                      className="flex-1 h-full flex flex-col justify-end group cursor-pointer relative"
                      onClick={() => onNavigate('ingredients', data.id)}
                    >
                      {/* Detailed Tooltip */}
                      <div className="opacity-0 group-hover:opacity-100 transition-all duration-200 bg-black border border-[#c8a96e] p-3 absolute mb-4 z-40 bottom-full left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap shadow-[0_0_30px_rgba(0,0,0,0.8)] border-b-2">
                          <div className="text-[9px] uppercase font-bold text-[#c8a96e] mb-1 tracking-wider">{data.name}</div>
                          <div className="text-[12px] font-mono text-white">
                            {metric === 'value' ? `£${data.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `${data.level.toLocaleString()} ${data.unit}`}
                          </div>
                          <div className="text-[7px] text-[#666] uppercase mt-1">Component Concentration: {((val / totalInventoryValue) * 100).toFixed(1)}%</div>
                      </div>

                      {/* Bar Visual with Gradient */}
                      <div className="w-full bg-[#111]/60 border-t border-x border-[#222] relative flex flex-col justify-end h-full overflow-hidden transition-all group-hover:border-[#444]">
                        <div 
                          className={`w-full transition-all duration-700 ease-out group-hover:bg-white shadow-[0_0_15px_rgba(200,169,110,0.1)] ${val > chartMax ? 'bg-[#ff4d4d]' : 'bg-[#c8a96e]'}`}
                          style={{ height: `${Math.min(percentage, 100)}%` }}
                        >
                          <div className="h-full w-full opacity-40 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>
                          <div className="absolute top-0 left-0 w-full h-px bg-white/20"></div>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                   <div className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-[#333] uppercase tracking-[0.3em]">
                     Telemetry Offline // Input Data Required
                   </div>
                )}
             </div>
          </div>
          
          <div className="h-8 mt-6 flex justify-between items-center text-[9px] font-mono text-[#444] uppercase tracking-widest shrink-0 border-t border-[#222] pt-4">
             <div className="flex items-center gap-4">
                <span className="text-[#666]">Y_VECTOR:</span>
                <span className="text-white">{metric.toUpperCase()}_DENSITY_COEFFICIENT</span>
             </div>
             <div className="hidden sm:flex items-center gap-4">
                <span className="text-[#666]">X_VECTOR:</span>
                <span className="text-white">TOP_RANKED_COLLECTION [0..20]</span>
             </div>
          </div>
        </div>
      </div>

      {/* System Footer Metadata */}
      <div className="border-t border-[#333333] pt-6 flex flex-col sm:flex-row justify-between items-center gap-4 opacity-60">
        <div className="text-[10px] font-mono text-[#444] uppercase tracking-widest">
          Secured access: ADMIN_CHEF // Master Registry ACTIVE // Root Session
        </div>
        <div className="flex gap-8 md:gap-12">
           <div className="flex items-center gap-3">
             <div className="w-1.5 h-1.5 bg-[#c8a96e] rounded-full animate-pulse shadow-[0_0_8px_rgba(200,169,110,0.5)]"></div>
             <div className="text-[10px] font-mono text-[#888] uppercase tracking-tighter">Telemetry: Linked</div>
           </div>
           <div className="text-[10px] font-mono text-[#888] uppercase tracking-tighter hidden xs:block">Renderer: V-BAR-FULL-v4</div>
        </div>
      </div>
    </div>
  );
};
