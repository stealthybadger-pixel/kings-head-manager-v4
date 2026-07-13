export type PackUnit = 'g' | 'ml' | 'ea' | 'kg' | 'l' | 'oz';

export interface ParsedPack {
  packSize: number;
  packUnit: PackUnit;
}

const UNIT_PATTERN = '(ml|l|kg|g|oz|ea)';

/**
 * Parses free-text pack-size descriptions from supplier sites (e.g.
 * "12 x 330ml", "1.36kg", "Case of 1") into a structured pack size + unit.
 * Returns null when the text doesn't match a known pattern, rather than
 * guessing — the caller should let the user fill it in by hand instead.
 */
export function parsePackText(text: string): ParsedPack | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // "N x SIZEUNIT" e.g. "12 x 330ml", "6 x 0.5kg"
  const multiMatch = trimmed.match(
    new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*x\\s*(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}$`, 'i')
  );
  if (multiMatch) {
    const count = parseFloat(multiMatch[1]);
    const size = parseFloat(multiMatch[2]);
    const unit = multiMatch[3].toLowerCase() as PackUnit;
    return { packSize: round(count * size), packUnit: unit };
  }

  // Bare "SIZEUNIT" e.g. "1.36kg", "2l"
  const bareMatch = trimmed.match(new RegExp(`^(\\d+(?:\\.\\d+)?)\\s*${UNIT_PATTERN}$`, 'i'));
  if (bareMatch) {
    const size = parseFloat(bareMatch[1]);
    const unit = bareMatch[2].toLowerCase() as PackUnit;
    return { packSize: size, packUnit: unit };
  }

  // "Case of N" (optionally followed by more detail we ignore, e.g. "x 1pk")
  const caseMatch = trimmed.match(/^case\s+of\s+(\d+(?:\.\d+)?)/i);
  if (caseMatch) {
    return { packSize: parseFloat(caseMatch[1]), packUnit: 'ea' };
  }

  return null;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
