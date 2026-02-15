
import React, { useMemo, useState } from 'react';
import { useKitchenData } from '../hooks/useKitchenData';
import { UI_STYLES } from '../constants';
import { Ingredient, Recipe } from '../types';

interface DashboardProps {
  onNavigate: (view: string, targetId?: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { ingredients, recipes, loading } = useKitchenData();
  const [metric, setMetric] = useState<'value' | 'level'>('value');

  const stockData = useMemo(() => {
    const calculated = ingredients.map(i => {
      const unitCost = i.packCost / (i.packSize || 1);
      return {
        id: i.id,
        name: i.name,
        value: i.stockLevel * unitCost,
        level: i.stockLevel,
        unit: i.packUnit,
        category: i.category
      };
    });

    return calculated
      .sort((a, b) => b[metric] - a[metric])
      .slice(0, 20); // Show more items in the expanded graph
  }, [ingredients, metric]);

  const totalInventoryValue = useMemo(() => {
    return ingredients.reduce((acc, i) => acc + (i.stockLevel * (i.packCost / (i.packSize || 1))), 0);
  }, [ingredients]);

  const maxValue = useMemo(() => Math.max(...stockData.map(d => d[metric]), 0.01), [stockData, metric]);

  if (loading) return <div className="p-8 font-mono text-xs text-[#666666] animate-pulse">Initializing Data Stream...</div>;

  return (
    <div className="flex flex-col h-full bg-[#111111] overflow-y-auto p-6 space-y-8 pb-12 max-w-7xl mx-auto w-full">
      
      {/* Mission Control Header */}
      <div className="border-b border-[#333333] pb-4 flex justify-between items-end">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-[#c8a96e]">Mission Control</h2>
          <p className="font-mono text-[9px] text-[#444444] mt-1 uppercase">Operational Status: Optimal // {new Date().toLocaleDateString()}</p>
        </div>
        <div className="flex gap-12">
          <div className="text-right">
            <div className="text-[8px] font-bold uppercase text-[#666666]">Total Inventory Value</div>
            <div className="text-2xl font-mono text-white">£{totalInventoryValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </div>
          <div className="text-right border-l border-[#333333] pl-12">
            <div className="text-[8px] font-bold uppercase text-[#666666]">Database Sync</div>
            <div className="text-2xl font-mono text-[#c8a96e]">LIVE</div>
          </div>
        </div>
      </div>

      {/* Primary Action Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button 
          onClick={() => onNavigate('ingredients')}
          className="bg-[#1a1a1a] border border-[#333333] p-6 text-left hover:border-[#c8a96e] transition-all group"
        >
          <div className="flex justify-between items-start">
            <div className="text-[8px] font-bold uppercase tracking-widest text-[#888888]">Master Registry</div>
            <div className="text-[10px] text-[#444] font-mono">01</div>
          </div>
          <div className="text-4xl font-mono text-[#e0e0e0] my-2 group-hover:text-[#c8a96e] transition-colors">{ingredients.length}</div>
          <div className="text-[8px] font-mono text-[#666] uppercase tracking-tighter">Verified Ingredients Linked</div>
        </button>

        <button 
          onClick={() => onNavigate('kitchen')}
          className="bg-[#1a1a1a] border border-[#333333] p-6 text-left hover:border-[#c8a96e] transition-all group"
        >
          <div className="flex justify-between items-start">
            <div className="text-[8px] font-bold uppercase tracking-widest text-[#888888]">Recipe Dev</div>
            <div className="text-[10px] text-[#444] font-mono">02</div>
          </div>
          <div className="text-4xl font-mono text-[#e0e0e0] my-2 group-hover:text-[#c8a96e] transition-colors">{recipes.length}</div>
          <div className="text-[8px] font-mono text-[#666] uppercase tracking-tighter">Standardized Formulations</div>
        </button>

        <button 
          onClick={() => onNavigate('service')}
          className="bg-[#1a1a1a] border border-[#333333] p-6 text-left hover:border-[#c8a96e] transition-all group"
        >
          <div className="flex justify-between items-start">
            <div className="text-[8px] font-bold uppercase tracking-widest text-[#888888]">Service Module</div>
            <div className="text-[10px] text-[#444] font-mono">03</div>
          </div>
          <div className="text-4xl font-mono text-[#c8a96e] my-2 uppercase">Service</div>
          <div className="text-[8px] font-mono text-[#666] uppercase tracking-tighter">Live Plate Costing Interface</div>
        </button>
      </div>

      {/* Inventory Distribution Chart - Preferred Graph View */}
      <div className="border border-[#333333] bg-[#161616] flex flex-col min-h-[500px]">
        <div className="p-4 border-b border-[#333333] flex justify-between items-center">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Inventory Concentration</h3>
            <p className="text-[8px] font-mono text-[#444] uppercase">Top 20 items by financial weight</p>
          </div>
          <div className="flex border border-[#333333]">
            <button 
              onClick={() => setMetric('value')}
              className={`px-4 py-1.5 text-[8px] uppercase font-bold tracking-widest ${metric === 'value' ? 'bg-[#c8a96e] text-black' : 'text-[#666] hover:text-[#888]'}`}
            >
              By Value
            </button>
            <button 
              onClick={() => setMetric('level')}
              className={`px-4 py-1.5 text-[8px] uppercase font-bold tracking-widest border-l border-[#333333] ${metric === 'level' ? 'bg-[#c8a96e] text-black' : 'text-[#666] hover:text-[#888]'}`}
            >
              By Level
            </button>
          </div>
        </div>
        <div className="flex-1 p-8 space-y-5">
          {stockData.map((data) => (
            <div key={data.id} className="space-y-1.5 group cursor-pointer" onClick={() => onNavigate('ingredients', data.id)}>
              <div className="flex justify-between text-[10px] uppercase font-mono">
                <span className="text-[#888] group-hover:text-white transition-colors">{data.name}</span>
                <span className="text-[#c8a96e] font-bold">
                  {metric === 'value' ? `£${data.value.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `${data.level}${data.unit}`}
                </span>
              </div>
              <div className="h-2 w-full bg-[#111] border border-[#222]">
                <div 
                  className="h-full bg-[#c8a96e] transition-all duration-1000 ease-out"
                  style={{ width: `${(data[metric] / maxValue) * 100}%` }}
                />
              </div>
            </div>
          ))}
          {stockData.length === 0 && (
            <div className="h-full flex items-center justify-center text-[10px] font-mono text-[#333] uppercase">
              No inventory data available // Update Registry
            </div>
          )}
        </div>
      </div>

      {/* System Footer */}
      <div className="border-t border-[#333333] pt-6 flex justify-between">
        <div className="text-[9px] font-mono text-[#333] uppercase max-w-sm">
          Authenticated access granted to ADMIN_CHEF. Session ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
        </div>
        <div className="flex gap-8">
           <div className="flex items-center gap-2">
             <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></div>
             <div className="text-[9px] font-mono text-[#666] uppercase">System_Active</div>
           </div>
           <div className="text-[9px] font-mono text-[#666] uppercase">Cores: Nominal</div>
           <div className="text-[9px] font-mono text-[#666] uppercase">Latency: 12ms</div>
        </div>
      </div>
    </div>
  );
};
