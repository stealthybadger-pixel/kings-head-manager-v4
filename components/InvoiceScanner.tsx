import React, { useState, useRef, useMemo, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { useKitchenData } from '../hooks/useKitchenData';
import { Ingredient, Unit, Invoice, StockMovement } from '../types';
import { useConfirmation } from '../hooks/useConfirmation';
import { detectAllergens, estimateKcal, detectCategory, detectSupplierFromCategory, getLevenshteinDistance } from '../utils/intelligence';
import { SourceTag } from './SourceTag';

interface ExtractedInvoiceItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  unitCost: number;
  matchedIngredientId?: string;
}

interface InvoiceScannerProps {
  onCancel: () => void;
}

const SearchableIngredientDropdown: React.FC<{
  currentId?: string;
  onSelect: (id: string) => void;
  ingredients: Ingredient[];
  onCreateNew: () => void;
  isCreating: boolean;
  ocrName: string;
}> = ({ currentId, onSelect, ingredients, onCreateNew, isCreating, ocrName }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selectedIngredient = ingredients.find(i => i.id === currentId);

  const sortedAndFiltered = useMemo(() => {
    const query = search.trim() || ocrName.trim();
    if (!query) return ingredients.slice(0, 50);

    const qLower = query.toLowerCase();

    const scored = ingredients.map(ing => {
       const iName = ing.name.toLowerCase();
       let score = 0;

       if (iName === qLower) score = 1000;
       else if (iName.startsWith(qLower)) score = 500;
       else if (iName.includes(qLower)) score = 100;
       else {
         const dist = getLevenshteinDistance(iName, qLower);
         score = -dist;
       }

       return { ing, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.ing).slice(0, 50);
  }, [ingredients, search, ocrName]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative w-full font-mono" ref={wrapperRef}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full bg-black border p-2 text-[10px] cursor-pointer flex justify-between items-center transition-colors ${selectedIngredient ? 'border-[#c8a96e] text-[#c8a96e]' : 'border-[#404040] text-[#666]'}`}
      >
        <span className="truncate uppercase font-bold">
          {selectedIngredient ? selectedIngredient.name : 'MATCH_REQUIRED'}
        </span>
        <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 w-full z-[300] bg-[#0b0e14] border border-[#c8a96e] shadow-[0_10px_30px_rgba(0,0,0,0.5)] mt-1">
          <input
            autoFocus
            type="text"
            placeholder={ocrName ? `FILTER: ${ocrName}...` : "FILTER_REGISTRY..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#151921] border-b border-[#c8a96e]/30 p-2 text-[10px] text-white outline-none placeholder:text-[#444]"
          />

          {!selectedIngredient && (
            <div className="p-2 bg-black border-b border-[#c8a96e]/30">
              <button
                disabled={isCreating}
                onClick={() => { onCreateNew(); setIsOpen(false); }}
                className={`w-full py-2 bg-transparent border border-[#c8a96e] text-[#c8a96e] text-[9px] font-bold uppercase tracking-widest hover:bg-[#c8a96e] hover:text-black transition-all ${isCreating ? 'opacity-50 animate-pulse' : ''}`}
              >
                {isCreating ? 'INITIALIZING_RECORD...' : '+ CREATE_IN_REGISTRY'}
              </button>
            </div>
          )}

          <div className="max-h-64 overflow-y-auto divide-y divide-[#1c222b]">
            {sortedAndFiltered.length > 0 ? sortedAndFiltered.map(ing => {
              const pref = ing.suppliers.find(s => s.isPreferred) || ing.suppliers[0];
              return (
                <div
                  key={ing.id}
                  onClick={() => { onSelect(ing.id); setIsOpen(false); }}
                  className="p-2 hover:bg-[#c8a96e]/10 cursor-pointer group"
                >
                  <div className="text-[10px] text-white group-hover:text-[#c8a96e] font-bold uppercase truncate">{ing.name}</div>
                  <div className="text-[8px] text-[#444] uppercase">{ing.category} // {pref?.name}</div>
                </div>
              );
            }) : (
              <div className="p-4 text-center text-[8px] text-[#444] uppercase">NO_RECORDS_MATCHED</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const InvoiceScanner: React.FC<InvoiceScannerProps> = ({ onCancel }) => {
  const { ingredients, addIngredient, addInvoice } = useKitchenData();
  const { confirm } = useConfirmation();

  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [stagedItems, setStagedItems] = useState<ExtractedInvoiceItem[]>([]);
  const [invoiceSupplier, setInvoiceSupplier] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [invoiceReference, setInvoiceReference] = useState('');
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [creatingIds, setCreatingIds] = useState<Set<string>>(new Set());
  const [isCommitting, setIsCommitting] = useState(false);

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
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // Store both data URL and mime type
        setPreviewUrl(dataUrl);
      };
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

      // Detect MIME type from data URL
      const mimeTypeMatch = previewUrl.match(/data:([^;]+)/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType, data: base64Data } },
            {
              text: `EXTRACT INVOICE DATA.
              Find the supplier name, invoice date, and invoice reference number.
              Extract all line items with their names, quantities, units, and unit costs.
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
              supplier: { type: Type.STRING },
              date: { type: Type.STRING, description: "Invoice date in YYYY-MM-DD format" },
              reference: { type: Type.STRING, description: "Invoice or reference number" },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING },
                    unitCost: { type: Type.NUMBER }
                  },
                  required: ["name", "quantity", "unit", "unitCost"]
                }
              }
            },
            required: ["items"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      const itemsWithMatches = (result.items || []).map((item: any) => {
        const match = findMatch(item.name);
        return {
          id: Math.random().toString(36).substr(2, 9),
          ...item,
          quantity: sanitizeOCRValue(item.quantity),
          unitCost: sanitizeOCRValue(item.unitCost),
          matchedIngredientId: match?.id
        };
      });

      setStagedItems(itemsWithMatches);
      setInvoiceSupplier(result.supplier || '');
      setInvoiceDate(result.date || new Date().toISOString().slice(0, 10));
      setInvoiceReference(result.reference || '');
      setProgress(100);
    } catch (err: any) {
      console.error("OCR Error:", err);
      setError(err?.message || "SCAN FAILED - CHECK CONSOLE");
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

  const updateQuantity = (id: string, newQty: number) => {
    setStagedItems(prev => prev.map(item =>
      item.id === id ? { ...item, quantity: newQty } : item
    ));
  };

  const updateUnitCost = (id: string, newCost: number) => {
    setStagedItems(prev => prev.map(item =>
      item.id === id ? { ...item, unitCost: newCost } : item
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

  const handleInlineQuickCreate = async (stagedId: string, name: string) => {
    setCreatingIds(prev => new Set(prev).add(stagedId));
    try {
      const autoCategory = detectCategory(name);
      const autoSupplierName = detectSupplierFromCategory(autoCategory);
      const autoAllergens = detectAllergens(name);
      const autoKcal = estimateKcal(name);

      const newIng = await addIngredient({
        name: name,
        category: autoCategory,
        suppliers: [{
            name: autoSupplierName,
            packCost: 0,
            packSize: 1000,
            packUnit: 'g',
            isPreferred: true
        }],
        wastePercent: 0,
        allergens: autoAllergens,
        kcalPer100: autoKcal,
        stockLevel: 0,
        incomplete: true
      });

      setStagedItems(prev => prev.map(item =>
        item.id === stagedId ? { ...item, matchedIngredientId: newIng.id } : item
      ));
    } catch (err) {
      console.error("Failed to quick-create ingredient:", err);
      setError("REGISTRY WRITE FAILED");
    } finally {
      setCreatingIds(prev => {
        const next = new Set(prev);
        next.delete(stagedId);
        return next;
      });
    }
  };

  const handleCommitInvoice = async () => {
    const validItems = stagedItems.filter(item => !!item.matchedIngredientId);

    if (validItems.length === 0) {
      setError("ALL ITEMS MUST BE MATCHED TO INGREDIENTS");
      return;
    }

    if (!invoiceSupplier || !invoiceDate) {
      setError("SUPPLIER AND DATE REQUIRED");
      return;
    }

    const totalCost = validItems.reduce((sum, item) => sum + (item.quantity * item.unitCost), 0);

    const ok = await confirm(`CREATE INVOICE?\n${validItems.length} items\n£${totalCost.toFixed(2)}\nSupplier: ${invoiceSupplier}`);
    if (!ok) return;

    setIsCommitting(true);
    try {
      const movements: Omit<StockMovement, 'id'>[] = validItems.map(item => ({
        ingredientId: item.matchedIngredientId!,
        type: 'delivery' as const,
        quantity: item.quantity,
        unit: (['g', 'ml', 'kg', 'l', 'ea'].includes(item.unit?.toLowerCase()) ? item.unit.toLowerCase() : 'ea') as Unit,
        date: invoiceDate,
        supplierName: invoiceSupplier,
      }));

      const invoiceItems = validItems.map(item => ({
        ingredientId: item.matchedIngredientId!,
        quantity: item.quantity,
        unit: (['g', 'ml', 'kg', 'l', 'ea'].includes(item.unit?.toLowerCase()) ? item.unit.toLowerCase() : 'ea') as Unit,
        unitCost: item.unitCost,
      }));

      await addInvoice({
        supplier: invoiceSupplier,
        date: invoiceDate,
        reference: invoiceReference,
        notes: invoiceNotes,
        items: invoiceItems,
        totalCost: totalCost,
      }, movements);

      onCancel();
    } catch (err) {
      console.error("Failed to commit invoice:", err);
      setError("INVOICE COMMIT FAILED");
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0E1117] flex items-center justify-center z-[200] p-0 md:p-8 font-mono !rounded-none overflow-hidden text-[#FAFAFA]">
      <div className="w-full max-w-7xl bg-[#0E1117] border border-[#404040] flex flex-col h-full !rounded-none relative shadow-[0_0_100px_rgba(0,0,0,0.9)]">

        {isProcessing && (
          <div className="absolute top-0 left-0 w-full h-1 z-[300] bg-black">
            <div
              className="h-full bg-[#c8a96e] transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}

        <div className="p-4 border-b border-[#404040] flex justify-between items-center bg-[#151921]">
          <div className="flex items-center gap-6">
            <span className="text-[11px] font-bold text-[#FFFFFF] tracking-[0.4em] uppercase">INVOICE SCANNER</span>
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
                {!stagedItems.length && (
                  <button
                    onClick={processImage}
                    disabled={isProcessing}
                    className="w-full py-4 bg-[#FAFAFA] text-[#0E1117] text-[11px] font-bold uppercase tracking-[0.3em] disabled:opacity-30 hover:bg-white transition-all"
                  >
                    {isProcessing ? "PROCESSING_CORE" : "EXECUTE SCAN"}
                  </button>
                )}
                {stagedItems.length > 0 && (
                  <button
                    onClick={() => { setStagedItems([]); setPreviewUrl(null); }}
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
            {!stagedItems.length ? (
              <div className="flex-1 flex items-center justify-center p-12 text-center">
                 <div className="max-w-md space-y-6">
                    <div className="text-[12px] font-bold text-[#404040] uppercase tracking-[0.6em]">WAITING_FOR_DATA_STREAM</div>
                    {isProcessing && (
                      <div className="text-[10px] text-[#FAFAFA] uppercase leading-relaxed tracking-tight">
                        ANALYST_ENGINE: ACTIVE<br/>
                        PARSING_INVOICE_GEOMETRY<br/>
                        EXTRACTING_ENTITIES // {Math.floor(progress)}%
                      </div>
                    )}
                 </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-[#404040] bg-[#0b0e14]">
                  <span className="text-[10px] font-bold text-[#FAFAFA] uppercase tracking-widest">
                    INVOICE METADATA
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <div className="p-4 bg-[#151921] border-b border-[#404040] grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[9px] font-bold text-[#888] uppercase block mb-1">Supplier</label>
                      <input
                        type="text"
                        value={invoiceSupplier}
                        onChange={(e) => setInvoiceSupplier(e.target.value)}
                        className="w-full bg-black border border-[#404040] text-[#FAFAFA] text-[10px] p-2 outline-none focus:border-[#c8a96e]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-[#888] uppercase block mb-1">Date</label>
                      <input
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="w-full bg-black border border-[#404040] text-[#FAFAFA] text-[10px] p-2 outline-none focus:border-[#c8a96e]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-[#888] uppercase block mb-1">Reference</label>
                      <input
                        type="text"
                        value={invoiceReference}
                        onChange={(e) => setInvoiceReference(e.target.value)}
                        className="w-full bg-black border border-[#404040] text-[#FAFAFA] text-[10px] p-2 outline-none focus:border-[#c8a96e]"
                      />
                    </div>
                    <div>
                      <label className="text-[9px] font-bold text-[#888] uppercase block mb-1">Notes</label>
                      <input
                        type="text"
                        value={invoiceNotes}
                        onChange={(e) => setInvoiceNotes(e.target.value)}
                        placeholder="Optional..."
                        className="w-full bg-black border border-[#404040] text-[#FAFAFA] text-[10px] p-2 outline-none focus:border-[#c8a96e]"
                      />
                    </div>
                  </div>

                  <div className="p-4">
                    <label className="text-[9px] font-bold text-[#888] uppercase block mb-2">LINE ITEMS</label>
                    <table className="w-full text-left border-collapse border border-[#404040]">
                      <thead className="bg-[#0E1117] border-b border-[#404040]">
                        <tr>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase border-r border-[#404040]">DESCRIPTION</th>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase border-r border-[#404040] text-right w-16">QTY</th>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase border-r border-[#404040] w-12">UNIT</th>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase border-r border-[#404040] text-right w-20">UNIT COST</th>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase border-r border-[#404040]">INGREDIENT MATCH</th>
                          <th className="p-3 text-[9px] font-bold text-[#888] uppercase text-center w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#404040]">
                        {stagedItems.map((item) => (
                          <tr key={item.id} className="hover:bg-[#1c222b] transition-colors border-b border-[#404040]">
                            <td className="p-2 border-r border-[#404040] flex items-center gap-2">
                              <input
                                type="text"
                                value={item.name}
                                onChange={(e) => updateName(item.id, e.target.value)}
                                className="w-full bg-transparent border border-transparent focus:border-[#404040] text-[#FAFAFA] text-[11px] p-1 outline-none font-bold"
                              />
                            </td>
                            <td className="p-2 text-[11px] text-[#FAFAFA] border-r border-[#404040] text-right font-mono">
                               <input
                                 type="number"
                                 value={item.quantity}
                                 onChange={(e) => updateQuantity(item.id, parseFloat(e.target.value))}
                                 className="w-full bg-transparent border border-transparent focus:border-[#404040] text-right text-[#FAFAFA] text-[11px] p-1 outline-none font-mono"
                               />
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
                              <input
                                type="number"
                                step="0.0001"
                                value={item.unitCost}
                                onChange={(e) => updateUnitCost(item.id, parseFloat(e.target.value))}
                                className="w-full bg-transparent border border-transparent focus:border-[#404040] text-right text-[#FAFAFA] text-[11px] p-1 outline-none font-mono"
                              />
                            </td>
                            <td className="p-2 border-r border-[#404040] min-w-[200px]">
                              <SearchableIngredientDropdown
                                currentId={item.matchedIngredientId}
                                ingredients={ingredients}
                                onSelect={(id) => updateMatch(item.id, id)}
                                onCreateNew={() => handleInlineQuickCreate(item.id, item.name)}
                                isCreating={creatingIds.has(item.id)}
                                ocrName={item.name}
                              />
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
                </div>

                <div className="p-4 border-t border-[#404040] flex justify-end items-center gap-4 bg-[#0b0e14]">
                  {error && <span className="text-[10px] font-bold text-red-500 uppercase">{error}</span>}
                  <button
                    onClick={handleCommitInvoice}
                    disabled={isCommitting || stagedItems.length === 0}
                    className="px-16 py-4 bg-[#FAFAFA] text-[#0E1117] text-[12px] font-bold uppercase tracking-[0.2em] hover:bg-white transition-all shadow-xl !rounded-none disabled:opacity-30"
                  >
                    {isCommitting ? 'COMMITTING...' : 'COMMIT INVOICE'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-2 border-t border-[#404040] bg-black flex justify-between items-center">
           <div className="text-[8px] text-[#404040] uppercase tracking-[0.4em]">INVOICE_SCANNER_v1 // KERNEL_G3_FLASH</div>
           <div className="text-[8px] text-[#404040] uppercase tracking-[0.4em]">INTELLIGENCE_ROUTING: ACTIVE</div>
        </div>
      </div>
    </div>
  );
};
