import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { chromium, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

// Initialize Firebase Admin (use local emulator by default, same convention as
// reconcile_prices.ts — set FIRESTORE_EMULATOR_HOST="" to target real prod).
const projectId = 'kings-head-kitchen-claude';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';

initializeApp({ projectId });
const db = getFirestore();

const AUTH_DIR = path.resolve('.auth');
const AUTH_PATHS: Record<string, string> = {
  'Booker': path.join(AUTH_DIR, 'booker.json'),
  'David Catt': path.join(AUTH_DIR, 'fresho.json'),
  'Urban': path.join(AUTH_DIR, 'urban.json'),
};

// Wholesalers with an actual online portal we can scrape. Anything else
// (Cranbrook, Crouch, Glovers, Internal) has no product page to check.
const SCRAPABLE_SUPPLIERS = new Set(Object.keys(AUTH_PATHS));

const RECHECK_WINDOW_HOURS = 48;
const LARGE_SWING_PCT = 50;

type IngredientSupplier = {
  name: string;
  packCost: number;
  packSize: number;
  packUnit: string;
  isPreferred: boolean;
  sourceUrl?: string;
  productName?: string;
  priceUpdatedAt?: string;
  priceLastCheckedAt?: string;
};

type Ingredient = {
  id: string;
  name: string;
  category: string;
  suppliers: IngredientSupplier[];
};

type Recipe = { id: string; items: any[] };
type Dish = { id: string; isLive?: boolean; items: any[] };

type Candidate = {
  ingredient: Ingredient;
  supplierIndex: number;
  supplier: IngredientSupplier;
};

type ReportRow = {
  ingredientName: string;
  supplierName: string;
  oldPrice: number;
  newPrice: number | null;
  changed: boolean;
  pctChange: number | null;
  flag: 'ok' | 'unchanged' | 'large-swing' | 'not-found' | 'error';
};

// Mirrors Stock.tsx's collectIngredientIds — recursively walks recipe items +
// sub-recipes to gather every ingredient in use, cycle-guarded.
function collectIngredientIds(items: any[], allRecipes: Recipe[], visited = new Set<string>()): Set<string> {
  const ids = new Set<string>();
  for (const item of items ?? []) {
    if (item.type === 'ingredient' && item.ingredientId) {
      ids.add(item.ingredientId);
    } else if (item.type === 'recipe' && item.subRecipeId && !visited.has(item.subRecipeId)) {
      visited.add(item.subRecipeId);
      const sub = allRecipes.find(r => r.id === item.subRecipeId);
      if (sub) {
        collectIngredientIds(sub.items, allRecipes, visited).forEach(id => ids.add(id));
      }
    }
  }
  return ids;
}

// Mirrors Stock.tsx's menuIngredientIds memo — live dishes -> recipes -> sub-recipes -> ingredientIds.
function computeMenuIngredientIds(dishes: Dish[], recipes: Recipe[]): Set<string> {
  const ids = new Set<string>();
  for (const dish of dishes.filter(d => d.isLive)) {
    for (const item of dish.items ?? []) {
      if (item.type === 'ingredient' && item.ingredientId) {
        ids.add(item.ingredientId);
      } else if (item.type === 'recipe' && item.subRecipeId) {
        const recipe = recipes.find(r => r.id === item.subRecipeId);
        if (recipe) collectIngredientIds(recipe.items, recipes).forEach(id => ids.add(id));
      }
    }
  }
  return ids;
}

function isRecentlyChecked(supplier: IngredientSupplier): boolean {
  if (!supplier.priceLastCheckedAt) return false;
  const last = new Date(supplier.priceLastCheckedAt).getTime();
  const hoursSince = (Date.now() - last) / (1000 * 60 * 60);
  return hoursSince < RECHECK_WINDOW_HOURS;
}

function isUsableProductUrl(url: string | undefined): url is string {
  if (!url) return false;
  // getSupplierUrl() falls back to a Google search when there's no real deep
  // link — that's not a product page we can scrape a price off.
  return !url.includes('google.com/search');
}

async function scrapePriceFromPage(page: Page): Promise<number | null> {
  try {
    await page.waitForTimeout(3000);
    const price = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      const candidates: { text: string; fontSize: number; rect: DOMRect }[] = [];
      for (const el of elements) {
        if (el.children.length === 0 && el.textContent) {
          const text = el.textContent.trim();
          if (text.includes('£')) {
            const match = text.match(/£\s*(\d+\.\d{2})/);
            if (match) {
              const style = window.getComputedStyle(el);
              const fontSize = parseFloat(style.fontSize) || 12;
              const rect = el.getBoundingClientRect();
              candidates.push({ text, fontSize, rect });
            }
          }
        }
      }
      if (candidates.length === 0) return null;
      candidates.sort((a, b) => {
        const aVisible = a.rect.width > 0 && a.rect.height > 0 ? 1 : 0;
        const bVisible = b.rect.width > 0 && b.rect.height > 0 ? 1 : 0;
        if (aVisible !== bVisible) return bVisible - aVisible;
        return b.fontSize - a.fontSize;
      });
      const bestMatch = candidates[0].text.match(/£\s*(\d+\.\d{2})/);
      return bestMatch ? parseFloat(bestMatch[1]) : null;
    });
    return price;
  } catch (err) {
    console.error('  - Price extraction error:', err);
    return null;
  }
}

