import React, { useState, useRef } from 'react';
import { useIngredients, useIngredientMutations } from '../hooks/useKitchenData';
import { useStore } from '../store/useStore';
import { useAuth } from '../hooks/useAuth';
import { Upload, ScanLine, CheckCircle2, AlertTriangle, X, RefreshCw, ShieldAlert } from 'lucide-react';
import { supplierBadgeClass } from '../utils/supplierColors';
import { prepareImageForGemini, callGeminiVision, parseGeminiJson } from '../utils/gemini';
import { findBestIngredientMatch } from '../utils/matching';

interface InvoiceLine {
  rawText: string;
  name: string;
  packCost: number;
  packSize: number;
  packUnit: string;
  supplier: string;
  // matched pantry item
  matchedIngredientId?: string;
  matchedIngredientName?: string;
  currentPackCost?: number;
  diffPct?: number;
}

async function scanInvoiceWithGemini(base64Image: string, mimeType: string): Promise<InvoiceLine[]> {
  const prompt = `You are analysing a UK wholesale food supplier invoice or delivery note.
Extract every line item product. For each product return a JSON array with objects containing:
- name: product name (string, clean title case)
- packCost: the cost of ONE single pack/unit (number, GBP, no currency symbol) — see rules below
- packSize: pack size quantity (number)
- packUnit: unit (string: one of "kg", "g", "l", "ml", "ea")
- supplier: supplier name if visible on the invoice (string, or "Unknown")

Rules:
- Invoices typically show a "PRICE" (or "UNIT PRICE") column and a separate "VALUE" (or "TOTAL")
  column, where VALUE = PRICE × QTY ordered. packCost MUST always be the single-pack PRICE, never
  the extended VALUE — if QTY is 2 or more, do NOT multiply the price by the quantity ordered. For
  example a line "QTY 2, PRICE 16.99, VALUE 33.98" means packCost is 16.99, not 33.98.
- If only one combined price is shown (no separate per-unit and total columns) and QTY is 1, that
  single price is the packCost
- Ignore VAT lines, delivery charges, totals, and header rows
- Return ONLY valid JSON array, no markdown, no explanation

Example output:
[{"name":"Double Cream","packCost":4.85,"packSize":2,"packUnit":"l","supplier":"David Catt"},...]`;

  const text = await callGeminiVision(prompt, base64Image, mimeType);
  return parseGeminiJson<InvoiceLine[]>(text);
}

