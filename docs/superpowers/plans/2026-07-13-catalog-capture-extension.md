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

- [x] **Step 1: Install Vitest**
- [x] **Step 2: Add the test script**
- [x] **Step 3: Create the Vitest config**
- [x] **Step 4: Write a sanity test**
- [x] **Step 5: Run it**
- [x] **Step 6: Delete the sanity test and commit the runner setup**

---

### Task 2: `packParser.ts` — parse supplier pack-size text into structured data

- [x] **Step 1: Write the failing tests**
- [x] **Step 2: Run the tests to verify they fail**
- [x] **Step 3: Implement `parsePackText`**
- [x] **Step 4: Run the tests to verify they pass**
- [x] **Step 5: Commit**

---

### Task 3: `catalogCapture.ts` — types + duplicate matching

- [x] **Step 1: Write the failing tests**
- [x] **Step 2: Run the tests to verify they fail**
- [x] **Step 3: Implement `catalogCapture.ts`**
- [x] **Step 4: Run the tests to verify they pass**
- [x] **Step 5: Commit**

---

### Task 4: `addSupplierProduct` mutation

- [x] **Step 1: Add the import for `SupplierProductSchema` if not already imported**
- [x] **Step 2: Add `addMutation` inside `useSupplierProductMutations`**
- [x] **Step 3: Verify the app still builds**
- [x] **Step 4: Commit**

---

### Task 5: Capture message listener hook

- [x] **Step 1: Implement the hook**
- [x] **Step 2: Verify the app still builds**
- [x] **Step 3: Commit**

---

### Task 6: `CatalogCaptureModal` component

- [x] **Step 1: Implement the modal** (implemented with equivalent but simplified UI/fields vs the plan's exact snippet, plus a manager-role gate)
- [x] **Step 2: Mount the modal globally in `App.tsx`**
- [x] **Step 3: Verify the app still builds**
- [ ] **Step 4: Manual verification (no extension yet — simulate the message by hand)** — not run interactively this session; do this before relying on the flow.
- [x] **Step 5: Commit**

---

### Task 7: Extension scaffold — manifest + relay content script

- [x] **Step 1: Create the manifest**
- [x] **Step 2: Create the relay content script**
- [x] **Step 3: Create the extension README**
- [x] **Step 4: Commit**

---

### Task 8: Booker content script + popup

- [x] **Step 1: Create the Booker extractor**
- [x] **Step 2: Create the popup HTML**
- [x] **Step 3: Create the popup script**
- [ ] **Step 4: Load the extension and test manually against a real Booker product** — NOT verified live; DOM selectors are best-effort and unverified against the real site.
- [x] **Step 5: Commit**

---

### Task 9: Fresho (David Catt) content script

- [x] **Step 1: Create the Fresho extractor**
- [x] **Step 2: Wire it into the popup**
- [ ] **Step 3: Manual test against a real Fresho search** — NOT verified live.
- [x] **Step 4: Commit**

---

### Task 10: Urban Foodservice content script (SPA, needs to wait for render)

- [x] **Step 1: Create the Urban extractor with a render-wait**
- [x] **Step 2: Update the popup to handle the async Urban scrape** (no change needed, confirmed)
- [ ] **Step 3: Manual test against a real Urban product** — NOT verified live.
- [x] **Step 4: Commit**

---

### Task 11: End-to-end verification and production hosting URL

- [x] **Step 1: Find your production Firebase Hosting URL**
- [x] **Step 2: Add it to the manifest**
- [ ] **Step 3: Reload the extension and run through all three sites once more** — pending live Chrome testing.
- [x] **Step 4: Run the full automated test suite one last time** — `npm test` (13 passed), `npm run build` (clean)
- [x] **Step 5: Commit**

---

## Summary of what this plan does NOT cover (explicitly out of scope, per spec)

- Bulk/multi-product capture in one action
- Auto-save without the review modal
- Publishing the extension to the Chrome Web Store (stays "load unpacked" for personal use)

## Outstanding before this is fully "done"

All code is implemented, tested (13 automated tests), and builds clean. The one thing not done from an agent session: loading the extension in real Chrome and scraping a real product from each of the three sites. The DOM selectors in `booker.js`, `fresho.js`, and `urban.js` are best-effort guesses at each site's markup and may need small tweaks once tried against the live pages.