async function buildCandidateList(): Promise<{ candidates: Candidate[]; skipped: ReportRow[] }> {
  const [ingredientsSnap, recipesSnap, dishesSnap] = await Promise.all([
    db.collection('ingredients').get(),
    db.collection('recipes').get(),
    db.collection('dishes').get(),
  ]);

  const ingredients: Ingredient[] = ingredientsSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const recipes: Recipe[] = recipesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  const dishes: Dish[] = dishesSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));

  const menuIngredientIds = computeMenuIngredientIds(dishes, recipes);
  const menuIngredients = ingredients.filter(i => menuIngredientIds.has(i.id));

  const candidates: Candidate[] = [];
  const skipped: ReportRow[] = [];

  for (const ingredient of menuIngredients) {
    if (ingredient.category === 'Meat' || ingredient.category === 'Fish') continue; // local suppliers, no portal

    (ingredient.suppliers ?? []).forEach((supplier, supplierIndex) => {
      if (!SCRAPABLE_SUPPLIERS.has(supplier.name)) return; // Cranbrook/Crouch/Glovers/Internal etc — no portal
      if (!isUsableProductUrl(supplier.sourceUrl)) return; // no real deep link, just a search fallback
      if (isRecentlyChecked(supplier)) return; // checked within the rate-limit window

      candidates.push({ ingredient, supplierIndex, supplier });
    });
  }

  console.log(`- Active-menu ingredients: ${menuIngredients.length} (of ${ingredients.length} total)`);
  console.log(`- Checkable supplier links found: ${candidates.length}`);

  return { candidates, skipped };
}

