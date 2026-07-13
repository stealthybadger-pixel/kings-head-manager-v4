# Catalogue Capture Chrome Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that scrapes one product's details off a supplier's site on demand and relays them into the already-open KHKM app, which shows a review/edit modal before saving to `supplierProducts`.

**Architecture:** MV3 extension with three per-site content scripts (Booker, Fresho/David Catt, Urban) + a popup UI, relaying scraped data via `window.postMessage` into a matching content script on the KHKM app tab. The app listens for that message, checks for an existing catalogue match, and opens a modal that writes through the app's existing (already-authenticated) Firestore client.

**Tech Stack:** Chrome Extension Manifest V3 (vanilla JS, no build step), React 18 + TypeScript (existing app), Firebase JS SDK (existing), Vitest (new — added in Task 1 for the two pure-logic modules).

Spec: `docs/superpowers/specs/2026-07-13-catalog-capture-extension-design.md`

---

### Task 1: Add Vitest for the two pure-logic modules

The project has no test runner today. This project already uses Vite, so Vitest is the natural fit — it shares Vite's config and needs almost no setup. This task only adds the runner and proves it works; real tests come in Tasks 2 and 3.

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`
- Create: `src/utils/__tests__/sanity.test.ts`

- [ ] **Step 1: Install Vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Add the test script**

In `package.json`, inside `"scripts"`, add:
```json
    "test": "vitest run",
```
(Add it as a new line after `"lint"` — keep the existing scripts unchanged otherwise.)

- [ ] **Step 3: Create the Vitest config**

Create `vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Write a sanity test**

Create `src/utils/__tests__/sanity.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

Run: `npm test`
Expected: `1 passed` for the sanity test.

- [ ] **Step 6: Delete the sanity test and commit the runner setup**

```bash
rm src/utils/__tests__/sanity.test.ts
git add package.json package-lock.json vitest.config.ts
git commit -m "chore: add vitest for testing pure utility modules"
```

---

### Task 2: `packParser.ts` — parse supplier pack-size text into structured data

Each supplier site describes pack size differently ("Case of 1", "12 x 330ml", "1.36kg"). This pure function turns that text into `{ packSize, packUnit }` matching the app's existing `SupplierProductSchema` (`packUnit` is one of `'g' | 'ml' | 'ea' | 'kg' | 'l' | 'oz'`). Returns `null` when it can't confidently parse — the capture modal (Task 6) lets the user fill in the blanks by hand in that case, so a wrong guess is worse than no guess.

**Files:**
- Create: `src/utils/packParser.ts`
- Test: `src/utils/__tests__/packParser.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/packParser.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parsePackText } from '../packParser';

