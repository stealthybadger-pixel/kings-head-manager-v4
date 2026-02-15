
import React, { useState, useRef, useMemo } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { useKitchenData } from '../hooks/useKitchenData';
import { RecipeItem, Unit, Ingredient } from '../types';
import { UI_STYLES } from '../constants';
import { useConfirmation } from '../hooks/useConfirmation';

interface ExtractedItem {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total_line_price: number;
}

interface ExtractedData {
  title: string;
  vendor_name: string;
  date: string;
  items: ExtractedItem[];
}

interface OCRScannerProps {
  onSuccess: (recipe: { name: string, items: RecipeItem[], instructions: string }) => void;
  onCancel: () => void;
}

export const OCRScanner: React.FC<OCRScannerProps> = ({ onSuccess, onCancel }) => {
  const { ingredients, addIngredient, updateIngredient } = useKitchenData();
  const { confirm } = useConfirmation();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stagedData, setStagedData] = useState<ExtractedData | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sanitizeOCRValue = (val: any): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (typeof val === 'string') {
      const cleaned = val.replace(/[^\d.-]/g, '');
      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setPreviewUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const processImage = async () => {
    if (!previewUrl) return;
    setIsProcessing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = previewUrl.split(',')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: 'image/png', data: base64Data } },
            {
              text: `EXTRACT RECIPE DATA. 
              MANDATORY: Look for a recipe title, dish name, or document header at the very top. 
              Extract the vendor/supplier name, date, and all individual line items. 
              For each item, extract the name, quantity, unit (g, kg, ml, l, ea), unit price, and total line price.
              If a field is missing, return null. Format as pure JSON.`
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING, description: "The primary name of the recipe or document title" },
              vendor_name: { type: Type.STRING },
              date: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    unit_price: { type: Type.NUMBER },
                    total_line_price: { type: Type.NUMBER }
                  },
                  required: ["name", "quantity", "unit", "total_line_price"]
                }
              }
            },
            required: ["items"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      setStagedData(result);
    } catch (err: any) {
      console.error("OCR Error:", err);
      setError("SYSTEM ERROR EXTRACTION FAILED");
    } finally {
      setIsProcessing(false);
    }
  };

  const commitToRegistry = async () => {
    if (!stagedData) return;

    const ok = await confirm(`ARE YOU SURE? THIS WILL UPDATE THE MASTER REGISTRY FOR ${stagedData.items.length} ITEMS.`);
    if (!ok) return;

    try {
      for (const item of stagedData.items) {
        const existing = ingredients.find(ing => 
          ing.name.toLowerCase().trim() === item.name.toLowerCase().trim()
        );

        const data: Omit<Ingredient, 'id'> = {
          name: item.name,
          supplier: stagedData.vendor_name || 'OCR IMPORT',
          category: existing?.category || 'Uncategorized',
          packCost: sanitizeOCRValue(item.total_line_price),
          packSize: sanitizeOCRValue(item.quantity),
          packUnit: (['g', 'ml', 'kg', 'l', 'ea'].includes(item.unit?.toLowerCase()) ? item.unit.toLowerCase() : 'ea') as Unit,
          wastePercent: existing?.wastePercent || 0,
          allergens: existing?.allergens || [],
          kcalPer100: existing?.kcalPer100 || 0,
          stockLevel: existing?.stockLevel || 0
        };

        if (existing) {
          await updateIngredient(existing.id, data);
        } else {
          await addIngredient(data);
        }
      }

      onSuccess({
        name: stagedData.title || `Import: ${stagedData.vendor_name || 'Document'} (${stagedData.date || 'New'})`,
        items: stagedData.items.map(item => ({
          type: 'ingredient',
          ingredientId: ingredients.find(ing => ing.name === item.name)?.id || 'temp-' + Math.random(),
          quantity: sanitizeOCRValue(item.quantity),
          unit: (item.unit || 'ea') as Unit
        })),
        instructions: `OCR IMPORT. VENDOR: ${stagedData.vendor_name || 'NA'}. DATE: ${stagedData.date || 'NA'}.`
      });
    } catch (e) {
      setError("COMMIT ERROR DATABASE WRITE FAILURE");
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0E1117]/98 flex items-center justify-center z-[100] p-0 md:p-8 backdrop-blur-lg font-mono">
      <div className="w-full max-w-6xl bg-[#0E1117] border border-[#333333] shadow-2xl flex flex-col max-h-[95vh]">
        
        {/* Header */}
        <div className="p-4 border-b border-[#333333] flex justify-between items-center bg-[#151921]">
          <div className="flex items-center gap-6">
            <span className="text-[11px] font-bold text-[#FFFFFF] tracking-[0.4em] uppercase">V-SCANNER STAGE REVIEW</span>
            {stagedData && (
               <div className="flex items-center gap-4 border-l border-[#333] pl-6">
                 <span className="text-[10px] text-[#BBBBBB] uppercase">
                   TITLE <span className="text-[#FFFFFF] ml-2">{stagedData.title || 'NOT FOUND'}</span>
                 </span>
                 <span className="text-[10px] text-[#BBBBBB] uppercase">
                   SOURCE <span className="text-[#FFFFFF] ml-2">{stagedData.vendor_name || 'NOT FOUND'}</span>
                 </span>
               </div>
            )}
          </div>
          <button onClick={onCancel} className="text-[#BBBBBB] hover:text-[#FFFFFF] text-[10px] uppercase font-bold tracking-widest transition-colors">DISCARD</button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-x divide-[#333333]">
          
          {/* Left Panel */}
          <div className="w-full md:w-2/5 flex flex-col bg-[#0b0e14]">
            {!previewUrl ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 border-2 border-dashed border-[#222] m-6 flex flex-col items-center justify-center cursor-pointer hover:bg-[#111] transition-colors p-10 text-center"
              >
                <div className="text-[11px] font-bold text-[#FFFFFF] uppercase tracking-[0.2em] mb-6">AWAITING INPUT</div>
                <div className="px-6 py-3 border border-[#444] text-[10px] text-[#FFFFFF] uppercase hover:border-white transition-all">SELECT FILE OR CAPTURE</div>
              </div>
            ) : (
              <div className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
                <div className="flex-1 bg-black border border-[#222] overflow-hidden relative">
                   <img src={previewUrl} className="w-full h-full object-contain" alt="Preview" />
                   <div className="absolute top-2 right-2 bg-black/80 text-[8px] text-[#FFFFFF] px-2 py-1 uppercase border border-[#333]">DOCUMENT FEED</div>
                </div>
                {!stagedData && (
                  <button 
                    onClick={processImage}
                    disabled={isProcessing}
                    className="w-full py-4 bg-[#FFFFFF] text-[#0E1117] text-[11px] font-bold uppercase tracking-[0.3em] hover:bg-[#F0F0F0] disabled:opacity-30 transition-all"
                  >
                    {isProcessing ? "PROCESSING DATA" : "EXECUTE SCAN"}
                  </button>
                )}
                {stagedData && (
                  <button 
                    onClick={() => { setStagedData(null); setPreviewUrl(null); }}
                    className="w-full py-4 border border-[#333] text-[#FFFFFF] text-[11px] font-bold uppercase tracking-[0.3em] hover:border-white transition-all"
                  >
                    RESET SCANNER
                  </button>
                )}
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          </div>

          {/* Right Panel */}
          <div className="flex-1 flex flex-col overflow-hidden bg-[#0E1117]">
            {!stagedData ? (
              <div className="flex-1 flex items-center justify-center p-12 text-center">
                 <div className="max-w-md space-y-6">
                    <div className="text-[12px] font-bold text-[#444444] uppercase tracking-[0.6em] animate-pulse">PENDING STREAM</div>
                    {isProcessing && (
                      <div className="text-[10px] text-[#FFFFFF] uppercase leading-relaxed tracking-tight font-medium">
                        VISION LAYER ACTIVE<br/>
                        SCHEMA MAPPING<br/>
                        PARSING LINE ITEMS
                      </div>
                    )}
                 </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 bg-[#151921] border-b border-[#333333] flex justify-between items-center">
                  <span className="text-[10px] font-bold text-[#FFFFFF] uppercase tracking-widest">EXTRACTED ITEM REGISTRY</span>
                  {error && <span className="text-[10px] font-bold text-red-500 uppercase">{error}</span>}
                </div>
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-[#0E1117] border-b border-[#333333] z-10">
                      <tr>
                        <th className="p-4 text-[9px] font-bold text-[#BBBBBB] uppercase border-r border-[#333]">ID</th>
                        <th className="p-4 text-[9px] font-bold text-[#BBBBBB] uppercase border-r border-[#333]">DESCRIPTION</th>
                        <th className="p-4 text-[9px] font-bold text-[#BBBBBB] uppercase border-r border-[#333] text-right">QTY</th>
                        <th className="p-4 text-[9px] font-bold text-[#BBBBBB] uppercase border-r border-[#333]">UNIT</th>
                        <th className="p-4 text-[9px] font-bold text-[#BBBBBB] uppercase text-right">TOTAL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1f26]">
                      {stagedData.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-[#1a1f26] transition-colors group">
                          <td className="p-4 text-[11px] text-[#888888] border-r border-[#333]">{idx + 1}</td>
                          <td className="p-4 text-[11px] text-[#FFFFFF] border-r border-[#333] font-bold tracking-tight">{item.name}</td>
                          <td className="p-4 text-[11px] text-[#FFFFFF] border-r border-[#333] text-right font-mono">{item.quantity}</td>
                          <td className="p-4 text-[11px] text-[#FFFFFF] border-r border-[#333] uppercase">{item.unit || 'EA'}</td>
                          <td className="p-4 text-[11px] text-[#FFFFFF] text-right font-mono font-bold">£{sanitizeOCRValue(item.total_line_price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                {/* Footer Section */}
                <div className="p-8 bg-[#151921] border-t border-[#333333] flex justify-between items-center shadow-2xl">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] text-[#BBBBBB] uppercase font-bold tracking-widest">TOTAL VALUE</span>
                    <span className="text-3xl text-[#FFFFFF] font-mono leading-none">
                      £{stagedData.items.reduce((acc, i) => acc + sanitizeOCRValue(i.total_line_price), 0).toFixed(2)}
                    </span>
                  </div>
                  <button 
                    onClick={commitToRegistry}
                    className="px-12 py-4 bg-[#c8a96e] text-[#0E1117] text-[12px] font-bold uppercase tracking-[0.2em] hover:bg-white transition-all shadow-lg"
                  >
                    COMMIT TO REGISTRY
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* System Metadata */}
        <div className="p-3 border-t border-[#333333] bg-black flex justify-between items-center">
           <div className="text-[8px] text-[#666666] uppercase tracking-[0.4em]">MODULE V-SCANNER PRO PROMPT KERNEL G3-FLASH</div>
           <div className="text-[8px] text-[#666666] uppercase tracking-[0.4em]">REGISTRY {ingredients.length} MASTER ITEMS</div>
        </div>
      </div>
    </div>
  );
};
