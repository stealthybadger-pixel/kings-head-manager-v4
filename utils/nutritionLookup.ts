
export type KcalResult = {
  value: number;
  source: 'COFID' | 'USDA';
};

const COFID_DATA: Record<string, number> = {
  'butter': 717,
  'egg': 155,
  'eggs': 155,
  'flour': 364,
  'sugar': 400,
  'milk': 63,
  'cream': 450,
  'cheddar': 416,
  'chicken': 165,
  'beef': 250,
  'mince': 225,
  'salmon': 208,
  'potato': 77,
  'onion': 40,
  'carrot': 41,
  'rice': 130,
  'pasta': 131,
  'oil': 884,
  'olive oil': 884,
  'honey': 304,
  'apple': 52,
  'banana': 89,
  'orange': 47,
  'lemon': 29,
  'tomato': 18,
  'cucumber': 15,
  'lettuce': 15,
  'spinach': 23,
  'mushroom': 22,
  'bread': 265
};

export async function lookupKcal(query: string): Promise<KcalResult | null> {
  if (!query) return null;

  // Simulate network latency for "lookup" feeling
  await new Promise(resolve => setTimeout(resolve, 600));

  const lower = query.toLowerCase();

  // 1. Try COFID (Simulated Local Lookup for robust demo)
  // In production, replace with fetch('https://api.eatwell.co.uk/...')
  for (const [key, val] of Object.entries(COFID_DATA)) {
    if (lower.includes(key)) {
      return { value: val, source: 'COFID' };
    }
  }

  // 2. Try USDA (Real API call if key exists)
  // Casting import.meta to any to avoid TS error about missing 'env' property
  const USDA_KEY = (import.meta as any).env?.VITE_USDA_API_KEY;
  if (USDA_KEY) {
     try {
       const res = await fetch(`https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(query)}&pageSize=1&api_key=${USDA_KEY}`);
       const data = await res.json();
       if (data.foods && data.foods.length > 0) {
         const food = data.foods[0];
         // Energy (Atwater General Factors) is nutrientId 1008, or Energy (KCAL) is 2047 or 1008
         const energy = food.foodNutrients.find((n: any) => n.nutrientId === 1008 || n.nutrientId === 2047);
         if (energy) {
           return { value: Math.round(energy.value), source: 'USDA' };
         }
       }
     } catch(e) {
       console.warn("USDA lookup failed", e);
     }
  }

  return null;
}
