# REBUILD MASTER: KITCHEN MANAGER STATUS REPORT
**Snapshot Date:** 2024-05-24
**System Version:** 1.1.0 // "Brutalist Gold"

## 1. CORE DESIGN SPECIFICATIONS (NO DRIFT ZONE)
To maintain visual integrity, all future updates MUST adhere to these constraints:

*   **Palette:**
    *   `BG_PRIMARY`: #111111 (Deep Black)
    *   `SURFACE`: #1C1C1C (Dark Grey)
    *   `ACCENT`: #C8A96E (Gold/Brass)
    *   `BORDER`: #333333 / #404040 (Strict 1px solid)
    *   `TEXT_MUTED`: #666666 / #888888
*   **Typography:**
    *   `Labels`: IBM Plex Sans, Bold, Uppercase, Tracking [0.2em - 0.4em], Size 9-10px.
    *   `Data`: IBM Plex Mono, Size 11-12px.
    *   `Headers`: Uppercase, tracking intensive.
*   **Layout Philosophy:**
    *   High-density data grids.
    *   0px border-radius (Square everything).
    *   Visible grid lines (Divide-x/y).
    *   Recursive overlays for sub-tasks.

## 2. FUNCTIONAL ACHIEVEMENTS
*   **Dashboard (Mission Control):** Inventory concentration analysis (Cost vs Stock) with interactive V-Bar charting.
*   **Ingredient Registry:** Master CRUD for ingredients with automatic financial coefficient calculations and allergen mapping.
*   **Recipe Builder:** Standardized formulation workspace with real-time cost tracking and batch unit scaling.
*   **OCR Core (Analyst Engine):** 
    *   Multi-stage extraction (Items + Method).
    *   Editable staging grid (Name, Qty, Unit correction).
    *   Intelligent ingredient matching (Select Box integration).
    *   Inline "Create Missing" registry hooks.
    *   Visual progress telemetry (Scanner Bar).
*   **Service Module:** Dish development with target GP (Gross Profit) calculations and recursive recipe nesting.

## 3. COMPONENT ARCHITECTURE
*   `App.tsx`: Central state orchestration and recursive stack management.
*   `useRecursiveBuilder.ts`: Handles the "Depth" of creation (e.g., building a recipe inside a dish).
*   `useKitchenData.ts`: Real-time Firebase Firestore synchronization.
*   `OCRScanner.tsx`: AI-driven data extraction using Gemini-3-Flash.

## 4. NEXT PHASE TARGETS
*   **Sub-Recipe Nesting:** Enhancing recursive cost calculation in the Dish Builder.
*   **Allergen Aggregation:** Rolling up allergen risks from ingredients to dishes automatically.
*   **Stock Movements:** Implementing waste logging and depletion via service logs.
*   **PDF Export:** Generating "Chef Ready" recipe cards with standard formatting.

## 5. SYSTEM LOG
*   [OK] OCR Staging V10 Deployed.
*   [OK] Method/Instruction extraction active.
*   [OK] Progress Telemetry integrated.
*   [OK] Style Lock: Brutalist/1px.

---
**END OF REPORT // SESSION TERMINATED**
