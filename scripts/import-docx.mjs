#!/usr/bin/env node
/**
 * import-docx.mjs
 * Batch-imports all recipe .docx files from recipes/food recipes/ into Firestore
 * as pending_validation records, ready for the Resolution Dashboard.
 *
 * Usage:
 *   node scripts/import-docx.mjs           # live import
 *   node scripts/import-docx.mjs --dry-run  # preview only, no writes
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, writeBatch, doc, collection, getDocs } from 'firebase/firestore';
import mammoth from 'mammoth';
import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// ── Firebase config (same as firebase.ts) ──────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyBx_7Raw_xgM2dQWBmUU29W9ggbcmVmo_Y",
  authDomain: "kings-head-kitchen-claude.firebaseapp.com",
  projectId: "kings-head-kitchen-claude",
  storageBucket: "kings-head-kitchen-claude.firebasestorage.app",
  messagingSenderId: "661815699598",
  appId: "1:661815699598:web:e05a12781db09844f241df"
};

const DRY_RUN = process.argv.includes('--dry-run');
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = path.join(ROOT, '..', 'recipes', 'food recipes');

// ── Section file detection ─────────────────────────────────────────────────
// These files contain MULTIPLE recipes separated by wide gaps / ALL CAPS titles.
// All other .docx files contain exactly ONE recipe (name = filename).

const SECTION_KEYWORDS = ['SECTION', 'RECIPES', 'LARDER', 'SASHIMI'];

function isSectionFile(filePath) {
  const name = path.basename(filePath, '.docx').toUpperCase();
  return SECTION_KEYWORDS.some(kw => name.includes(kw));
}

// ── Title-case helper ─────────────────────────────────────────────────────
const LOWERCASE_WORDS = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'for',
  'nor', 'on', 'at', 'to', 'by', 'in', 'of', 'with', 'up']);

function toTitleCase(str) {
  return str.toLowerCase().split(/\s+/).map((w, i) =>
    (i === 0 || !LOWERCASE_WORDS.has(w)) ? w.charAt(0).toUpperCase() + w.slice(1) : w
  ).join(' ');
}

// ── Section file parser ───────────────────────────────────────────────────
/**
 * Splits ALL CAPS section files into individual recipes.
 * Uses a state machine: tracks whether we're inside a "pre-method" block
 * (where ALL CAPS titles can appear) or inside a method block.
 *
 * ALL CAPS recipe titles are 2-60 chars, no leading digit, not "METHOD" etc.
 */

const CAPS_TITLE = /^[A-Z][A-Z\s\/\(\)\-\,\.\&\']{1,59}$/;
const SKIP_TITLES = new Set([
  'METHOD', 'METHOD.', 'INGREDIENTS', 'PREPARATION', 'NOTE', 'NOTES',
  'VEG SECTION RECIPES', 'SAUCE SECTION RECIPES', 'PASTRY SECTION RECIPES',
  'LARDER SECTION RECIPES', 'SASHIMI DRESSINGS AND PICKLES',
  'BREAD RECIPES', 'BREAD SECTION RECIPES',
  'VEG', 'MEAT', 'FISH', 'SAUCE', 'PASTRY', 'LARDER', 'DRESSING', 'SOUP',
]);

function looksLikeRecipeTitle(line) {
  const clean = line.replace(/\.$/, '').trim();
  if (!CAPS_TITLE.test(line)) return false;
  if (/^\d/.test(line)) return false;               // starts with digit
  if (SKIP_TITLES.has(clean)) return false;
  if (clean.split(/\s+/).length > 8) return false;  // too many words for a title
  return true;
}

function splitSectionFile(text, filename) {
  const lines = text.split('\n').map(l => l.trim());
  const recipes = [];
  let name = null;
  let body = [];
  let inMethod = false;
  let blankRun = 0;

  const flush = () => {
    if (name && body.join(' ').trim().length > 20) {
      recipes.push({
        name: toTitleCase(name.replace(/\.$/, '').trim()),
        raw_text: [name, ...body].join('\n').trim(),
        source_filename: filename
      });
    }
    name = null;
    body = [];
    inMethod = false;
  };

  for (const line of lines) {
    if (!line) {
      blankRun++;
      // After 6+ blank lines, assume we've left a method section — reset state
      if (blankRun >= 6 && inMethod) inMethod = false;
      if (name) body.push('');
      continue;
    }
    blankRun = 0;

    const clean = line.replace(/\.$/, '').trim();

    // Detect "METHOD." line → enter method state
    if (clean === 'METHOD' || clean === 'METHOD.') {
      inMethod = true;
      if (name) body.push(line);
      continue;
    }

    // Only look for recipe titles when NOT in a method block
    if (!inMethod && looksLikeRecipeTitle(line)) {
      flush();
      name = clean;
      body = [];
      continue;
    }

    if (name) body.push(line);
  }

  flush(); // Save last recipe
  return recipes.filter(r => r.raw_text.length > 40);
}

// ── Individual file ────────────────────────────────────────────────────────
function singleRecipe(text, filePath) {
  const filename = path.basename(filePath, '.docx');
  return [{ name: filename, raw_text: text.trim(), source_filename: filename }];
}

// ── Walk directory ─────────────────────────────────────────────────────────
async function walkDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkDir(full));
    } else if (entry.name.endsWith('.docx') && !entry.name.startsWith('~$')) {
      files.push(full);
    }
  }
  return files;
}