describe('parsePackText', () => {
  it('parses "N x SIZEUNIT" as total pack size', () => {
    expect(parsePackText('12 x 330ml')).toEqual({ packSize: 3960, packUnit: 'ml' });
  });

  it('parses "N x SIZEUNIT" with a decimal size', () => {
    expect(parsePackText('6 x 0.5kg')).toEqual({ packSize: 3, packUnit: 'kg' });
  });

  it('parses a bare "SIZEUNIT"', () => {
    expect(parsePackText('1.36kg')).toEqual({ packSize: 1.36, packUnit: 'kg' });
  });

  it('parses a bare size in litres', () => {
    expect(parsePackText('2l')).toEqual({ packSize: 2, packUnit: 'l' });
  });

  it('parses "Case of N" as N eaches', () => {
    expect(parsePackText('Case of 1')).toEqual({ packSize: 1, packUnit: 'ea' });
  });

  it('parses "Case of N x ..." using the leading count', () => {
    expect(parsePackText('Case of 5 x 1pk')).toEqual({ packSize: 5, packUnit: 'ea' });
  });

  it('is case-insensitive and tolerates extra whitespace', () => {
    expect(parsePackText('  CASE OF 3  ')).toEqual({ packSize: 3, packUnit: 'ea' });
  });

  it('returns null for text it cannot parse', () => {
    expect(parsePackText('Ask in store')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(parsePackText('')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- packParser`
Expected: FAIL — `Cannot find module '../packParser'` (file doesn't exist yet).

- [ ] **Step 3: Implement `parsePackText`**

Create `src/utils/packParser.ts`:
```ts
export type PackUnit = 'g' | 'ml' | 'ea' | 'kg' | 'l' | 'oz';

export interface ParsedPack {
  packSize: number;
  packUnit: PackUnit;
}

const UNIT_PATTERN = '(ml|l|kg|g|oz|ea)';

/**
 * Parses free-text pack-size descriptions from supplier sites (e.g.
 * "12 x 330ml", "1.36kg", "Case of 1") into a structured pack size + unit.
 * Returns null when the text doesn't match a known pattern, rather than
 * guessing — the caller should let the user fill it in by hand instead.
 */
export function parsePackText(text: string): ParsedPack | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // "N x SIZEUNIT" e.g. "12 x 330ml", "6 x 0.5kg"
  const multiMatch = trimmed.match(
    new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}$`, 'i')
  );
  if (multiMatch) {
    const count = parseFloat(multiMatch[1]);
    const size = parseFloat(multiMatch[2]);
    const unit = multiMatch[3].toLowerCase() as PackUnit;
    return { packSize: round(count * size), packUnit: unit };
  }

  // Bare "SIZEUNIT" e.g. "1.36kg", "2l"
  const bareMatch = trimmed.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}$`, 'i'));
  if (bareMatch) {
    const size = parseFloat(bareMatch[1]);
    const unit = bareMatch[2].toLowerCase() as PackUnit;
    return { packSize: size, packUnit: unit };
  }

  // "Case of N" (optionally followed by more detail we ignore, e.g. "x 1pk")
  const caseMatch = trimmed.match(/^case\s+of\s+(\d+(?:\.\d+)?)/i);
  if (caseMatch) {
    return { packSize: parseFloat(caseMatch[1]), packUnit: 'ea' };
  }

  return null;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- packParser`
Expected: all 9 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/packParser.ts src/utils/__tests__/packParser.test.ts
git commit -m "feat: add pack-size text parser for catalogue capture"
```

---

### Task 3: `catalogCapture.ts` — types + duplicate matching

Defines the shape of data the extension sends and the pure function that decides whether a captured product already exists in the catalogue (by product code where available, else by normalized name + supplier).

**Files:**
- Create: `src/utils/catalogCapture.ts`
- Test: `src/utils/__tests__/catalogCapture.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/catalogCapture.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { findExistingMatch, type CapturedProduct } from '../catalogCapture';
import type { SupplierProduct } from '../../types';

const existing: SupplierProduct[] = [
  {
    id: 'abc123',
    name: "Chef's Essentials Mild Coloured Cheddar",
    supplier: 'Booker',
    packCost: 27.45,
    packSize: 1,
    packUnit: 'ea',
    unitPrice: 27.45,
    bookerProductCode: '153093',
  },
  {
    id: 'def456',
    name: 'Beetroot - Candy',
    supplier: 'David Catt',
    packCost: 2.24,
    packSize: 1,
    packUnit: 'kg',
    unitPrice: 2.24,
  },
];

describe('findExistingMatch', () => {
  it('matches Booker items by bookerProductCode', () => {
    const captured: CapturedProduct = {
      supplier: 'Booker',
      name: "Chef's Essentials Mild Coloured Cheddar",
      packCost: 28.0,
      packSize: 1,
      packUnit: 'ea',
      productCode: '153093',
      sourceUrl: 'https://www.booker.co.uk/products/product?Code=153093',
    };
    expect(findExistingMatch(captured, existing)?.id).toBe('abc123');
  });

  it('does not match a Booker code against a different supplier', () => {
    const captured: CapturedProduct = {
      supplier: 'Urban',
      name: 'Something Else',
      packCost: 1,
      packSize: 1,
      packUnit: 'ea',
      productCode: '153093',
      sourceUrl: 'https://shop.urbanfoodservice.co.uk/#/products/detail/153093',
    };
    expect(findExistingMatch(captured, existing)).toBeNull();
  });

  it('falls back to normalized name + supplier when there is no product code', () => {
    const captured: CapturedProduct = {
      supplier: 'David Catt',
      name: '  beetroot - candy  ',
      packCost: 2.3,
      packSize: 1,
      packUnit: 'kg',
      sourceUrl: 'https://app.fresho.com/marketplace/products?search=beetroot',
    };
    expect(findExistingMatch(captured, existing)?.id).toBe('def456');
  });

  it('returns null when nothing matches', () => {
    const captured: CapturedProduct = {
      supplier: 'David Catt',
      name: 'Completely New Product',
      packCost: 5,
      packSize: 1,
      packUnit: 'kg',
      sourceUrl: 'https://app.fresho.com/marketplace/products?search=new',
    };
    expect(findExistingMatch(captured, existing)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- catalogCapture`
Expected: FAIL — `Cannot find module '../catalogCapture'`.

- [ ] **Step 3: Implement `catalogCapture.ts`**

Create `src/utils/catalogCapture.ts`:
```ts
import type { SupplierProduct } from '../types';

export type CaptureSupplier = 'Booker' | 'David Catt' | 'Urban';

export interface CapturedProduct {
  supplier: CaptureSupplier;
  name: string;
  packCost: number;
  packSize: number;
  packUnit: SupplierProduct['packUnit'];
  productCode?: string;
  sourceUrl: string;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function codeFieldFor(supplier: CaptureSupplier): keyof SupplierProduct | null {
  if (supplier === 'Booker') return 'bookerProductCode';
  if (supplier === 'Urban') return 'urbanProductId';
  return null; // David Catt / Fresho has no stable product code
}

/**
 * Finds an existing catalogue entry that matches a freshly captured product,
 * preferring an exact product-code match (Booker/Urban) and falling back to
 * normalized name + supplier equality (needed for David Catt/Fresho, which
 * has no stable per-product code).
 */
export function findExistingMatch(
  captured: CapturedProduct,
  existing: SupplierProduct[]
): SupplierProduct | null {
  const codeField = codeFieldFor(captured.supplier);
  if (codeField && captured.productCode) {
    const byCode = existing.find(
      (p) => p.supplier === captured.supplier && p[codeField] === captured.productCode
    );
    if (byCode) return byCode;
  }

  const capturedNameNorm = normalizeName(captured.name);
  return (
    existing.find(
      (p) => p.supplier === captured.supplier && normalizeName(p.name) === capturedNameNorm
    ) ?? null
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- catalogCapture`
Expected: all 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/catalogCapture.ts src/utils/__tests__/catalogCapture.test.ts
git commit -m "feat: add duplicate-matching logic for catalogue capture"
```

---

### Task 4: `addSupplierProduct` mutation

Adds the missing "create" mutation to `useSupplierProductMutations`, following the exact pattern `useIngredientMutations`'s `addIngredient` already uses in this file.

**Files:**
- Modify: `src/hooks/useKitchenData.ts:459-483` (the `useSupplierProductMutations` function, which currently only has `updateMutation` and `deleteMutation`)

- [ ] **Step 1: Add the import for `SupplierProductSchema` if not already imported**

Check the top of `src/hooks/useKitchenData.ts` — `SupplierProduct, SupplierProductSchema` are already imported (confirmed at line 13). No change needed here.

- [ ] **Step 2: Add `addMutation` inside `useSupplierProductMutations`**

In `src/hooks/useKitchenData.ts`, find the `useSupplierProductMutations` function (starts at line 459) and add a new mutation before `updateMutation`:
```ts
export const useSupplierProductMutations = () => {
  const queryClient = useQueryClient();

  const invalidateCatalogQueries = () => {
    queryClient.invalidateQueries({ queryKey: ['supplier_search'] });
    queryClient.invalidateQueries({ queryKey: ['supplier_products_all'] });
    queryClient.invalidateQueries({ queryKey: ['all_supplier_products_summary'] });
    queryClient.invalidateQueries({ queryKey: ['supplier_browse'] });
  };

  const addMutation = useMutation({
    mutationFn: async (data: Omit<SupplierProduct, 'id'>) => {
      const docRef = doc(collection(db, 'supplierProducts'));
      const fullItem = { id: docRef.id, ...data };
      SupplierProductSchema.parse(fullItem);
      await setDoc(docRef, fullItem);
      return fullItem;
    },
    onSuccess: invalidateCatalogQueries
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SupplierProduct> }) => {
      const docRef = doc(db, 'supplierProducts', id);
      const { id: _, ...updatePayload } = data as any;
      await updateDoc(docRef, withDeleteFieldForUndefined(updatePayload));
    },
    onSuccess: invalidateCatalogQueries
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDoc(doc(db, 'supplierProducts', id));
    },
    onSuccess: invalidateCatalogQueries
  });

  return {
    addSupplierProduct: addMutation,
    updateSupplierProduct: updateMutation,
    deleteSupplierProduct: deleteMutation
  };
};
```
This replaces the existing `useSupplierProductMutations` function body entirely (it currently duplicates the four `invalidateQueries` calls inline in both `updateMutation` and `deleteMutation` — the `invalidateCatalogQueries` helper above deduplicates that, and adds `addMutation` using the same create pattern as `addIngredient`).

- [ ] **Step 3: Verify the app still builds**

Run: `npm run build`
Expected: exits 0, no TypeScript errors.

This mutation has no UI to exercise it yet — Task 6 builds the modal that calls `addSupplierProduct`, and Task 6 Step 4 is where this gets a real manual verification (posting a fake capture message and confirming the item saves). No standalone verification step here.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useKitchenData.ts
git commit -m "feat: add addSupplierProduct mutation, dedupe query invalidation"
```

---

### Task 5: Capture message listener hook

A hook that listens for the extension's `postMessage`, validates it, and exposes the captured payload (plus any existing match) as state — the modal in Task 6 consumes this.

**Files:**
- Create: `src/hooks/useCatalogCapture.ts`

- [ ] **Step 1: Implement the hook**

Create `src/hooks/useCatalogCapture.ts`:
```ts
import { useEffect, useState } from 'react';
import { useSupplierProducts } from './useKitchenData';
import { findExistingMatch, type CapturedProduct } from '../utils/catalogCapture';
import type { SupplierProduct } from '../types';

export interface CaptureState {
  captured: CapturedProduct;
  existingMatch: SupplierProduct | null;
}

const MESSAGE_TYPE = 'KHKM_CATALOG_CAPTURE';

function isCapturedProduct(value: unknown): value is CapturedProduct {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.supplier === 'string' &&
    typeof v.name === 'string' &&
    typeof v.packCost === 'number' &&
    typeof v.packSize === 'number' &&
    typeof v.packUnit === 'string' &&
    typeof v.sourceUrl === 'string'
  );
}

/**
 * Listens for a KHKM_CATALOG_CAPTURE message posted into the page by the
 * catalogue-capture Chrome extension's relay content script, and resolves
 * whether the captured product already exists in the catalogue.
 */
export function useCatalogCapture() {
  const [state, setState] = useState<CaptureState | null>(null);
  const { data: existingProducts = [] } = useSupplierProducts();

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== MESSAGE_TYPE) return;
      if (!isCapturedProduct(event.data.payload)) return;

      const captured = event.data.payload as CapturedProduct;
      setState({
        captured,
        existingMatch: findExistingMatch(captured, existingProducts)
      });
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [existingProducts]);

  return { state, clear: () => setState(null) };
}
```

- [ ] **Step 2: Verify the app still builds**

Run: `npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCatalogCapture.ts
git commit -m "feat: add window-message listener hook for catalogue capture"
```

---

### Task 6: `CatalogCaptureModal` component

The review/edit modal shown when a capture message arrives. Manager-gated, prefilled from the capture, editable, shows "Add to Catalogue" or "Update Price" depending on whether `useCatalogCapture` found an existing match.

**Files:**
- Create: `src/components/CatalogCaptureModal.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Implement the modal**

Create `src/components/CatalogCaptureModal.tsx`:
```tsx
import React, { useEffect, useState } from 'react';
import { X, ExternalLink } from 'lucide-react';
import { useCatalogCapture } from '../hooks/useCatalogCapture';
import { useSupplierProductMutations } from '../hooks/useKitchenData';
import { useAuth } from '../hooks/useAuth';
import { useStore } from '../store/useStore';
import type { SupplierProduct } from '../types';

const PACK_UNITS: SupplierProduct['packUnit'][] = ['g', 'ml', 'ea', 'kg', 'l', 'oz'];

export const CatalogCaptureModal: React.FC = () => {
  const { appUser } = useAuth();
  const isManager = appUser?.role === 'manager';
  const { state, clear } = useCatalogCapture();
  const { addSupplierProduct, updateSupplierProduct } = useSupplierProductMutations();
  const showToast = useStore((s) => s.showToast);

  const [name, setName] = useState('');
  const [packCost, setPackCost] = useState(0);
  const [packSize, setPackSize] = useState(0);
  const [packUnit, setPackUnit] = useState<SupplierProduct['packUnit']>('ea');
  const [productCode, setProductCode] = useState('');

  useEffect(() => {
    if (!state) return;
    setName(state.captured.name);
    setPackCost(state.captured.packCost);
    setPackSize(state.captured.packSize);
    setPackUnit(state.captured.packUnit);
    setProductCode(state.captured.productCode ?? '');
  }, [state]);

  if (!state || !isManager) return null;

  const { captured, existingMatch } = state;
  const isUpdate = existingMatch !== null;
  const codeFieldName =
    captured.supplier === 'Booker' ? 'bookerProductCode' : captured.supplier === 'Urban' ? 'urbanProductId' : null;

  const handleSave = async () => {
    try {
      const unitPrice = packSize > 0 ? packCost / packSize : 0;
      if (isUpdate && existingMatch) {
        await updateSupplierProduct.mutateAsync({
          id: existingMatch.id,
          data: { name, packCost, packSize, packUnit, unitPrice }
        });
        showToast(`Updated "${name}" to £${packCost.toFixed(2)}.`, 'success');
      } else {
        const newProduct: Omit<SupplierProduct, 'id'> = {
          name,
          supplier: captured.supplier,
          packCost,
          packSize,
          packUnit,
          unitPrice,
          source: 'chrome-extension',
          capturedAt: new Date().toISOString(),
          ...(codeFieldName && productCode ? { [codeFieldName]: productCode } : {})
        };
        await addSupplierProduct.mutateAsync(newProduct);
        showToast(`Added "${name}" to the catalogue.`, 'success');
      }
      clear();
    } catch (err: any) {
      showToast('Error saving catalogue item: ' + err.message, 'error');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-surface border border-outline-variant rounded-sm w-full max-w-md p-6 relative">
        <button
          onClick={clear}
          className="absolute top-3 right-3 text-outline hover:text-on-surface"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <span className="text-xs font-mono font-bold text-primary uppercase tracking-wider block mb-2">
          Catalogue Capture
        </span>

        {isUpdate && existingMatch && (
          <div className="text-xs bg-amber-500/10 border border-amber-500/25 text-amber-800 px-3 py-2 rounded-sm mb-3">
            Already in catalogue at £{existingMatch.packCost.toFixed(2)} — update to £{packCost.toFixed(2)}?
          </div>
        )}

        <div className="text-[10px] text-outline mb-3 flex items-center gap-1">
          <span className="font-bold">{captured.supplier}</span>
          <span>&middot;</span>
          <a
            href={captured.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-primary"
          >
            Source <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="text-[10px] label-caps text-outline block mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-2 py-1.5 border border-outline text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] label-caps text-outline block mb-1">Pack Cost (£)</label>
              <input
                type="number"
                step="0.01"
                value={packCost}
                onChange={(e) => setPackCost(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 border border-outline text-sm data-tabular"
              />
            </div>
            <div>
              <label className="text-[10px] label-caps text-outline block mb-1">Product Code</label>
              <input
                type="text"
                value={productCode}
                onChange={(e) => setProductCode(e.target.value)}
                disabled={!codeFieldName}
                className="w-full px-2 py-1.5 border border-outline text-sm disabled:opacity-50"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] label-caps text-outline block mb-1">Pack Size</label>
              <input
                type="number"
                value={packSize}
                onChange={(e) => setPackSize(parseFloat(e.target.value) || 0)}
                className="w-full px-2 py-1.5 border border-outline text-sm data-tabular"
              />
            </div>
            <div>
              <label className="text-[10px] label-caps text-outline block mb-1">Size Unit</label>
              <select
                value={packUnit}
                onChange={(e) => setPackUnit(e.target.value as SupplierProduct['packUnit'])}
                className="w-full px-2 py-1.5 border border-outline bg-surface-container-lowest text-sm"
              >
                {PACK_UNITS.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-4">
          <button
            onClick={clear}
            className="h-8 px-3 border border-outline text-[10px] label-caps font-bold rounded-sm bg-transparent text-outline hover:text-on-surface hover:border-on-surface"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="h-8 px-4 bg-primary text-white text-[10px] label-caps font-bold rounded-sm hover:opacity-90"
          >
            {isUpdate ? 'Update Price' : 'Add to Catalogue'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CatalogCaptureModal;
```

- [ ] **Step 2: Mount the modal globally in `App.tsx`**

In `src/App.tsx`, add the import near the other component imports (after the `TempCheckRecords` import at line 41):
```ts
import CatalogCaptureModal from './components/CatalogCaptureModal';
```

Then find where the top-level JSX returns its outermost wrapping element (look for the toast-rendering block using `toasts.map` near the end of the component's return statement) and add `<CatalogCaptureModal />` as a sibling so it renders regardless of `currentView`:
```tsx
<CatalogCaptureModal />
```
Place it directly before the closing tag of the outermost wrapping `<div>` in the return statement, alongside the toast container.

- [ ] **Step 3: Verify the app still builds**

Run: `npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Manual verification (no extension yet — simulate the message by hand)**

With the dev server running (`npm run dev`) and the Firestore emulator running, open `http://localhost:3000` as a manager, open devtools console, and run:
```js
window.postMessage({
  type: 'KHKM_CATALOG_CAPTURE',
  payload: {
    supplier: 'Booker',
    name: 'Test Captured Product',
    packCost: 9.99,
    packSize: 1,
    packUnit: 'ea',
    productCode: '999999',
    sourceUrl: 'https://www.booker.co.uk/products/product?Code=999999'
  }
}, window.location.origin);
```
Expected: the Catalogue Capture modal appears, prefilled with "Test Captured Product" / £9.99 / 1 ea. Click "Add to Catalogue" and confirm a success toast appears and the item shows up on the Catalog page.

- [ ] **Step 5: Commit**

```bash
git add src/components/CatalogCaptureModal.tsx src/App.tsx
git commit -m "feat: add catalogue capture review modal, mount globally"
```

---

### Task 7: Extension scaffold — manifest + relay content script

Sets up the extension's folder, manifest, and the relay script that bridges extension messages into the KHKM app page.

**Files:**
- Create: `extension/manifest.json`
- Create: `extension/content-scripts/relay.js`
- Create: `extension/README.md`

- [ ] **Step 1: Create the manifest**

Create `extension/manifest.json`:
```json
{
  "manifest_version": 3,
  "name": "KHKM Catalogue Capture",
  "version": "1.0.0",
  "description": "Capture a supplier product's details into the King's Head Manager catalogue.",
  "permissions": ["tabs", "scripting"],
  "host_permissions": [
    "https://www.booker.co.uk/*",
    "https://app.fresho.com/*",
    "https://shop.urbanfoodservice.co.uk/*",
    "http://localhost:3000/*"
  ],
  "action": {
    "default_popup": "popup.html"
  },
  "content_scripts": [
    {
      "matches": ["https://www.booker.co.uk/products/product*"],
      "js": ["content-scripts/booker.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://app.fresho.com/marketplace/products*"],
      "js": ["content-scripts/fresho.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["https://shop.urbanfoodservice.co.uk/*"],
      "js": ["content-scripts/urban.js"],
      "run_at": "document_idle"
    },
    {
      "matches": ["http://localhost:3000/*"],
      "js": ["content-scripts/relay.js"],
      "run_at": "document_idle"
    }
  ]
}
```
Note: the production Firebase Hosting URL is deliberately left out of `host_permissions` and the relay's `matches` for now — Task 10 covers adding it once you confirm the exact hosting URL, so this extension only ever talks to your local dev app until you're ready.

- [ ] **Step 2: Create the relay content script**

Create `extension/content-scripts/relay.js`:
```js
// Runs on the KHKM app page. Its only job: receive a message from the
// extension's popup/background and post it into the page's own window so
// the React app's message listener (useCatalogCapture) can pick it up.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'KHKM_RELAY_CAPTURE') return;

  window.postMessage(
    { type: 'KHKM_CATALOG_CAPTURE', payload: message.payload },
    window.location.origin
  );
  sendResponse({ relayed: true });
});
```

- [ ] **Step 3: Create the extension README**

Create `extension/README.md`:
```markdown
# KHKM Catalogue Capture

Chrome extension for capturing a single supplier product's details into the
King's Head Manager catalogue.

## Loading it (unpacked, for development)

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select this `extension/` folder
4. Pin the extension icon to the toolbar for easy access

## How to use

1. Open the KHKM app in one tab (`http://localhost:3000` in dev)
2. Navigate to a single product page on a supported supplier site:
   - Booker: a product detail page (`booker.co.uk/products/product?Code=...`)
   - David Catt: search Fresho for an exact product name so exactly one
     result card is showing
   - Urban Foodservice: a product detail page
     (`shop.urbanfoodservice.co.uk/#/products/detail/...`)
3. Click the extension icon, then "Scrape this page"
4. Check the preview, then "Send to KHKM"
5. Switch to the KHKM tab — a review modal opens, prefilled. Edit anything
   that looks wrong, then Save.

## Supported sites

- Booker (`booker.co.uk`)
- David Catt / Fresho (`app.fresho.com`)
- Urban Foodservice (`shop.urbanfoodservice.co.uk`)
```

- [ ] **Step 4: Commit**

```bash
git add extension/manifest.json extension/content-scripts/relay.js extension/README.md
git commit -m "feat: scaffold catalogue capture extension (manifest + relay)"
```

---

### Task 8: Booker content script + popup

The first working end-to-end path: Booker is a static server-rendered page, no timing issues, so it's the simplest to get right first and validates the whole popup → relay → app flow before tackling the trickier SPA (Urban).

**Files:**
- Create: `extension/content-scripts/booker.js`
- Create: `extension/popup.html`
- Create: `extension/popup.js`

- [ ] **Step 1: Create the Booker extractor**

Create `extension/content-scripts/booker.js`:
```js
// Runs on a Booker product page. Exposes a scrape function the popup can
// invoke via chrome.scripting.executeScript.
function khkmScrapeBooker() {
  const url = new URL(window.location.href);
  const productCode = url.searchParams.get('Code');

  const nameEl = document.querySelector('h1');
  const name = nameEl ? nameEl.textContent.trim() : null;

  const bodyText = document.body.innerText;
  const priceMatch = bodyText.match(/£\s*(\d+\.\d{2})/);
  const packCost = priceMatch ? parseFloat(priceMatch[1]) : null;

  const packSizeMatch = bodyText.match(/Pack size\s*\n?\s*([^\n]+)/i);
  const packSizeText = packSizeMatch ? packSizeMatch[1].trim() : null;

  if (!name || packCost === null || !productCode) {
    return null;
  }

  return {
    supplier: 'Booker',
    name,
    packCost,
    packSizeText,
    productCode,
    sourceUrl: window.location.href
  };
}

window.khkmScrapeBooker = khkmScrapeBooker;
```

- [ ] **Step 2: Create the popup HTML**

Create `extension/popup.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, sans-serif; width: 280px; padding: 12px; font-size: 13px; }
    button { width: 100%; padding: 8px; margin-top: 8px; cursor: pointer; }
    #preview { margin-top: 10px; padding: 8px; background: #f3f3f3; border-radius: 4px; display: none; }
    #preview.visible { display: block; }
    #status { margin-top: 8px; color: #666; }
    .error { color: #b5473a; }
  </style>
</head>
<body>
  <button id="scrapeBtn">Scrape this page</button>
  <div id="preview"></div>
  <button id="sendBtn" style="display:none;">Send to KHKM</button>
  <div id="status"></div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 3: Create the popup script**

Create `extension/popup.js`:
```js
const KHKM_APP_URL_PATTERN = 'http://localhost:3000/*';

let currentScrape = null;

const scrapeBtn = document.getElementById('scrapeBtn');
const sendBtn = document.getElementById('sendBtn');
const preview = document.getElementById('preview');
const status = document.getElementById('status');

function normalizePackFromText(packSizeText) {
  // Minimal inline mirror of src/utils/packParser.ts's simplest cases, kept
  // deliberately small here since the extension has no build step to share
  // code with the app. If this can't confidently parse, size/unit are left
  // for the user to fill in inside the KHKM review modal.
  if (!packSizeText) return { packSize: 1, packUnit: 'ea' };
  const caseMatch = packSizeText.match(/case of (\d+)/i);
  if (caseMatch) return { packSize: parseInt(caseMatch[1], 10), packUnit: 'ea' };
  const bareMatch = packSizeText.match(/(\d+(?:\.\d+)?)\s*(ml|l|kg|g|oz)/i);
  if (bareMatch) return { packSize: parseFloat(bareMatch[1]), packUnit: bareMatch[2].toLowerCase() };
  return { packSize: 1, packUnit: 'ea' };
}

scrapeBtn.addEventListener('click', async () => {
  status.textContent = '';
  status.className = '';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (window.khkmScrapeBooker ? window.khkmScrapeBooker() : null)
  });

  const raw = results && results[0] ? results[0].result : null;
  if (!raw) {
    status.textContent = "Couldn't read this page — make sure you're on a product page and try again.";
    status.className = 'error';
    preview.classList.remove('visible');
    sendBtn.style.display = 'none';
    return;
  }

  const { packSize, packUnit } = normalizePackFromText(raw.packSizeText);
  currentScrape = {
    supplier: raw.supplier,
    name: raw.name,
    packCost: raw.packCost,
    packSize,
    packUnit,
    productCode: raw.productCode,
    sourceUrl: raw.sourceUrl
  };

  preview.textContent = `${currentScrape.name} — £${currentScrape.packCost.toFixed(2)} (${currentScrape.packSize}${currentScrape.packUnit})`;
  preview.classList.add('visible');
  sendBtn.style.display = 'block';
});

sendBtn.addEventListener('click', async () => {
  if (!currentScrape) return;
  const tabs = await chrome.tabs.query({ url: KHKM_APP_URL_PATTERN });

  if (tabs.length === 0) {
    status.textContent = 'KHKM app is not open. Opening it now — click "Send to KHKM" again once it loads.';
    status.className = 'error';
    chrome.tabs.create({ url: 'http://localhost:3000' });
    return;
  }

  await chrome.tabs.sendMessage(tabs[0].id, { type: 'KHKM_RELAY_CAPTURE', payload: currentScrape });
  await chrome.tabs.update(tabs[0].id, { active: true });
  status.textContent = 'Sent — check the KHKM tab.';
  status.className = '';
});
```

- [ ] **Step 4: Load the extension and test manually against a real Booker product**

1. Run: `npm run dev` (KHKM app) and `npx firebase emulators:start --only firestore` (in another terminal)
2. Load the extension per `extension/README.md`
3. Open a real Booker product page, e.g. `https://www.booker.co.uk/products/product?Code=153093`
4. Click the extension icon → "Scrape this page"

Expected: preview shows the real product name and price, "Send to KHKM" button appears.

5. Click "Send to KHKM", switch to the KHKM tab

Expected: the Catalogue Capture modal opens prefilled with the scraped Booker product. Save it and confirm it appears in the Catalog page.

- [ ] **Step 5: Commit**

```bash
git add extension/content-scripts/booker.js extension/popup.html extension/popup.js
git commit -m "feat: add Booker content script and extension popup"
```

---

### Task 9: Fresho (David Catt) content script

**Files:**
- Create: `extension/content-scripts/fresho.js`
- Modify: `extension/popup.js`

- [ ] **Step 1: Create the Fresho extractor**

Create `extension/content-scripts/fresho.js`:
```js
// Runs on a Fresho marketplace search page. Assumes the user has searched
// for an exact product name so exactly one result card is visible — Fresho
// has no stable per-product deep link, unlike Booker/Urban.
function khkmScrapeFresho() {
  const card = document.querySelector('[class*="product"]');
  if (!card) return null;

  const nameEl = card.querySelector('h1, h2, h3, [class*="title"], [class*="name"]');
  const name = nameEl ? nameEl.textContent.trim() : null;

  const cardText = card.innerText;
  const priceMatch = cardText.match(/£\s*(\d+\.\d{2})/);
  const packCost = priceMatch ? parseFloat(priceMatch[1]) : null;

  if (!name || packCost === null) return null;

  const packSizeMatch = cardText.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
  const packSizeText = packSizeMatch ? packSizeMatch[0] : null;

  return {
    supplier: 'David Catt',
    name,
    packCost,
    packSizeText,
    productCode: null,
    sourceUrl: window.location.href
  };
}

window.khkmScrapeFresho = khkmScrapeFresho;
```

- [ ] **Step 2: Wire it into the popup**

In `extension/popup.js`, replace the hardcoded `window.khkmScrapeBooker` call with a lookup based on the active tab's URL. Replace this block:
```js
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (window.khkmScrapeBooker ? window.khkmScrapeBooker() : null)
  });
```
with:
```js
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      if (window.khkmScrapeBooker) return window.khkmScrapeBooker();
      if (window.khkmScrapeFresho) return window.khkmScrapeFresho();
      if (window.khkmScrapeUrban) return window.khkmScrapeUrban();
      return null;
    }
  });
```
(This references `window.khkmScrapeUrban`, added in Task 10 — harmless to reference now since the `if` just won't match until that function exists.)

Also update `manifest.json`'s Fresho entry is already correct from Task 7 — no manifest change needed here.

- [ ] **Step 3: Manual test against a real Fresho search**

1. With the extension reloaded (`chrome://extensions` → refresh icon on the extension card)
2. Open Fresho, search for one exact product name so one result card shows
3. Click the extension icon → "Scrape this page" → verify preview shows correct name/price
4. Send to KHKM, verify the modal opens with `supplier: "David Catt"` and no product code field enabled (since David Catt has no stable code — the Product Code input should be disabled, matching the modal's `codeFieldName` logic from Task 6)

Expected: modal opens correctly, "Product Code" field is disabled/blank, Save creates the item with `supplier: 'David Catt'`.

- [ ] **Step 4: Commit**

```bash
git add extension/content-scripts/fresho.js extension/popup.js
git commit -m "feat: add Fresho/David Catt content script"
```

---

### Task 10: Urban Foodservice content script (SPA, needs to wait for render)

The trickiest of the three — Urban's Angular SPA renders the product detail client-side after the route loads, so the content script has to wait for the price to actually appear rather than reading immediately on `document_idle`.

**Files:**
- Create: `extension/content-scripts/urban.js`

- [ ] **Step 1: Create the Urban extractor with a render-wait**

Create `extension/content-scripts/urban.js`:
```js
// Runs on an Urban Foodservice product detail page. The Angular SPA renders
// content client-side after the hash route loads, so this waits (via
// MutationObserver, capped at 5s) for a price to actually appear before
// reading the page, rather than assuming it's ready immediately.
function khkmScrapeUrban() {
  return new Promise((resolve) => {
    const idMatch = window.location.hash.match(/\/products\/detail\/(\d+)/);
    const productCode = idMatch ? idMatch[1] : null;

    function tryExtract() {
      const bodyText = document.body.innerText;
      const priceMatch = bodyText.match(/£\s*(\d+\.\d{2})/);
      if (!priceMatch) return null;

      const nameEl = document.querySelector('h1, h2, [class*="product-name"], [class*="title"]');
      const name = nameEl ? nameEl.textContent.trim() : null;
      if (!name) return null;

      const packSizeMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
      const packSizeText = packSizeMatch ? packSizeMatch[0] : null;

      return {
        supplier: 'Urban',
        name,
        packCost: parseFloat(priceMatch[1]),
        packSizeText,
        productCode,
        sourceUrl: window.location.href
      };
    }

    const immediate = tryExtract();
    if (immediate) {
      resolve(immediate);
      return;
    }

    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 5000);

    const observer = new MutationObserver(() => {
      const result = tryExtract();
      if (result) {
        clearTimeout(timeout);
        observer.disconnect();
        resolve(result);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

window.khkmScrapeUrban = khkmScrapeUrban;
```

- [ ] **Step 2: Update the popup to handle the async Urban scrape**

`chrome.scripting.executeScript`'s injected `func` already supports returning a Promise (Chrome resolves it before returning the result), so `extension/popup.js` from Task 9 needs no further change — the same `results[0].result` line works whether the scrape function is sync (Booker/Fresho) or async (Urban), since `chrome.scripting.executeScript` awaits the returned promise itself.

- [ ] **Step 3: Manual test against a real Urban product**

1. Reload the extension in `chrome://extensions`
2. Log into `shop.urbanfoodservice.co.uk` and navigate to a real product detail page (`.../#/products/detail/<id>`)
3. Click the extension icon → "Scrape this page"

Expected: after a brief pause (SPA render), preview shows the correct name/price. If it times out, check the Urban page structure — the `nameEl` selector in `urban.js` may need adjusting to match the actual DOM (Urban's Angular app markup can't be predicted with full confidence without inspecting it live).

4. Send to KHKM, confirm the modal opens with `supplier: "Urban"` and the Product Code field prefilled with the ID from the URL.

- [ ] **Step 4: Commit**

```bash
git add extension/content-scripts/urban.js
git commit -m "feat: add Urban Foodservice content script with render-wait"
```

---

### Task 11: End-to-end verification and production hosting URL

Final pass: confirm all three sites work end-to-end in one sitting, then add the production Firebase Hosting URL to the manifest now that everything's proven against dev/emulator.

**Files:**
- Modify: `extension/manifest.json`

- [ ] **Step 1: Find your production Firebase Hosting URL**

This is the live URL from `KHKM_v4_status_2026-07-12-evening.md`: `https://kings-head-kitchen-claude.web.app`

- [ ] **Step 2: Add it to the manifest**

In `extension/manifest.json`, add the hosting URL to both `host_permissions` and the relay content script's `matches`:
```json
  "host_permissions": [
    "https://www.booker.co.uk/*",
    "https://app.fresho.com/*",
    "https://shop.urbanfoodservice.co.uk/*",
    "http://localhost:3000/*",
    "https://kings-head-kitchen-claude.web.app/*"
  ],
```
and:
```json
    {
      "matches": ["http://localhost:3000/*", "https://kings-head-kitchen-claude.web.app/*"],
      "js": ["content-scripts/relay.js"],
      "run_at": "document_idle"
    }
```

Also update `extension/popup.js`'s tab lookup to check both URLs — replace:
```js
const KHKM_APP_URL_PATTERN = 'http://localhost:3000/*';
```
with:
```js
const KHKM_APP_URL_PATTERNS = ['http://localhost:3000/*', 'https://kings-head-kitchen-claude.web.app/*'];
```
and update the one place it's used:
```js
  const tabs = await chrome.tabs.query({ url: KHKM_APP_URL_PATTERN });
```
to:
```js
  const tabsPerPattern = await Promise.all(
    KHKM_APP_URL_PATTERNS.map((pattern) => chrome.tabs.query({ url: pattern }))
  );
  const tabs = tabsPerPattern.flat();
```

- [ ] **Step 3: Reload the extension and run through all three sites once more**

Reload in `chrome://extensions`, then repeat the manual test steps from Tasks 8, 9, and 10 once each — this confirms nothing broke from the manifest/popup edits in Step 2, and that the extension now works against both the dev app and the live production app.

- [ ] **Step 4: Run the full automated test suite one last time**

Run: `npm test`
Expected: all tests (from Tasks 1–3) still pass.

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add extension/manifest.json extension/popup.js
git commit -m "feat: support production hosting URL for catalogue capture extension"
```

---

## Summary of what this plan does NOT cover (explicitly out of scope, per spec)

- Bulk/multi-product capture in one action
- Auto-save without the review modal
- Publishing the extension to the Chrome Web Store (stays "load unpacked" for personal use)
