// Runs on an Urban Foodservice product detail page. The AngularJS SPA renders
// content client-side after the hash route loads, so this waits (via
// MutationObserver, capped at 5s) for the price to actually appear before reading.
//
// Selectors are pinned to Urban's real markup (verified against a live product page):
//   - name:  <h1 class="ng-binding">
//   - price: <span class="price ...>  — NOT the first £ in the page: a browse/filter
//            widget renders <span class="price-text"> £0.00 that must be ignored.
//            (".price" matches the class token "price"; "price-text" is a different
//            token, so it is not matched — which is exactly what we want.)
//   - pack:  <span class="value ...>  e.g. "2ltr", "4 EACH"
function khkmScrapeUrban() {
  return new Promise((resolve) => {
    const idMatch = window.location.hash.match(/\/products\/detail\/(\d+)/);
    const productCode = idMatch ? idMatch[1] : null;

    function tryExtract() {
      const priceEl = document.querySelector('span.price');
      const priceMatch = priceEl ? priceEl.textContent.match(/£\s*(\d+\.\d{2})/) : null;
      if (!priceMatch) return null;
      const packCost = parseFloat(priceMatch[1]);
      if (!packCost) return null; // £0.00 / still settling — keep waiting

      const nameEl = document.querySelector('h1');
      const name = nameEl ? nameEl.textContent.trim() : null;
      if (!name) return null;

      // First span.value pairs with the first (single-unit) price option.
      const valueEl = document.querySelector('span.value');
      let packSizeText = valueEl ? valueEl.textContent.trim() : null;
      // Urban writes litres as "ltr" (e.g. "2ltr") — normalise so the pack parser reads it.
      if (packSizeText) packSizeText = packSizeText.replace(/ltr\b/i, 'l');

      return {
        supplier: 'Urban',
        name,
        packCost,
        packSizeText,
        productCode,
        sourceUrl: window.location.href
      };
    }

    const immediate = tryExtract();
    if (immediate) {
      resolve(immediate);
      return;
    }

    const timeout = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, 5000);

    const observer = new MutationObserver(() => {
      const result = tryExtract();
      if (result) {
        clearTimeout(timeout);
        observer.disconnect();
        resolve(result);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

window.khkmScrapeUrban = khkmScrapeUrban;
