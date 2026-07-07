# King's Head Manager v4 — Help & Glossary

Welcome to the King's Head Manager! This guide is designed to explain all the terms, metrics, and workflows used in the app in plain English. 

---

## 1. Core Concepts & Terms

### 📦 The Pantry (Master Ingredients)
The **Pantry** is your master database of ingredients. Think of this as the "Source of Truth" for everything you use in the kitchen. 
* **What it does**: Each ingredient in the Pantry has a name, category, allergens list, calories (kcal per 100g), and waste percentage.
* **Why it matters**: Recipes and dishes don't link directly to supplier products; instead, they link to **Master Ingredients** in the Pantry. This allows you to swap suppliers or update prices without having to rewrite your recipes.

### 📖 Supplier Catalog
The **Supplier Catalog** is the database of real items you can buy from your suppliers (like David Catt, Booker, etc.).
* **What it does**: It lists the supplier's product name, pack cost, pack size, and pack unit (e.g. £10.50 for a 5kg box).
* **Link to Pantry**: You map catalog items to your master Pantry ingredients (e.g., mapping David Catt's "Maris Piper Potatoes 10kg" to the master pantry ingredient "Potatoes - Maris Piper").

### 🌟 Preferred Supplier / Preferred Product
For every master ingredient, you can map multiple supplier products, but you must select one as the **Preferred Supplier**.
* **Why it matters**: The app uses the preferred supplier's price to calculate the cost of your recipes and dishes. If the supplier changes their prices, the app instantly recalculates all costs and profit margins.

### ⚖️ Piece Weight (grams per each/bunch)
This is the estimated weight in grams of a single piece, cucumber, or bunch of herbs.
* **Why it matters**: Suppliers often sell items by the piece (unit: `ea`), like "1 Cucumber" or "1 Bunch of Thyme". However, chefs measure ingredients in recipes by weight (unit: `g`), like "75g of cucumber" or "20g of thyme". 
* **How it works**: By entering a **Piece Weight** (e.g., 400g for a cucumber, 50g for thyme), the app can mathematically convert piece costs to gram costs. 
* **The Math**: If 1 cucumber (400g) costs £1.00, then 1 gram of cucumber costs `£1.00 / 400 = £0.0025`. Therefore, 75g of cucumber costs `75 * £0.0025 = £0.19`.

### 🗑️ Waste % (Yield Loss)
The percentage of raw ingredient weight lost during preparation (peeling, trimming, de-boning, or discarding stems).
* **Why it matters**: If you buy 1kg of onions but throw away 100g of skins and roots, you only have 900g of usable onion. Your usable onion is actually more expensive per gram because of that waste.
* **How it works**: The app automatically increases the ingredient's cost in recipes to account for waste.
* **The Math**: If onions cost £1.00/kg and have a **10% waste** factor, the effective cost of the usable onion is adjusted to `£1.00 / (1 - 0.10) = £1.11/kg`.

---

## 2. Recipe & Dish Workflows

### 🍳 Kitchen (Batch Formulations / Recipes)
A **Recipe** (or Batch Formulation) is a combination of ingredients prepared in bulk to be used later (e.g., Red Wine Marinade, Peppercorn Sauce, or Beef Jus).
* **Batch Yield**: Recipes are formulated for a specific batch size (e.g., a recipe that yields 5 Liters or 2.5 kg).
* **Sub-Recipes**: You can add recipes *inside* other recipes or dishes (e.g., adding 50ml of your "Red Wine Marinade" recipe to a "Venison Dish" formulation). The app handles all nested cost roll-ups automatically.

### 🍽️ Service (Dish Profiles / Plate Costs)
A **Dish** is a finished menu item sold directly to customers (e.g., "Venison Loin").
* **Plate Cost**: The sum of all ingredient and sub-recipe costs that go on a single plate.
* **Retail Price**: The price you charge customers on the menu (including VAT).
* **Gross Profit (GP) %**: The margin you make on the dish after subtracting the ingredient costs. 
* **Target GP %**: Your business goal margin (typically 70% to 75%). If the plate cost rises and pushes the actual GP below your target, the app highlights the dish in **red** so you know you need to adjust the retail price or find cheaper suppliers.

---

## 3. Stock Management

### 📦 Stock Manager
Where you log deliveries, record waste, and commit inventory counts.
* **Scale Tare**: When weighing inventory on the Bluetooth scale, pressing "Tare" resets the scale reading to `0` with the container sitting on it. This subtracts the weight of the empty tub or tray, so you only record the weight of the actual food.
* **Stock Movements**: Every delivery (adds stock), waste log (subtracts stock), or stock take count creates a stock movement record to audit what enters and leaves the kitchen.

---

## 4. Troubleshooting Auto-Matching Issues

When browsing the **Supplier Catalog**, the app attempts to auto-link products to master ingredients. If a match is incorrect:
1. **Name Descriptors**: The auto-matcher is strict. If the master ingredient contains specific modifiers (like `"Wholemeal"` in `"Flour, Wholemeal, Bread"`), it will **never** auto-link to a generic catalog item like `"Flour, Bread"`. This prevents white bread flour from being linked as wholemeal.
2. **Dense Words**: Short words of 5 characters or less (e.g. `bread`, `pears`, `pork`) do not use fuzzy edit distance matching. This prevents unrelated items (like `"bread"` and `"bream"`, or `"pork"` and `"port"`) from getting linked.
3. **Manual Overrides**: You can always manually link a catalog product to any master ingredient using the **Link** button, which overrides the auto-matcher.
