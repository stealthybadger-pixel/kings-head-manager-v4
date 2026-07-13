# Catalogue Capture Chrome Extension — Design

Date: 2026-07-13

## Problem

Supplier catalogue links (Booker, David Catt/Fresho, Urban Foodservice) now work, so prices can be checked manually. There's no way to quickly add a new product spotted on a supplier's site into `supplierProducts` without a bulk re-scrape — this needs a one-click "capture what I'm looking at" flow.

## Goal

A Chrome extension that, when the user is looking at a specific product on a supported supplier site, extracts that product's details and hands them to the KHKM app (already open in another tab) to review and save as a new (or updated) catalogue entry.

## Non-goals

- Bulk/automated scraping (that's `scripts/reconcile_prices.ts`, a separate tool).
- Working without the KHKM app tab open — this extension is a capture-and-relay tool, not a standalone database client.
- Any credential handling inside the extension. It never talks to Firestore directly.

## Architecture

```
Supplier page (Booker / Fresho / Urban)
   |  (per-site content script scrapes on demand)
   v
Extension popup (preview: name / price / pack, confirm send)
   |  (chrome.tabs message)
   v
Relay content script on the KHKM app tab (matches localhost:3000 and prod hosting URL)
   |  (window.postMessage into the page)
   v
KHKM React app: message listener -> duplicate check against loaded catalogue -> Add/Update modal -> existing Firestore mutation (whatever env the tab is connected to: emulator in dev, prod in prod build)
```

No new backend, no new auth path. The extension only ever produces a plain data object; the app's own already-authenticated Firestore client does the write, exactly the same as every other write in the app today.

## Components

### 1. Extension: manifest & content scripts

Manifest V3, three site-specific content scripts:

- **Booker** (`*://www.booker.co.uk/products/product*`): server-rendered page. Extract:
  - `name`: page title / breadcrumb leaf
  - `packCost`: regex `£\s*(\d+\.\d{2})` on the visible price element
  - `packSize`/`packUnit`: parsed from the "Pack size" text (e.g. "Case of 1", "12 x 330ml")
  - `bookerProductCode`: from the `Code=` URL query param
  - No wait/observer needed — page is static once loaded.

- **David Catt / Fresho** (`*://app.fresho.com/marketplace/products*`): user has already typed an exact-match search producing exactly one result card. Extract:
  - `name`, `packCost`, `packSize`/`packUnit` from that single visible card
  - No stable product code on Fresho — `productCode` left blank, dedupe falls back to name+supplier match (see below)

- **Urban** (`*://shop.urbanfoodservice.co.uk/#/products/detail/*`): Angular SPA, content renders after route load. Extract:
  - `name`, `packCost`, `packSize`/`packUnit` from the detail panel
  - `urbanProductId`: from the URL path segment
  - Requires a `MutationObserver` (or short poll) waiting for the price element to appear before reading, since the SPA renders client-side.

Each extractor returns a common shape:
```ts
{
  supplier: 'Booker' | 'David Catt' | 'Urban',
  name: string,
  packCost: number,
  packSize: number,
  packUnit: string,
  productCode?: string,       // bookerProductCode or urbanProductId
  sourceUrl: string,
}
```
or `null` if required fields couldn't be found.

### 2. Extension: popup

- "Scrape this page" button, calls the active tab's content script.
- On success: shows a compact preview (name, £cost, pack) with a "Send to KHKM" button.
- On failure (`null` result): shows "Couldn't read this page — make sure you're on a product page and try again."
- "Send to KHKM": looks for an open tab matching the app's URLs.
  - Found: sends the payload, shows "Sent — check the KHKM tab."
  - Not found: "KHKM app isn't open" with a button to open it (new tab to the app's known URL, then retry the send once it loads).

### 3. Extension: relay content script (runs on the KHKM app itself)

Matches `localhost:3000/*` and the production Firebase Hosting URL. Its only job: receive a `chrome.runtime` message from the popup/background and `window.postMessage({ type: 'KHKM_CATALOG_CAPTURE', payload }, window.location.origin)` into the page. No DOM access to the app needed.

### 4. App: capture listener + modal

- A `window.addEventListener('message', ...)` listener (mounted once, e.g. in `App.tsx` or a small hook) filters for `type === 'KHKM_CATALOG_CAPTURE'` and `event.origin === window.location.origin`.
- On receipt: check the already-loaded `supplierProducts` (via `useSupplierProducts`) for a match by `productCode` (when present) or, for Fresho items with no code, by normalized name + supplier equality.
- Opens `CatalogCaptureModal`:
  - Read-only: Supplier, Source URL (link)
  - Editable: Name, Pack Cost, Pack Size, Pack Unit, Product Code
  - If a match was found: banner "Already in catalogue at £X — update to £Y?", primary button reads **Update Price**
  - If no match: primary button reads **Add to Catalogue**
  - Manager-gated, same as existing Catalog write actions (`isManager` check)
- Save calls:
  - New case: `addSupplierProduct` (new mutation, see below)
  - Existing case: `updateSupplierProduct` (already exists)

### 5. New mutation: `addSupplierProduct`

`useSupplierProductMutations` currently only has `update` and `delete`. Add `add`, following the same pattern as `useIngredientMutations`'s `addIngredient`:
```ts
const addMutation = useMutation({
  mutationFn: async (data: Omit<SupplierProduct, 'id'>) => {
    await addDoc(collection(db, 'supplierProducts'), data);
  },
  onSuccess: () => { /* invalidate the same query keys updateSupplierProduct already invalidates */ }
});
```

## Data flow summary

1. User searches/navigates to one product on a supported supplier site.
2. Click extension icon → popup scrapes via content script → preview shown.
3. Click "Send to KHKM" → relayed into the open app tab.
4. App shows Add/Update modal, prefilled, user reviews and edits if needed.
5. User clicks Save → existing Firestore mutation runs against whichever environment (emulator/prod) that tab is connected to.

## Error handling

- Extraction failure → popup tells the user, no message sent.
- No open app tab → popup offers to open one.
- Duplicate detected → modal defaults to update-price mode rather than silently creating a second row (this is the exact bug class we just cleaned up 251 instances of).

## Testing

Manual only — one real product per supplier site, confirming the modal receives correct data and both the "Add" and "Update" paths write correctly to the local emulator before ever being tried against production.

## Out of scope for this spec (future work)

- Bulk capture (multiple products in one action) — not requested, YAGNI for now.
- Auto-save without the review modal — rejected during design due to scraping reliability.