export const InvoiceScanner: React.FC = () => {
  const { appUser } = useAuth();
  const isManager = appUser?.role === 'manager';
  const { data: ingredients = [] } = useIngredients();
  const { updateIngredient } = useIngredientMutations();
  const showToast = useStore(s => s.showToast);
  const navigateToPantryWithIngredient = useStore(s => s.navigateToPantryWithIngredient);

  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState<Set<string>>(new Set());
  const [updated, setUpdated] = useState<Set<string>>(new Set());
  const [apiKey, setApiKey] = useState(localStorage.getItem('geminiApiKey') || '');
  const [linkingIndex, setLinkingIndex] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const saveApiKey = () => {
    localStorage.setItem('geminiApiKey', apiKey);
    showToast('Gemini API key saved', 'success');
  };

  const handleFile = async (file: File) => {
    setError(null);
    setLines([]);
    setScanning(true);
    setUpdated(new Set());

    try {
      const { base64, mimeType } = await prepareImageForGemini(file);

      const extracted = await scanInvoiceWithGemini(base64, mimeType);

      // Match against pantry ingredients using the same fuzzy matcher Catalog/Pantry
      // use elsewhere, rather than a plain substring check — handles this app's
      // "Item - Descriptor" naming (e.g. Gemini's "Dill" matching Pantry's "Dill - Fresh").
      const matched = extracted.map(line => {
        const match = findBestIngredientMatch(line.name, ingredients);
        const ing = match?.ingredient;
        if (!ing) return line;

        const pref = ing.suppliers?.find(s => s.isPreferred) || ing.suppliers?.[0];
        const currentPackCost = pref?.packCost ?? 0;
        const diffPct = currentPackCost > 0
          ? ((line.packCost - currentPackCost) / currentPackCost) * 100
          : null;

        return {
          ...line,
          matchedIngredientId: ing.id,
          matchedIngredientName: ing.name,
          currentPackCost,
          diffPct: diffPct ?? undefined
        };
      });

      setLines(matched);
    } catch (e: any) {
      setError(e.message || 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleUpdatePrice = async (line: InvoiceLine) => {
    if (!line.matchedIngredientId) return;
    const key = line.matchedIngredientId;
    setUpdating(prev => new Set(prev).add(key));

    try {
      const ing = ingredients.find(i => i.id === key);
      if (!ing) throw new Error('Ingredient not found');
      const suppliers = ing.suppliers || [];
      const supplierIndex = suppliers.findIndex(s => s.name.toLowerCase() === (line.supplier || '').toLowerCase());
      let updatedSuppliers;
      if (supplierIndex >= 0) {
        updatedSuppliers = suppliers.map((s, i) => i === supplierIndex ? { ...s, packCost: line.packCost, packSize: line.packSize, packUnit: line.packUnit as any } : s);
      } else if (suppliers.some(s => s.isPreferred)) {
        // Fall back to updating whichever supplier is preferred, matching the invoice's
        // supplier not being an exact name match to anything already linked (e.g. "Booker" vs
        // a slightly different name Gemini extracted).
        updatedSuppliers = suppliers.map((s, i) => (i === 0 || s.isPreferred) ? { ...s, packCost: line.packCost, packSize: line.packSize, packUnit: line.packUnit as any } : s);
      } else {
        // No existing supplier at all (e.g. a freshly manually-linked ingredient) — add one.
        updatedSuppliers = [...suppliers, {
          name: line.supplier || 'Unknown',
          packCost: line.packCost,
          packSize: line.packSize,
          packUnit: line.packUnit as any,
          isPreferred: suppliers.length === 0
        }];
      }
      await updateIngredient.mutateAsync({ id: key, data: { suppliers: updatedSuppliers } });
      setUpdated(prev => new Set(prev).add(key));
      showToast(`Updated price for ${line.matchedIngredientName}`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Update failed', 'error');
    } finally {
      setUpdating(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  // Manually links a line that the fuzzy matcher missed — recomputes the same
  // current-price/diff fields the automatic match would have, so it slots into the
  // Price Changes / Unmatched sections identically either way.
  const applyManualLink = (index: number, ingredientId: string) => {
    const ing = ingredients.find(i => i.id === ingredientId);
    if (!ing) return;

    setLines(prev => prev.map((line, i) => {
      if (i !== index) return line;
      const pref = ing.suppliers?.find(s => s.isPreferred) || ing.suppliers?.[0];
      const currentPackCost = pref?.packCost ?? 0;
      const diffPct = currentPackCost > 0 ? ((line.packCost - currentPackCost) / currentPackCost) * 100 : null;
      return {
        ...line,
        matchedIngredientId: ing.id,
        matchedIngredientName: ing.name,
        currentPackCost,
        diffPct: diffPct ?? undefined
      };
    }));
    setLinkingIndex(null);
  };

  const indexedLines = lines.map((line, idx) => ({ line, idx }));
  const changedLines = indexedLines.filter(({ line }) => line.diffPct !== undefined && Math.abs(line.diffPct) >= 5);
  const unchangedLines = indexedLines.filter(({ line }) => line.diffPct === undefined || Math.abs(line.diffPct) < 5);

  if (!isManager) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center p-8">
        <ShieldAlert className="h-10 w-10 text-outline" />
        <span className="font-bold text-on-surface text-sm">Manager access required</span>
        <span className="text-xs text-outline max-w-xs">
          Invoice scanning updates supplier pricing — ask a manager to scan invoices.
        </span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-surface-container border-b border-outline-variant px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          <span className="font-bold text-on-surface">Invoice Scanner</span>
        </div>
        {lines.length > 0 && (
          <button onClick={() => { setLines([]); setError(null); }} className="text-xs text-outline hover:text-on-surface flex items-center gap-1">
            <X className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* API Key setup */}
        {!localStorage.getItem('geminiApiKey') && (
          <div className="border border-amber-500/30 bg-amber-500/5 p-4 rounded-sm flex gap-3 items-start">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-amber-700">Gemini API key required</p>
              <p className="text-[11px] text-amber-600 mt-1 mb-3">Get a free key at aistudio.google.com</p>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder="AIza..."
                  className="flex-1 px-2 py-1 border border-outline-variant text-xs rounded-sm"
                />
                <button onClick={saveApiKey} className="px-3 py-1 bg-primary text-white text-xs font-bold rounded-sm">Save</button>
              </div>
            </div>
          </div>
        )}

        {/* Upload area */}
        <div
          onClick={() => fileRef.current?.click()}
          className={`border-2 border-dashed border-outline-variant rounded-sm p-12 text-center cursor-pointer hover:border-primary hover:bg-surface-container transition-colors ${scanning ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
          />
          {scanning ? (
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-8 w-8 text-primary animate-spin" />
              <p className="text-sm text-on-surface-variant">Scanning invoice with Gemini…</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-8 w-8 text-outline" />
              <p className="text-sm font-semibold text-on-surface">Drop invoice image or click to upload</p>
              <p className="text-xs text-on-surface-variant">JPG, PNG, or PDF — delivery notes, invoices, price lists</p>
            </div>
          )}
        </div>

        {error && (
          <div className="border border-error bg-error-container p-4 rounded-sm flex gap-2 items-center text-xs text-on-error-container">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Price changes */}
        {changedLines.length > 0 && (
          <div>
            <h3 className="label-caps text-on-surface font-bold mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              Price Changes ({changedLines.length})
            </h3>
            <div className="flex flex-col gap-2">
              {changedLines.map(({ line, idx }) => {
                const isUpdating = updating.has(line.matchedIngredientId!);
                const isDone = updated.has(line.matchedIngredientId!);
                return (
                  <div key={idx} className="border border-outline-variant rounded-sm p-4 flex items-center gap-4 bg-surface">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-on-surface">{line.matchedIngredientName || line.name}</span>
                        {line.supplier && <span className={supplierBadgeClass(line.supplier)}>{line.supplier}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs">
                        <span className="text-outline line-through">£{line.currentPackCost?.toFixed(2)} current</span>
                        <span className={`font-bold data-tabular ${(line.diffPct ?? 0) > 0 ? 'text-error' : 'text-emerald-600'}`}>
                          £{line.packCost.toFixed(2)} invoice {(line.diffPct ?? 0) > 0 ? '▲' : '▼'}{Math.abs(line.diffPct ?? 0).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {line.matchedIngredientId && (
                        <button
                          onClick={() => navigateToPantryWithIngredient(line.matchedIngredientId!)}
                          className="h-8 px-3 text-xs border border-outline-variant rounded-sm hover:bg-surface-container"
                        >
                          View
                        </button>
                      )}
                      {isDone ? (
                        <div className="h-8 px-3 flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Updated
                        </div>
                      ) : (
                        <button
                          onClick={() => handleUpdatePrice(line)}
                          disabled={isUpdating || !line.matchedIngredientId}
                          className="h-8 px-3 bg-primary text-white text-xs font-bold rounded-sm disabled:opacity-50"
                        >
                          {isUpdating ? 'Saving…' : 'Update Price'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* No change / unmatched lines */}
        {unchangedLines.length > 0 && (
          <div>
            <h3 className="label-caps text-on-surface font-bold mb-3 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              No Price Change / Unmatched ({unchangedLines.length})
            </h3>
            <div className="flex flex-col gap-1.5">
              {unchangedLines.map(({ line, idx }) => (
                <div key={idx} className="border border-outline-variant rounded-sm px-4 py-2.5 text-xs bg-surface">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`font-semibold ${line.matchedIngredientName ? 'text-on-surface' : 'text-outline'}`}>
                      {line.matchedIngredientName || line.name}
                      {!line.matchedIngredientId && <span className="ml-2 text-[10px] text-outline italic">no pantry match</span>}
                    </span>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="data-tabular text-on-surface-variant">£{line.packCost.toFixed(2)}</span>
                      {!line.matchedIngredientId && linkingIndex !== idx && (
                        <button
                          onClick={() => setLinkingIndex(idx)}
                          className="text-[11px] font-bold text-primary hover:underline"
                        >
                          Link to Pantry Item
                        </button>
                      )}
                    </div>
                  </div>
                  {linkingIndex === idx && (
                    <div className="flex gap-2 mt-2 pt-2 border-t border-outline-variant">
                      <select
                        defaultValue=""
                        onChange={e => e.target.value && applyManualLink(idx, e.target.value)}
                        className="flex-1 px-2 py-1.5 border border-outline-variant bg-surface-container-lowest text-xs rounded-sm"
                      >
                        <option value="" disabled>Select Pantry Ingredient...</option>
                        {ingredients.map(ing => (
                          <option key={ing.id} value={ing.id}>{ing.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setLinkingIndex(null)}
                        className="h-7 px-3 text-[11px] font-semibold text-outline hover:text-on-surface border border-outline rounded-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceScanner;