async function runActiveMenuSync(writeToDb: boolean) {
  console.log('==================================================');
  console.log(`[ACTIVE-MENU PRICE SYNC]: writeToDb=${writeToDb}`);
  console.log('==================================================');

  for (const supplierName of SCRAPABLE_SUPPLIERS) {
    if (!fs.existsSync(AUTH_PATHS[supplierName])) {
      console.error(`[ERROR]: Missing saved session for ${supplierName} (${AUTH_PATHS[supplierName]}).`);
      console.error('  Run: npm run scrape:login');
      process.exit(1);
    }
  }

  const { candidates } = await buildCandidateList();
  const byPlatform = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (!byPlatform.has(c.supplier.name)) byPlatform.set(c.supplier.name, []);
    byPlatform.get(c.supplier.name)!.push(c);
  }

  const browser = await chromium.launch({ headless: true });
  const report: ReportRow[] = [];

  for (const [supplierName, items] of byPlatform) {
    console.log(`\n--- Checking ${items.length} ${supplierName} product(s) ---`);
    const context = await browser.newContext({ storageState: AUTH_PATHS[supplierName] });
    const page = await context.newPage();

    for (let i = 0; i < items.length; i++) {
      const { ingredient, supplierIndex, supplier } = items[i];
      console.log(`[${i + 1}/${items.length}] ${ingredient.name} (${supplierName})...`);

      const nowIso = new Date().toISOString();
      let row: ReportRow;

      try {
        await page.goto(supplier.sourceUrl!, { waitUntil: 'load', timeout: 30000 });
        const newPrice = await scrapePriceFromPage(page);

        if (newPrice === null || newPrice <= 0) {
          console.log('  -> Warning: price not found on page');
          row = { ingredientName: ingredient.name, supplierName, oldPrice: supplier.packCost, newPrice: null, changed: false, pctChange: null, flag: 'not-found' };
        } else {
          const oldPrice = supplier.packCost;
          const changed = Math.abs(oldPrice - newPrice) > 0.005;
          const pctChange = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : null;
          const largeSwing = pctChange !== null && Math.abs(pctChange) > LARGE_SWING_PCT;

          row = {
            ingredientName: ingredient.name,
            supplierName,
            oldPrice,
            newPrice,
            changed,
            pctChange,
            flag: !changed ? 'unchanged' : largeSwing ? 'large-swing' : 'ok',
          };

          if (changed) {
            console.log(`  -> Price changed: £${oldPrice.toFixed(2)} -> £${newPrice.toFixed(2)}${largeSwing ? '  [LARGE SWING - REVIEW]' : ''}`);
          } else {
            console.log(`  -> Unchanged (£${newPrice.toFixed(2)})`);
          }

          if (writeToDb) {
            // Re-read the ingredient doc fresh so we don't clobber unrelated
            // concurrent edits to its suppliers array.
            const freshSnap = await db.collection('ingredients').doc(ingredient.id).get();
            const freshData = freshSnap.data();
            if (freshData) {
              const suppliers = [...(freshData.suppliers ?? [])];
              if (suppliers[supplierIndex] && suppliers[supplierIndex].name === supplierName) {
                suppliers[supplierIndex] = {
                  ...suppliers[supplierIndex],
                  packCost: newPrice,
                  priceLastCheckedAt: nowIso,
                  ...(changed ? { priceUpdatedAt: nowIso } : {}),
                };
                await db.collection('ingredients').doc(ingredient.id).update({ suppliers });

                // Best-effort: keep the flat supplierProducts catalogue entry in sync too,
                // matched by its captured deep link (mirrors CatalogCaptureModal's cascade,
                // just in the opposite direction).
                if (changed) {
                  const catalogueMatch = await db.collection('supplierProducts')
                    .where('source', '==', supplier.sourceUrl).limit(1).get();
                  if (!catalogueMatch.empty) {
                    await catalogueMatch.docs[0].ref.update({ packCost: newPrice, updatedAt: nowIso });
                  }
                }
              }
            }
          }
        }
      } catch (err) {
        console.error(`  -> Failed to check ${ingredient.name}:`, (err as Error).message);
        row = { ingredientName: ingredient.name, supplierName, oldPrice: supplier.packCost, newPrice: null, changed: false, pctChange: null, flag: 'error' };
      }

      report.push(row);
    }

    await context.close();
  }

  await browser.close();
  printReport(report, writeToDb);
}

function printReport(report: ReportRow[], wrote: boolean) {
  console.log('\n==================================================');
  console.log('[ACTIVE-MENU PRICE SYNC REPORT]');
  console.log('==================================================');

  const changed = report.filter(r => r.changed);
  const largeSwings = report.filter(r => r.flag === 'large-swing');
  const notFound = report.filter(r => r.flag === 'not-found');
  const errors = report.filter(r => r.flag === 'error');

  console.log(`Checked: ${report.length}  |  Changed: ${changed.length}  |  Large swings: ${largeSwings.length}  |  Not found: ${notFound.length}  |  Errors: ${errors.length}`);
  console.log(wrote ? '(changes were written to Firestore)' : '(dry run — nothing was written; re-run with --write to apply)');

  if (changed.length > 0) {
    console.log('\n--- Price changes ---');
    for (const r of changed) {
      const pct = r.pctChange !== null ? ` (${r.pctChange > 0 ? '+' : ''}${r.pctChange.toFixed(1)}%)` : '';
      const flag = r.flag === 'large-swing' ? '  [LARGE SWING — REVIEW]' : '';
      console.log(`- [${r.supplierName}] ${r.ingredientName}: £${r.oldPrice.toFixed(2)} -> £${r.newPrice!.toFixed(2)}${pct}${flag}`);
    }
  }

  if (notFound.length > 0) {
    console.log('\n--- Price not found on page (check manually) ---');
    for (const r of notFound) console.log(`- [${r.supplierName}] ${r.ingredientName}`);
  }

  if (errors.length > 0) {
    console.log('\n--- Errors ---');
    for (const r of errors) console.log(`- [${r.supplierName}] ${r.ingredientName}`);
  }

  if (changed.length === 0 && notFound.length === 0 && errors.length === 0) {
    console.log('\nAll checked active-menu prices match the supplier sites.');
  }
}

// --- CLI ENTRYPOINT ---
const args = process.argv.slice(2);
const write = args.includes('--write');
runActiveMenuSync(write);