// ── Normalise for dedup ───────────────────────────────────────────────────
function normName(s) {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

// ── Main ───────────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n🍴  Kings Head Recipe Importer${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   Source: ${RECIPES_DIR}\n`);

  const docxFiles = await walkDir(RECIPES_DIR);
  console.log(`📂  Found ${docxFiles.length} .docx files`);

  const allRecipes = [];
  const seenNames = new Set();
  let sectionCount = 0, individualCount = 0;

  for (const filePath of docxFiles) {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value;
      if (!text || text.trim().length < 20) {
        console.warn(`   ⚠️  Skipped (empty): ${path.basename(filePath)}`);
        continue;
      }

      const section = isSectionFile(filePath);
      const recipes = section
        ? splitSectionFile(text, path.basename(filePath, '.docx'))
        : singleRecipe(text, filePath);

      if (section) sectionCount++;
      else individualCount++;

      for (const r of recipes) {
        const key = normName(r.name);
        if (seenNames.has(key)) {
          // Silent dedup — same name from different section files
          continue;
        }
        seenNames.add(key);
        allRecipes.push(r);
      }
    } catch (err) {
      console.error(`   ❌  Error reading ${path.basename(filePath)}: ${err.message}`);
    }
  }

  console.log(`   Section files processed: ${sectionCount}`);
  console.log(`   Individual files processed: ${individualCount}`);
  console.log(`\n📋  Total recipes to import: ${allRecipes.length}\n`);

  if (DRY_RUN) {
    allRecipes.forEach((r, i) => {
      const flag = r.source_filename !== r.name ? ` [from: ${r.source_filename}]` : '';
      console.log(`   ${String(i + 1).padStart(3)}. ${r.name}${flag}`);
    });
    console.log('\n✅  Dry run complete — no writes made.\n');
    return;
  }

  // ── Connect to Firestore ────────────────────────────────────────────────
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  console.log('🔌  Connecting to Firestore...');
  const snapshot = await getDocs(collection(db, 'recipes'));
  const existingNames = new Map();
  const existingFilenames = new Map();
  snapshot.forEach(d => {
    const data = d.data();
    if (data.name) existingNames.set(normName(data.name), d.id);
    if (data.source_filename) existingFilenames.set(data.source_filename, d.id);
  });
  console.log(`   Found ${existingNames.size} existing recipes in Firestore\n`);

  // ── Batch write ─────────────────────────────────────────────────────────
  const CHUNK = 50;
  let created = 0, updated = 0;

  for (let i = 0; i < allRecipes.length; i += CHUNK) {
    const chunk = allRecipes.slice(i, i + CHUNK);
    const batch = writeBatch(db);

    for (const recipe of chunk) {
      const key = normName(recipe.name);
      const existingId = existingNames.get(key) || existingFilenames.get(recipe.source_filename);
      const timestamp = new Date().toISOString();

      if (existingId) {
        batch.update(doc(db, 'recipes', existingId), {
          raw_text: recipe.raw_text,
          status: 'pending_validation',
          updatedAt: timestamp
        });
        console.log(`   🔄  UPDATED  ${recipe.name}`);
        updated++;
      } else {
        const ref = doc(collection(db, 'recipes'));
        batch.set(ref, {
          name: recipe.name,
          batchSize: 1,
          batchUnit: 'ea',
          items: [],
          instructions: '',
          sourceType: 'manual',
          isDirty: true,
          status: 'pending_validation',
          raw_text: recipe.raw_text,
          structured_data: null,
          source_filename: recipe.source_filename,
          createdAt: timestamp,
          updatedAt: timestamp
        });
        existingNames.set(key, ref.id);
        console.log(`   ✅  CREATED  ${recipe.name}`);
        created++;
      }
    }

    await batch.commit();
    console.log(`   ── batch ${Math.floor(i / CHUNK) + 1} committed (${Math.min(i + CHUNK, allRecipes.length)}/${allRecipes.length})\n`);
  }

  console.log('─'.repeat(50));
  console.log(`✅  Done!  Created: ${created}  Updated: ${updated}`);
  console.log('   Open the Resolution Dashboard to parse and commit recipes.\n');
  process.exit(0);
}

run().catch(err => {
  console.error('\n❌  Fatal error:', err);
  process.exit(1);
});
