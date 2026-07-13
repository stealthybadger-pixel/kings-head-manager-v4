const SUPPLIER_TEXT_COLOR: Record<string, string> = {
  'Booker':     'text-blue-500',
  'David Catt': 'text-green-500',
  'Urban':      'text-violet-400',
  'Cranbrook':  'text-teal-400',
  'Crouch':     'text-red-400',
  'Glovers':    'text-amber-400',
  'Internal':   'text-slate-400',
};

export function supplierBadgeClass(supplier: string): string {
  const color = SUPPLIER_TEXT_COLOR[supplier] ?? 'text-zinc-400';
  return `${color} text-xs font-semibold`;
}
