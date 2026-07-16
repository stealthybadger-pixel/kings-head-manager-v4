import { CATEGORY_KEYWORDS } from '../../src/utils/ingredientAutofill';
import { SupplierProduct } from '../../src/types';

// Blanket cleanup rules — decided 2026-07-16. Each rule returns true when a
// product should be auto-rejected (deleted) without ever being shown in the
// normal one-at-a-time review queue. Products that don't match any rule fall
// through to the normal queue unaffected.

function wordMatch(name: string, word: string): boolean {
  const escaped = word.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(name);
}

// "The only frozen items I want to keep are peas and bags of frozen fruit.
// No exceptions." Supplier names don't always spell out "frozen" in full.
const FROZEN_PATTERN = /\b(frozen|frz|frzn|fzn)\b/i;
const PEA_KEEP_PATTERN = /\bpeas?\b/i;
// Reuses the app's existing Fruit category keyword list (ingredientAutofill.ts)
// rather than a separate hand-rolled list — same words used for ingredient
// category inference elsewhere, so "frozen raspberries"/"frozen blueberries"
// etc. are covered without needing the literal word "fruit" in the name.
const FRUIT_KEEP_WORDS = CATEGORY_KEYWORDS['Fruit'];

export function isFrozenAutoReject(product: SupplierProduct): boolean {
  const name = product.name;
  if (!FROZEN_PATTERN.test(name)) return false; // not frozen at all — rule doesn't apply
  if (PEA_KEEP_PATTERN.test(name)) return false; // peas exception
  if (FRUIT_KEEP_WORDS.some((w) => wordMatch(name, w))) return false; // fruit exception
  return true;
}

export interface RuleResult {
  id: string;
  label: string;
  test: (product: SupplierProduct) => boolean;
}

export const AUTO_REJECT_RULES: RuleResult[] = [
  {
    id: 'frozen-except-peas-and-fruit',
    label: 'Frozen (except peas / frozen fruit)',
    test: isFrozenAutoReject
  }
];
