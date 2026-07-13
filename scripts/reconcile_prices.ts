import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { chromium, BrowserContext, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// Initialize Firebase Admin (use local emulator by default)
const projectId = 'kings-head-kitchen-claude';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || 'localhost:8080';

initializeApp({ projectId });
const db = getFirestore();

const AUTH_DIR = path.resolve('.auth');
const BOOKER_AUTH_PATH = path.join(AUTH_DIR, 'booker.json');
const FRESHO_AUTH_PATH = path.join(AUTH_DIR, 'fresho.json');
const URBAN_AUTH_PATH = path.join(AUTH_DIR, 'urban.json');

function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise(resolve => rl.question(query, ans => {
    rl.close();
    resolve(ans);
  }));
}

/**
 * Universal price extractor from browser page context.
 * Finds leaf elements containing '£' and parses the numeric value.
 */
async function scrapePriceFromPage(page: Page): Promise<number | null> {
  try {
    // Wait for network idle or a short timeout to let client-side JS render prices
    await page.waitForTimeout(3000);

    const price = await page.evaluate(() => {
      // Find all leaf elements
      const elements = Array.from(document.querySelectorAll('*'));
      const candidates: { text: string; fontSize: number; rect: DOMRect }[] = [];

      for (const el of elements) {
        // Must be a leaf node (no child elements) or have direct text
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

      // Sort by font size descending (main price is usually larger) and visibility
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
    console.error("  - Price extraction error:", err);
    return null;
  }
}

/**
 * Stage 1: Setup & Login
 */
async function runSetup() {
  console.log("==================================================");
  console.log("[SETUP]: Launching browser to save sessions...");
  console.log("==================================================");

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: false });

  // 1. Booker Login
  console.log("\n[1/3] Setting up Booker session...");
  const bookerContext = await browser.newContext();
  const bookerPage = await bookerContext.newPage();
  await bookerPage.goto('https://www.booker.co.uk/');
  console.log("--> Action Required: Please log in to your Booker account in the opened browser window.");
  await askQuestion("--> Once you have fully logged in and see the homepage, press [Enter] here to save session...");
  
  await bookerContext.storageState({ path: BOOKER_AUTH_PATH });
  console.log(`[SAVED]: Booker session saved to ${BOOKER_AUTH_PATH}`);
  await bookerContext.close();

  // 2. David Catt (Fresho) Login
  console.log("\n[2/3] Setting up David Catt (Fresho) session...");
  const freshoContext = await browser.newContext();
  const freshoPage = await freshoContext.newPage();
  await freshoPage.goto('https://app.fresho.com/marketplace/products?company_id=053d4097-ab85-4017-b807-1699698f15b4&mode=buy&supplier_id=a7648017-0863-418e-a301-16aed6fa3d0d');
  console.log("--> Action Required: Please log in to your Fresho account in the opened browser window.");
  await askQuestion("--> Once you have fully logged in and see the David Catt marketplace, press [Enter] here to save session...");
  
  await freshoContext.storageState({ path: FRESHO_AUTH_PATH });
  console.log(`[SAVED]: Fresho session saved to ${FRESHO_AUTH_PATH}`);
  await freshoContext.close();

  // 3. Urban Foodservice Login
  console.log("\n[3/3] Setting up Urban Foodservice session...");
  const urbanContext = await browser.newContext();
  const urbanPage = await urbanContext.newPage();
  await urbanPage.goto('https://shop.urbanfoodservice.co.uk/');
  console.log("--> Action Required: Please log in to your Urban Foodservice account in the opened browser window.");
  await askQuestion("--> Once you have fully logged in and see the ordering dashboard, press [Enter] here to save session...");
  
  await urbanContext.storageState({ path: URBAN_AUTH_PATH });
  console.log(`[SAVED]: Urban session saved to ${URBAN_AUTH_PATH}`);
  await urbanContext.close();

  await browser.close();
  console.log("\n==================================================");
  console.log("[SETUP COMPLETE]: Sessions saved! Ready for reconciliation.");
  console.log("==================================================");
}

/**
 * Stage 2: Price Reconciliation
 */
async function runReconciliation(writeToDb = false) {
  console.log("==================================================");
  console.log(`[RECONCILE]: Starting Price Reconciliation (Write: ${writeToDb})...`);
  console.log("==================================================");

  if (!fs.existsSync(BOOKER_AUTH_PATH) || !fs.existsSync(FRESHO_AUTH_PATH) || !fs.existsSync(URBAN_AUTH_PATH)) {
    console.error("[ERROR]: Auth files not found. Please run setup mode first:");
    console.error("  npx tsx scripts/reconcile_prices.ts --setup");
    process.exit(1);
  }

  // Load mapped products from database
  const prodSnap = await db.collection('supplierProducts').get();
  const allProducts: any[] = [];
  prodSnap.forEach(doc => allProducts.push({ id: doc.id, ...doc.data() }));

  const bookerItems = allProducts.filter(p => p.supplier === 'Booker' && (p.bookerProductCode || p.productCode || p.sku));
  const cattItems = allProducts.filter(p => p.supplier === 'David Catt');
  const urbanItems = allProducts.filter(p => (p.supplier === 'Urban' || p.supplier === 'Urban Foodservice') && (p.urbanProductId || p.productCode || p.sku));

  console.log(`- Loaded: ${bookerItems.length} Booker products, ${cattItems.length} David Catt products, ${urbanItems.length} Urban products from database.`);

  const browser = await chromium.launch({ headless: true });
  const changes: { name: string; supplier: string; oldCost: number; newCost: number }[] = [];

  // --- RECONCILE BOOKER ---
  if (bookerItems.length > 0) {
    console.log("\n--- Scraping Booker Prices ---");
    const context = await browser.newContext({ storageState: BOOKER_AUTH_PATH });
    const page = await context.newPage();

    for (let i = 0; i < bookerItems.length; i++) {
      const item = bookerItems[i];
      const code = item.bookerProductCode || item.productCode || item.sku;
      const url = `https://www.booker.co.uk/products/product?Code=${code}`;
      
      console.log(`[${i + 1}/${bookerItems.length}] Checking Booker: ${item.name} (${code})...`);
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        const newPrice = await scrapePriceFromPage(page);

        if (newPrice !== null && newPrice > 0) {
          const oldCost = item.packCost;
          if (Math.abs(oldCost - newPrice) > 0.005) {
            console.log(`  -> Price changed! Old: £${oldCost.toFixed(2)}, New: £${newPrice.toFixed(2)}`);
            changes.push({ name: item.name, supplier: 'Booker', oldCost, newCost: newPrice });

            if (writeToDb) {
              await db.collection('supplierProducts').doc(item.id).update({
                packCost: newPrice,
                updatedAt: new Date().toISOString()
              });
            }
          } else {
            console.log(`  -> Unchanged (£${newPrice.toFixed(2)})`);
          }
        } else {
          console.log(`  -> Warning: Price not found`);
        }
      } catch (err) {
        console.error(`  -> Failed to check ${item.name}:`, (err as Error).message);
      }
    }
    await context.close();
  }

  // --- RECONCILE DAVID CATT (FRESHO) ---
  if (cattItems.length > 0) {
    console.log("\n--- Scraping David Catt Prices ---");
    const context = await browser.newContext({ storageState: FRESHO_AUTH_PATH });
    const page = await context.newPage();

    for (let i = 0; i < cattItems.length; i++) {
      const item = cattItems[i];
      const url = `https://app.fresho.com/marketplace/products?company_id=053d4097-ab85-4017-b807-1699698f15b4&mode=buy&supplier_id=a7648017-0863-418e-a301-16aed6fa3d0d&search=${encodeURIComponent(item.name)}`;

      console.log(`[${i + 1}/${cattItems.length}] Checking David Catt: ${item.name}...`);
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        const newPrice = await scrapePriceFromPage(page);

        if (newPrice !== null && newPrice > 0) {
          const oldCost = item.packCost;
          if (Math.abs(oldCost - newPrice) > 0.005) {
            console.log(`  -> Price changed! Old: £${oldCost.toFixed(2)}, New: £${newPrice.toFixed(2)}`);
            changes.push({ name: item.name, supplier: 'David Catt', oldCost, newCost: newPrice });

            if (writeToDb) {
              await db.collection('supplierProducts').doc(item.id).update({
                packCost: newPrice,
                updatedAt: new Date().toISOString()
              });
            }
          } else {
            console.log(`  -> Unchanged (£${newPrice.toFixed(2)})`);
          }
        } else {
          console.log(`  -> Warning: Price not found`);
        }
      } catch (err) {
        console.error(`  -> Failed to check ${item.name}:`, (err as Error).message);
      }
    }
    await context.close();
  }

  // --- RECONCILE URBAN FOODSERVICE ---
  if (urbanItems.length > 0) {
    console.log("\n--- Scraping Urban Foodservice Prices ---");
    const context = await browser.newContext({ storageState: URBAN_AUTH_PATH });
    const page = await context.newPage();

    for (let i = 0; i < urbanItems.length; i++) {
      const item = urbanItems[i];
      const code = item.urbanProductId || item.productCode || item.sku;
      const url = `https://shop.urbanfoodservice.co.uk/#/products/detail/${code}`;
      
      console.log(`[${i + 1}/${urbanItems.length}] Checking Urban: ${item.name} (${code})...`);
      try {
        await page.goto(url, { waitUntil: 'load', timeout: 30000 });
        const newPrice = await scrapePriceFromPage(page);

        if (newPrice !== null && newPrice > 0) {
          const oldCost = item.packCost;
          if (Math.abs(oldCost - newPrice) > 0.005) {
            console.log(`  -> Price changed! Old: £${oldCost.toFixed(2)}, New: £${newPrice.toFixed(2)}`);
            changes.push({ name: item.name, supplier: 'Urban Foodservice', oldCost, newCost: newPrice });

            if (writeToDb) {
              await db.collection('supplierProducts').doc(item.id).update({
                packCost: newPrice,
                updatedAt: new Date().toISOString()
              });
            }
          } else {
            console.log(`  -> Unchanged (£${newPrice.toFixed(2)})`);
          }
        } else {
          console.log(`  -> Warning: Price not found`);
        }
      } catch (err) {
        console.error(`  -> Failed to check ${item.name}:`, (err as Error).message);
      }
    }
    await context.close();
  }

  await browser.close();

  console.log("\n==================================================");
  console.log("[RECONCILIATION SUMMARY]");
  console.log(`Total price discrepancies found: ${changes.length}`);
  console.log("==================================================");
  if (changes.length > 0) {
    changes.forEach(c => {
      console.log(`- [${c.supplier}] ${c.name}: £${c.oldCost.toFixed(2)} -> £${c.newCost.toFixed(2)}`);
    });
  } else {
    console.log("All prices match perfectly with the supplier websites!");
  }
}

// --- CLI ENTRYPOINT ---
const args = process.argv.slice(2);
if (args.includes('--setup')) {
  runSetup();
} else {
  const write = args.includes('--write');
  runReconciliation(write);
}
