// Runs on a Booker product page. Exposes a scrape function the popup can
// invoke via chrome.scripting.executeScript.
//
// Pinned to Booker's real markup (verified against a live product page):
//   - name:  <h4> product title (the page has NO <h1>, which broke the old selector).
//   - price: the page shows a £0.00 placeholder, a case price, and a single-pack price.
//            The pack size shown is the single unit (e.g. "500g"), so we take the smallest
//            non-zero, non-VAT £ price — the single-pack price that matches that pack size,
//            not the larger case price.
//   - pack:  a small <li> like "500g"; falls back to a size baked into the name.
function khkmScrapeBooker() {
  const url = new URL(window.location.href);
  const productCode = url.searchParams.get('Code');

  const nameEl = document.querySelector('h4') || document.querySelector('h1');
  const name = nameEl ? nameEl.textContent.trim() : null;

  // Gather every leaf-node £ price, skip the £0.00 placeholder and any "incl. VAT"
  // duplicate, then take the smallest — the single-pack price.
  const prices = [];
  document.querySelectorAll('body *').forEach((el) => {
    if (el.children.length) return;
    const t = (el.textContent || '').trim();
    if (/vat/i.test(t)) return;
    const m = t.match(/£\s*(\d+\.\d{2})/);
    if (m) {
      const v = parseFloat(m[1]);
      if (v > 0) prices.push(v);
    }
  });
  const packCost = prices.length ? Math.min(...prices) : null;

  // Pack size: a standalone <li> such as "500g", else a size embedded in the product name.
  let packSizeText = null;
  const packLi = Array.from(document.querySelectorAll('li')).find((li) =>
    /^\d+(?:\.\d+)?\s*(kg|g|ml|l|litre|litres|ltr|ea|each)\b/i.test((li.textContent || '').trim())
  );
  if (packLi) {
    packSizeText = packLi.textContent.trim();
  } else if (name) {
    const pm = name.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
    if (pm) packSizeText = pm[0];
  }

  if (!name || packCost === null || !productCode) {
    return null;
  }

  return {
    supplier: 'Booker',
    name,
    packCost,
    packSizeText,
    productCode,
    sourceUrl: window.location.href
  };
}

window.khkmScrapeBooker = khkmScrapeBooker;
