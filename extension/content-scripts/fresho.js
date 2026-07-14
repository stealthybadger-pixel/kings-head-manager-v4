// Runs on a Fresho marketplace search page (David Catt's storefront). Assumes the user has
// searched for an exact product name so the first result card is the intended one. Fresho is
// an Ember SPA that loads results async (with a progress spinner), so this waits briefly for
// a result card to appear before reading.
//
// Pinned to Fresho's real result-card markup (verified against a live search):
//   card:  .product-list-item
//   name:  .product-list-item__title
//   price: .product-list-item-price__dollars
//   unit:  .product-list-item-price__quantity-type-name  (e.g. "Each", or a weight)
//   code:  [data-fresho-group="quantity-type-price-row-product-code"]
function khkmScrapeFresho() {
  return new Promise((resolve) => {
    function tryExtract() {
      const card = document.querySelector('.product-list-item');
      if (!card) return null;

      const nameEl = card.querySelector('.product-list-item__title');
      const name = nameEl ? nameEl.textContent.trim() : null;
      if (!name) return null;

      const priceEl = card.querySelector('.product-list-item-price__dollars');
      const priceMatch = priceEl ? priceEl.textContent.match(/£\s*(\d+\.\d{2})/) : null;
      if (!priceMatch) return null;
      const packCost = parseFloat(priceMatch[1]);
      if (!packCost) return null;

      const codeEl = card.querySelector('[data-fresho-group="quantity-type-price-row-product-code"]');
      const productCode = codeEl ? codeEl.textContent.trim() : null;

      // Quantity type is "Each" for by-unit items, or carries a weight (e.g. "1kg") for
      // weighed items — drives the pack size/unit sent to the app.
      const qtyEl = card.querySelector('.product-list-item-price__quantity-type-name');
      const qtyText = qtyEl ? qtyEl.textContent.trim() : '';
      let packSizeText = null;
      const wm = qtyText.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
      if (wm) packSizeText = wm[0];
      else if (/each/i.test(qtyText)) packSizeText = '1 ea';

      return {
        supplier: 'David Catt',
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

window.khkmScrapeFresho = khkmScrapeFresho;
