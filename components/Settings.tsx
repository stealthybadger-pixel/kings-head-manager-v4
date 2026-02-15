
import React, { useRef, useState } from 'react';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { UI_STYLES } from '../constants';

export const Settings: React.FC = () => {
  const { ingredients, recipes, bulkImport } = useKitchenData();
  const { confirm } = useConfirmation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const handleExport = () => {
    const data = {
      ingredients,
      recipes,
      exportDate: new Date().toISOString(),
      version: "1.0.0"
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kings-head-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const ok = await confirm("This will import data from the selected backup file. Continue?");
    if (!ok) {
      e.target.value = '';
      return;
    }

    setIsRestoring(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        if (!json.ingredients || !json.recipes) {
          throw new Error("Invalid backup file format");
        }
        await bulkImport(json);
        alert("System restore complete. All data imported.");
      } catch (err) {
        console.error(err);
        alert("Failed to restore: " + (err as Error).message);
      } finally {
        setIsRestoring(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="flex flex-col h-full bg-[#111111] overflow-y-auto p-8 max-w-4xl mx-auto w-full">
      <div className="mb-12 border-b border-[#333333] pb-4">
        <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-[#c8a96e]">System Settings</h2>
        <p className="font-mono text-[10px] text-[#666666] mt-1">CORE MODULE V1.0.6 // DATA INTEGRITY & ARCHIVAL</p>
      </div>

      <div className="space-y-12">
        {/* Backup & Recovery Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-px bg-[#333333] flex-1"></div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#888888] whitespace-nowrap">Backup & Recovery</h3>
            <div className="h-px bg-[#333333] flex-1"></div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className={`p-6 ${UI_STYLES.panel} bg-[#1c1c1c] space-y-4`}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-[#e0e0e0]">Export Local Archive</h4>
              <p className="text-[11px] text-[#888888] leading-relaxed font-sans">
                Download a complete snapshot of your ingredients and recipes. 
                Keep this file safe as a primary backup.
              </p>
              <button 
                onClick={handleExport}
                className="w-full py-3 bg-[#c8a96e] text-black text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-[#b8985e] transition-colors"
              >
                Download System JSON
              </button>
            </div>

            <div className={`p-6 ${UI_STYLES.panel} bg-[#1c1c1c] space-y-4`}>
              <h4 className="text-xs font-bold uppercase tracking-widest text-[#e0e0e0]">Restore System State</h4>
              <p className="text-[11px] text-[#888888] leading-relaxed font-sans">
                Upload a previously exported JSON file to restore your registry. 
                Warning: This process adds items to your current database.
              </p>
              <button 
                disabled={isRestoring}
                onClick={handleImportClick}
                className="w-full py-3 border border-[#ff4d4d] text-[#ff4d4d] text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-[#ff4d4d] hover:text-white transition-all disabled:opacity-20"
              >
                {isRestoring ? 'Processing...' : 'Upload & Restore'}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept=".json"
              />
            </div>
          </div>
        </section>

        {/* Database Stats Section */}
        <section className="space-y-6">
          <div className="flex items-center gap-4">
            <div className="h-px bg-[#333333] flex-1"></div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#888888] whitespace-nowrap">System Registry Stats</h3>
            <div className="h-px bg-[#333333] flex-1"></div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Ingredient Count', value: ingredients.length },
              { label: 'Recipe Count', value: recipes.length },
              { label: 'Database Format', value: 'FIRESTORE V10' },
              { label: 'Sync Status', value: 'LIVE' },
            ].map((stat, idx) => (
              <div key={idx} className="bg-[#1a1a1a] border border-[#333333] p-4 text-center">
                <div className="text-[9px] font-bold uppercase text-[#666666] mb-1">{stat.label}</div>
                <div className="text-lg font-mono text-[#e0e0e0]">{stat.value}</div>
              </div>
            ))}
          </div>
        </section>

        {/* System Log Style Credits */}
        <section className="pt-12 border-t border-[#333333]">
           <div className="text-[9px] font-mono text-[#444444] space-y-1">
             <p>[OK] MODULE: RECIPE_BUILDER LOADED</p>
             <p>[OK] MODULE: FINANCIAL_HUD SYNCED</p>
             <p>[OK] MODULE: INGREDIENT_REGISTRY ACTIVE</p>
             <p className="pt-4 opacity-50">KING'S HEAD KITCHEN MANAGEMENT SYSTEM • NO COPYRIGHT INFRINGMENT INTENDED</p>
           </div>
        </section>
      </div>
    </div>
  );
};
