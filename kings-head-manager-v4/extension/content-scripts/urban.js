// Runs on an Urban Foodservice product detail page. The Angular SPA renders
// content client-side after the hash route loads, so this waits (via
// MutationObserver, capped at 5s) for a price to actually appear before
// reading the page, rather than assuming it's ready immediately.
function khkmScrapeUrban() {
  return new Promise((resolve) => {
    const idMatch = window.location.hash.match(/\/products\/detail\/(\d+)/);
    const productCode = idMatch ? idMatch[1] : null;

    function tryExtract() {
      const bodyText = document.body.innerText;
      const priceMatch = bodyText.match(/£\s*(\d+\.\d{2})/);
      if (!priceMatch) return null;

      const nameEl = document.querySelector('h1, h2, [class*="product-name"], [class*="title"]');
      const name = nameEl ? nameEl.textContent.trim() : null;
      if (!name) return null;

      const packSizeMatch = bodyText.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/i);
      const packSizeText = packSizeMatch ? packSizeMatch[0] : null;

      return {
        supplier: 'Urban',
        name,
        packCost: parseFloat(priceMatch[1]),
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
