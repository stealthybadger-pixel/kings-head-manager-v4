# King's Head Manager v4 - Assistant Rules & Context

Welcome! This file provides the essential context, rules, and history of recent sessions for any AI assistant working on this codebase. It is saved in the synced Google Drive folder to preserve session continuity across different computers (e.g. work and home).

---

## 1. Project Overview & Tech Stack
* **Project Name:** King's Head Manager (v4)
* **Path:** `kings-head-manager-v4`
* **Stack:** React, Vite, TypeScript, Tailwind CSS, Zustand (state management), TanStack Query, Firestore.
* **Database:** Firestore project `kings-head-kitchen-claude`.
  * Collections: `ingredients`, `recipes`, `dishes`, `supplierProducts`, `container_profiles`.

---

## 2. Key Architecture & Coding Constraints
* **Firestore Updates:** Firestore updates must not contain `undefined` properties. Payload variables must be sanitized to prevent overwrites or undefined write errors.
* **Unit Normalization:** Supplier rates and ingredient costs must always be normalized to standard base units (e.g. `g` vs `kg`, `ml` vs `l`) during calculations to prevent pricing errors:
  * Weight-based normalized rate: `£/kg` (multiply grams per-unit by 1000).
  * Volume-based normalized rate: `£/l` (multiply ml per-unit by 1000).
  * Piece-based normalized rate: `£/ea`.
* **Dynamic Sizing:** Recipes dynamically compute batch size from the sum of ingredient weights/volumes.

---

## 3. Session Progress Log (June 2026)
We completed the following tasks:
1. **Dynamic Batch Sizes:** Implemented dynamic calculation of recipe batch sizes inside `Kitchen.tsx` based on total ingredient weight/volume.
2. **Deep-Linked Catalog Alerts:** In `Pantry.tsx`, converted the "Cheaper Catalog Option Available" alert's static product name to a button that navigates directly to the Supplier Catalog search pre-filtered with that item.
3. **Flexible Supplier Linking:** Added an "Add as Supplier Option" button in `Catalog.tsx` to let users link a catalog product to an ingredient as an optional alternative (setting `isPreferred: false`) without disrupting the preferred supplier.
4. **Unit Rate Reference:** Added a dynamic "Unit Rate" column to the Pantry page's supplier package options to display normalized rates (e.g., `£/kg`, `£/l`, `£/ea`).
5. **Manual Catalog Editing:** Created `useSupplierProductMutations` and added an edit form inside the Supplier Catalog detail pane, allowing manual updates to incorrect scraped product data (name, wholesaler, packCost, packSize, unit) in Firestore.

---

## 4. Active To-Dos & Next Steps
* **Test Local Flow:** When working from home, verify that the local Vite development server runs smoothly on port `3000` via `npm run dev`.
* **Stock & Sunday Stock-take:** Double check value bindings in the Stock page to ensure manual stock adjustments write correctly to Firestore.
