import { useEffect, useState } from 'react';
import { X, PackagePlus } from 'lucide-react';
import { useCatalogCapture } from '../hooks/useCatalogCapture';
import { useSupplierProductMutations } from '../hooks/useKitchenData';
import { useStore } from '../store/useStore';
import type { SupplierProduct } from '../types';

export default function CatalogCaptureModal() {
  const { state, clear } = useCatalogCapture();
  const { addSupplierProduct, updateSupplierProduct } = useSupplierProductMutations();
  const showToast = useStore((s) => s.showToast);

  const [name, setName] = useState('');
  const [packCost, setPackCost] = useState('');
  const [packSize, setPackSize] = useState('');
  const [packUnit, setPackUnit] = useState<SupplierProduct['packUnit']>('ea');

  useEffect(() => {
    if (!state) return;
    setName(state.captured.name);
    setPackCost(String(state.captured.packCost));
    setPackSize(String(state.captured.packSize));
    setPackUnit(state.captured.packUnit);
  }, [state]);

  if (!state) return null;

  const { captured, existingMatch } = state;
  const cost = parseFloat(packCost);
  const size = parseFloat(packSize);
  const valid = name.trim().length > 0 && cost > 0 && size > 0;

  const handleSave = async () => {
    if (!valid) return;
    const unitPrice = cost / size;

    try {
      if (existingMatch) {
        await updateSupplierProduct.mutateAsync({
          id: existingMatch.id,
          data: {
            name: name.trim(),
            packCost: cost,
            packSize: size,
            packUnit,
            unitPrice,
            source: captured.sourceUrl,
            bookerProductCode: captured.supplier === 'Booker' ? captured.productCode : existingMatch.bookerProductCode,
            urbanProductId: captured.supplier === 'Urban' ? captured.productCode : existingMatch.urbanProductId
          }
        });
        showToast(`Updated "${name.trim()}" in catalogue`, 'success');
      } else {
        await addSupplierProduct.mutateAsync({
          name: name.trim(),
          supplier: captured.supplier,
          packCost: cost,
          packSize: size,
          packUnit,
          unitPrice,
          source: captured.sourceUrl,
          capturedAt: new Date().toISOString(),
          bookerProductCode: captured.supplier === 'Booker' ? captured.productCode : undefined,
          urbanProductId: captured.supplier === 'Urban' ? captured.productCode : undefined
        });
        showToast(`Added "${name.trim()}" to catalogue`, 'success');
      }
      clear();
    } catch (err) {
      showToast('Failed to save captured product', 'error');
    }
  };

  const saving = addSupplierProduct.isPending || updateSupplierProduct.isPending;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4" onClick={clear}>
      <div
        className="w-full max-w-md rounded-lg border border-outline-variant bg-surface-container-lowest shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant">
          <div className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-primary" />
            <h2 className="text-sm font-bold label-caps tracking-wide text-on-surface">
              {existingMatch ? 'Update Catalogue Item' : 'Add to Catalogue'}
            </h2>
          </div>
          <button onClick={clear} className="p-1 rounded-full hover:bg-surface-container">
            <X className="h-4 w-4 text-outline" />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3">
          <p className="text-xs text-on-surface-variant">
            Captured from <span className="font-semibold">{captured.supplier}</span>
          </p>

          {existingMatch && (
            <div className="text-xs rounded-md bg-amber-950/30 border border-amber-500/30 text-amber-200 px-3 py-2">
              This item already exists in the catalogue. Saving will update its price and details.
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-on-surface-variant">Name</span>
            <input
              className="rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <div className="flex gap-3">
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs font-semibold text-on-surface-variant">Pack Cost (£)</span>
              <input
                type="number"
                step="0.01"
                className="rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
                value={packCost}
                onChange={(e) => setPackCost(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 flex-1">
              <span className="text-xs font-semibold text-on-surface-variant">Pack Size</span>
              <input
                type="number"
                step="0.01"
                className="rounded-md border border-outline-variant bg-surface-container px-3 py-2 text-sm text-on-surface"
                value={packSize}
                onChange={(e) => setPackSize(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 w-24">
              <span className="text-xs font-semibold text-on-surface-variant">Unit</span>
              <select
                className="rounded-md border border-outline-variant bg-surface-container px-2 py-2 text-sm text-on-surface"
                value={packUnit}
                onChange={(e) => setPackUnit(e.target.value as SupplierProduct['packUnit'])}
              >
                <option value="g">g</option>
                <option value="kg">kg</option>
                <option value="ml">ml</option>
                <option value="l">l</option>
                <option value="ea">ea</option>
                <option value="oz">oz</option>
              </select>
            </label>
          </div>

          {cost > 0 && size > 0 && (
            <p className="text-xs text-on-surface-variant">
              Unit price: £{(cost / size).toFixed(4)} / {packUnit}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-outline-variant">
          <button
            onClick={clear}
            className="px-4 py-2 text-xs font-semibold rounded-md text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!valid || saving}
            className="px-4 py-2 text-xs font-semibold rounded-md bg-primary text-on-primary disabled:opacity-50"
          >
            {saving ? 'Saving…' : existingMatch ? 'Update Item' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}
