import React, { useState } from 'react';
import { UI_STYLES, COLORS } from '../constants';
import { useKitchenData } from '../hooks/useKitchenData';

export const FinancialHUD: React.FC = () => {
  const [targetGP, setTargetGP] = useState(65);
  const [totalCost, setTotalCost] = useState(4.25); // Mocked for demo
  const { connectionStatus, error } = useKitchenData();

  const sellPrice = totalCost / (1 - (targetGP / 100));

  return (
    <div className="flex flex-col h-full bg-[#111111] p-4 font-sans">
      <h2 className="text-xs font-bold uppercase tracking-widest text-[#c8a96e] mb-8">Financial HUD</h2>

      <div className="space-y-10">
        <section>
          <label className={UI_STYLES.label}>Running Total Cost</label>
          <div className="text-4xl font-mono text-white">£{totalCost.toFixed(2)}</div>
        </section>

        <section>
          <label className={UI_STYLES.label}>Target Gross Profit (%)</label>
          <div className="flex items-center gap-4">
            <span className="text-2xl font-mono text-[#c8a96e] w-16">{targetGP}%</span>
            <input 
              type="range"
              min="0"
              max="99"
              value={targetGP}
              onChange={(e) => setTargetGP(parseInt(e.target.value))}
              className="flex-1 accent-[#c8a96e]"
              style={{ borderRadius: 0 }}
            />
          </div>
          <div className="flex justify-between mt-2 text-[9px] font-mono text-[#666666]">
            <span>0%</span>
            <span>50%</span>
            <span>99%</span>
          </div>
        </section>

        <section className={`p-4 ${UI_STYLES.panel} border-[#c8a96e]/20 bg-[#c8a96e]/5`}>
          <label className={UI_STYLES.label}>Suggested Sell Price</label>
          <div className="text-3xl font-mono text-[#c8a96e]">£{sellPrice.toFixed(2)}</div>
          <p className="text-[10px] mt-2 text-[#888888] leading-tight">Calculation: totalCost / (1 - (targetGP / 100))</p>
        </section>

        <section>
            <label className={UI_STYLES.label}>Allergens Matrix</label>
            <div className="flex flex-wrap gap-1">
                {['Milk', 'Wheat', 'Celery'].map(a => (
                    <span key={a} className="text-[10px] uppercase font-bold px-2 py-1 bg-[#1c1c1c] border border-[#333333] text-[#888888]">
                        {a}
                    </span>
                ))}
            </div>
        </section>
      </div>

      <div className="mt-auto pt-4 border-t border-[#333333]">
        <div className="text-[9px] text-[#888888] uppercase font-bold tracking-widest mb-2 text-opacity-70">System Metrics</div>
        <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
            <span className="text-[#666666]">DB Status:</span>
            <span>
              {connectionStatus === 'connected' && <span className="text-green-500">ONLINE</span>}
              {connectionStatus === 'connecting' && <span className="text-yellow-500">CONNECTING...</span>}
              {connectionStatus === 'error' && <span className="text-red-500">ERROR</span>}
            </span>
            <span className="text-[#666666]">Latency:</span>
            <span className="text-green-900 opacity-60">~24ms</span>
        </div>
        {error && (
          <div className="mt-2 text-[9px] text-red-500 border border-red-900 bg-red-900/20 p-2 break-all">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};
