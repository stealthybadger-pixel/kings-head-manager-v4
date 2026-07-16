import React, { useState, useRef } from 'react';
import { useIngredients, useIngredientMutations } from '../hooks/useKitchenData';
import { useStore } from '../store/useStore';
import { useAuth } from '../hooks/useAuth';
import { Upload, ScanLine, CheckCircle2, AlertTriangle, X, RefreshCw, ShieldAlert } from 'lucide-react';
import { supplierBadgeClass } from '../utils/supplierColors';

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

const GEMINI_API_KEY = localStorage.getItem('geminiApiKey') || '';

async function scanInvoiceWithGemini(base64Image: string, mimeType: string): Promise<InvoiceLine[]> {
  const key = localStorage.getItem('geminiApiKey');
  if (!key) throw new Error('No Gemini API key set. Add it in Settings.');

  const prompt = `You are analysing a UK wholesale food supplier invoice or delivery note.
Extract every line item product. For each product return a JSON array with objects containing:
- name: product name (string, clean title case)
- packCost: total price for this line (number, GBP, no currency symbol)
- packSize: pack size quantity (number)
- packUnit: unit (string: one of "kg", "g", "l", "ml", "ea")
- supplier: supplier name if visible on the invoice (string, or "Unknown")

Rules:
- If the price appears to be per-unit price, set packCost to that value and packSize to 1
- Ignore VAT lines, delivery charges, totals, and header rows
- Return ONLY valid JSON array, no markdown, no explanation

Example output:
[{"name":"Double Cream","packCost":4.85,"packSize":2,"packUnit":"l","supplier":"David Catt"},...]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inline_data: { mime_type: mimeType, data: base64Image } }
          ]
        }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
      })
    }
  );

  if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned) as InvoiceLine[];
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
      const mimeType = file.type || 'image/jpeg';
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader();
        reader.onload = () => res((reader.result as string).split(',')[1]);
        reader.onerror = rej;
        reader.readAsDataURL(file);
      });

      const extracted = await scanInvoiceWithGemini(base64, mimeType);

      // Match against pantry ingredients
      const matched = extracted.map(line => {
        const nameLower = line.name.toLowerCase();
        const ing = ingredients.find(i =>
          i.name.toLowerCase() === nameLower ||
          i.name.toLowerCase().includes(nameLower) ||
          nameLower.includes(i.name.toLowerCase())
        );
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
      const updatedSuppliers = (ing.suppliers || []).map((s, i) => {
        if (i === 0 || s.isPreferred) return { ...s, packCost: line.packCost, packSize: line.packSize, packUnit: line.packUnit as any };
        return s;
      });
      await updateIngredient.mutateAsync({ id: key, data: { suppliers: updatedSuppliers } });
      setUpdated(prev => new Set(prev).add(key));
      showToast(`Updated price for ${line.matchedIngredientName}`, 'success');
    } catch (e: any) {
      showToast(e.message || 'Update failed', 'error');
    } finally {
      setUpdating(prev => { const s = new Set(prev); s.delete(key); return s; });
    }
  };

  const changedLines = lines.filter(l => l.diffPct !== undefined && Math.abs(l.diffPct) >= 5);
  const unchangedLines = lines.filter(l => l.diffPct === undefined || Math.abs(l.diffPct) < 5);

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
              {changedLines.map((line, i) => {
                const isUpdating = updating.has(line.matchedIngredientId!);
                const isDone = updated.has(line.matchedIngredientId!);
                return (
                  <div key={i} className="border border-outline-variant rounded-sm p-4 flex items-center gap-4 bg-surface">
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
              {unchangedLines.map((line, i) => (
                <div key={i} className="border border-outline-variant rounded-sm px-4 py-2.5 flex items-center justify-between text-xs bg-surface">
                  <span className={`font-semibold ${line.matchedIngredientName ? 'text-on-surface' : 'text-outline'}`}>
                    {line.matchedIngredientName || line.name}
                    {!line.matchedIngredientId && <span className="ml-2 text-[10px] text-outline italic">no pantry match</span>}
                  </span>
                  <span className="data-tabular text-on-surface-variant">£{line.packCost.toFixed(2)}</span>
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
