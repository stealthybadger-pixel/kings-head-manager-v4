/**
 * Splits a raw search query into lowercase tokens for word-order-independent,
 * substring matching. Hyphens are treated as word separators (normalized to
 * spaces) so "beef-sirloin" and "beef - sirloin" tokenize the same way.
 */
export function tokenizeSearchQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/-/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/** Same hyphen normalization applied to the text being searched. */
function normalizeSearchTarget(text: string): string {
  return (text || '').toLowerCase().replace(/-/g, ' ');
}

/** True if every token is present in text, ignoring case, word order, and hyphens. */
export function matchesSearchTokens(text: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  const normalized = normalizeSearchTarget(text);
  return tokens.every(tok => normalized.includes(tok));
}
