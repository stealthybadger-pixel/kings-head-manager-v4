// Runs on a Fresho marketplace search page. Assumes the user has searched
// for an exact product name so exactly one result card is visible — Fresho
// has no stable per-product deep link, unlike Booker/Urban.
function khkmScrapeFresho() {
  const card = document.querySelector('[class*="product"]');
  if (!card) return null;

  const nameEl = card.querySelector('h1, h2, h3, [class*="title"], [class*="name"]');
  const name = nameEl ? nameEl.textContent.trim() : null;

  const cardText = card.innerText;
  const priceMatch = cardText.match(/£\s*(\d+\.\d{2})/);
  const packCost = priceMatch ? parseFloat(priceMatch[1]) : null;

  if (!name || packCost === null) return null;

  const packSizeMatch = cardText.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
  const packSizeText = packSizeMatch ? packSizeMatch[0] : null;

  return {
    supplier: 'David Catt',
    name,
    packCost,
    packSizeText,
    productCode: null,
    sourceUrl: window.location.href
  };
}

window.khkmScrapeFresho = khkmScrapeFresho;
