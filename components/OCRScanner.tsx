
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { useKitchenData } from '../hooks/useKitchenData';
import { RecipeItem, Unit, Ingredient } from '../types';
import { useConfirmation } from '../hooks/useConfirmation';

interface ExtractedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  matchedIngredientId?: string;
}

interface OCRScannerProps {
  onAddItems: (items: RecipeItem[], instructions?: string) => void;
  onCancel: () => void;
  onIngredientCreateRequest: (name: string) => void;
}

export const OCRScanner: React.FC<OCRScannerProps> = ({ onAddItems, onCancel, onIngredientCreateRequest }) => {
  const { ingredients } = useKitchenData();
  const { confirm } = useConfirmation();
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stagedItems, setStagedItems] = useState<ExtractedItem[]>([]);
  const [stagedInstructions, setStagedInstructions] = useState<string>('');
  const [documentTitle, setDocumentTitle] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let interval: any;
    if (isProcessing) {
      setProgress(0);
      interval = setInterval(() => {
        setProgress(prev => {
          if (prev < 90) return prev + Math.random() * 15;
          return prev;
        });
      }, 400);
    } else {
      setProgress(0);
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [isProcessing]);

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

  const findMatch = (name: string): Ingredient | undefined => {
    return ingredients.find(ing => 
      ing.name.toLowerCase().trim() === name.toLowerCase().trim()
    );
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
              Find the recipe title or document header. 
              Extract all line items with their names, quantities, and units.
              Crucially, extract the preparation method or instructions as a single block of text.
              If no unit is visible, default to 'ea'. 
              Return JSON strictly following the schema.`
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              method: { type: Type.STRING, description: "The cooking instructions or preparation steps." },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING }
                  },
                  required: ["name", "quantity", "unit"]
                }
              }
            },
            required: ["items", "method"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      const itemsWithMatches = (result.items || []).map((item: any) => {
        const match = findMatch(item.name);
        return {
          id: Math.random().toString(36).substr(2, 9),
          ...item,
          matchedIngredientId: match?.id
        };
      });

      setStagedItems(itemsWithMatches);
      setStagedInstructions(result.method || '');
      setDocumentTitle(result.title || '');
      setProgress(100);
    } catch (err: any) {
      console.error("OCR Error:", err);
      setError("SYSTEM ERROR EXTRACTION FAILED");
    } finally {
      setTimeout(() => setIsProcessing(false), 500);
    }
  };

  const deleteItem = (id: string) => {
    setStagedItems(prev => prev.filter(item => item.id !== id));
  };

  const updateMatch = (id: string, ingredientId: string) => {
    setStagedItems(prev => prev.map(item => 
      item.id === id ? { ...item, matchedIngredientId: ingredientId === 'none' ? undefined : ingredientId } : item
    ));
  };

  const updateUnit = (id: string, newUnit: string) => {
    setStagedItems(prev => prev.map(item => 
      item.id === id ? { ...item, unit: newUnit } : item
    ));
  };

  const updateName = (id: string, newName: string) => {
    setStagedItems(prev => prev.map(item => {
      if (item.id === id) {
        const match = findMatch(newName);
        return { ...item, name: newName, matchedIngredientId: match?.id || item.matchedIngredientId };
      }
      return item;
    }));
  };

  const handleAddToRecipe = async () => {
    const validItems = stagedItems
      .filter(item => !!item.matchedIngredientId)
      .map(item => ({
        type: 'ingredient' as const,
        ingredientId: item.matchedIngredientId!,
        quantity: sanitizeOCRValue(item.quantity),
        unit: (['g', 'ml', 'kg', 'l', 'ea'].includes(item.unit?.toLowerCase()) ? item.unit.toLowerCase() : 'ea') as Unit
      }));

    if (validItems.length === 0 && !stagedInstructions) {
      setError("NO DATA TO COMMIT");
      return;
    }

    const ok = await confirm(`ARE YOU SURE? This will add ${validItems.length} items and instructions to your recipe build.`);
    if (ok) {
      onAddItems(validItems, stagedInstructions);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0E1117] flex items-center justify-center z-[200] p-0 md:p-8 font-mono !rounded-none overflow-hidden text-[#FAFAFA]">
      <div className="w-full max-w-7xl bg-[#0E1117] border border-[#404040] flex flex-col h-full !rounded-none relative">
        
        {isProcessing && (
          <div className="absolute top-0 left-0 w-full h-1 z-[300] bg-black">
            <div 
              className="h-full bg-[#FAFAFA] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="p-4 border-b border-[#404040] flex justify-between items-center bg-[#151921]">
          <div className="flex items-center gap-6">
            <span className="text-[11px] font-bold text-[#FFFFFF] tracking-[0.4em] uppercase">OCR SCANNER STAGING</span>
            {stagedItems.length > 0 && (
              <span className="text-[10px] text-[#FAFAFA] uppercase border border-[#404040] px-3 py-1 bg-black">STATUS: PARSED</span>
            )}
          </div>
          <button onClick={onCancel} className="text-[#FAFAFA] text-[10px] uppercase font-bold tracking-widest border border-[#404040] px-5 py-2 hover:bg-white hover:text-black transition-all">DISCARD</button>
        </div>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-x divide-[#404040]">
          
          <div className="w-full md:w-80 flex flex-col bg-[#0b0e14]">
            {!previewUrl ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 border border-dashed border-[#404040] m-6 flex flex-col items-center justify-center cursor-pointer hover:bg-[#151921] transition-colors p-10 text-center"
              >
                <div className="text-[11px] font-bold text-[#FAFAFA] uppercase tracking-[0.2em] mb-6">AWAITING INPUT</div>
                <div className="px-6 py-3 border border-[#404040] text-[10px] text-[#FAFAFA] uppercase">CAPTURE_IMAGE</div>
              </div>
            ) : (
              <div className="flex-1 p-6 flex flex-col gap-6 overflow-hidden">
                <div className="flex-1 bg-black border border-[#404040] overflow-hidden relative">
                   <img src={previewUrl} className="w-full h-full object-contain opacity-80" alt="Preview" />
                   {isProcessing && (
                     <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                        <div className="text-[10px] text-white font-bold tracking-[0.5em] animate-pulse">ANALYZING_GEOMETRY</div>
                     </div>
                   )}
                </div>
                {!stagedItems.length && !stagedInstructions && (
                  <button 
                    onClick={processImage}
                    disabled={isProcessing}
                    className="w-full py-4 bg-[#FAFAFA] text-[#0E1117] text-[11px] font-bold uppercase tracking-[0.3em] disabled:opacity-30 hover:bg-white"
                  >
                    {isProcessing ? "PROCESSING_CORE" : "EXECUTE SCAN"}
                  </button>
                )}
                {(stagedItems.length > 0 || stagedInstructions) && (
                  <button 
                    onClick={() => { setStagedItems([]); setStagedInstructions(''); setPreviewUrl(null); }}
                    className="w-full py-4 border border-[#404040] text-[#FAFAFA] text-[11px] font-bold uppercase tracking-[0.3em] hover:border-white transition-all"
                  >
                    RESET_SCANNER
                  </button>
                )}
              </div>
            )}
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*" className="hidden" />
          </div>

          <div className="flex-1 flex flex-col overflow-hidden bg-[#0E1117]">
            {!stagedItems.length && !stagedInstructions ? (
              <div className="flex-1 flex items-center justify-center p-12 text-center">
                 <div className="max-w-md space-y-6">
                    <div className="text-[12px] font-bold text-[#404040] uppercase tracking-[0.6em]">WAITING_FOR_DATA_STREAM</div>
                    {isProcessing && (
                      <div className="text-[10px] text-[#FAFAFA] uppercase leading-relaxed tracking-tight">
                        ANALYST_ENGINE: ACTIVE<br/>
                        MAPPING_INVOICE_GEOMETRY<br/>
                        PARSING_ENTITIES // {Math.floor(progress)}%
                      </div>
                    )}
                 </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-[#404040] flex justify-between items-center bg-[#0b0e14]">
                  <span className="text-[10px] font-bold text-[#FAFAFA] uppercase tracking-widest">
                    {documentTitle || 'EXTRACTED DATASET'}
                  </span>
                  {error && <span className="text-[10px] font-bold text-red-500 uppercase">{error}</span>}
                </div>
                
                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 bg-[#151921] border-b border-[#404040]">
                    <label className="text-[9px] font-bold text-[#888] uppercase block mb-2">INGREDIENTS LIST</label>
                    <table className="w-full text-left border-collapse border border-[#404040]">
                      <thead className="bg-[#0E1117] border-b border-[#404040]">
                        <tr>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase border-r border-[#404040]">DESCRIPTION</th>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase border-r border-[#404040] text-right">QTY</th>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase border-r border-[#404040]">UNIT</th>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase border-r border-[#404040]">REGISTRY MATCH</th>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase text-center w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#404040]">
                        {stagedItems.map((item) => (
                          <tr key={item.id} className="hover:bg-[#1c222b] transition-colors border-b border-[#404040]">
                            <td className="p-2 border-r border-[#404040]">
                              <input 
                                type="text"
                                value={item.name}
                                onChange={(e) => updateName(item.id, e.target.value)}
                                className="w-full bg-transparent border border-transparent focus:border-[#404040] text-[#FAFAFA] text-[11px] p-1 outline-none font-bold"
                              />
                            </td>
                            <td className="p-3 text-[11px] text-[#FAFAFA] border-r border-[#404040] text-right font-mono">
                              {item.quantity}
                            </td>
                            <td className="p-2 border-r border-[#404040]">
                              <select 
                                value={item.unit?.toLowerCase() || 'ea'}
                                onChange={(e) => updateUnit(item.id, e.target.value)}
                                className="w-full bg-black border border-[#404040] text-[#FAFAFA] text-[10px] p-1 outline-none font-mono"
                              >
                                <option value="ea">EA</option>
                                <option value="g">G</option>
                                <option value="kg">KG</option>
                                <option value="ml">ML</option>
                                <option value="l">L</option>
                              </select>
                            </td>
                            <td className="p-2 border-r border-[#404040]">
                              <div className="flex flex-col gap-2">
                                <select 
                                  value={item.matchedIngredientId || 'none'}
                                  onChange={(e) => updateMatch(item.id, e.target.value)}
                                  className="w-full bg-black border border-[#404040] text-[#FAFAFA] text-[10px] p-1 outline-none font-mono"
                                >
                                  <option value="none">-- NO MATCH FOUND --</option>
                                  {ingredients.map(ing => (
                                    <option key={ing.id} value={ing.id}>{ing.name.toUpperCase()}</option>
                                  ))}
                                </select>
                                {!item.matchedIngredientId && (
                                  <button 
                                    onClick={() => onIngredientCreateRequest(item.name)}
                                    className="w-full py-1 border border-[#c8a96e] text-[#c8a96e] text-[8px] font-bold uppercase hover:bg-[#c8a96e] hover:text-black transition-all"
                                  >
                                    + CREATE IN REGISTRY
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <button 
                                onClick={() => deleteItem(item.id)}
                                className="text-red-500 hover:text-white transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-4">
                    <label className="text-[9px] font-bold text-[#888] uppercase block mb-2">PREPARATION METHOD / INSTRUCTIONS</label>
                    <textarea 
                      value={stagedInstructions}
                      onChange={(e) => setStagedInstructions(e.target.value)}
                      placeholder="Extracted method text will appear here..."
                      className="w-full h-64 bg-black border border-[#404040] text-[#FAFAFA] text-[11px] p-4 outline-none focus:border-white font-sans leading-relaxed resize-none"
                    />
                  </div>
                </div>
                
                <div className="p-8 border-t border-[#404040] flex justify-end items-center bg-[#0b0e14]">
                  <button 
                    onClick={handleAddToRecipe}
                    className="px-16 py-4 bg-[#FAFAFA] text-[#0E1117] text-[12px] font-bold uppercase tracking-[0.2em] hover:bg-white transition-all shadow-xl !rounded-none"
                  >
                    PUSH TO RECIPE CARD
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-2 border-t border-[#404040] bg-black flex justify-between items-center">
           <div className="text-[8px] text-[#404040] uppercase tracking-[0.4em]">OCR_STAGING_v10 // KERNEL_G3_FLASH</div>
           <div className="text-[8px] text-[#404040] uppercase tracking-[0.4em]">STRICT_INSTRUCTIONS_ENABLED</div>
        </div>
      </div>
    </div>
  );
};
