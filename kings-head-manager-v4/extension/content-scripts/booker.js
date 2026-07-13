// Runs on a Booker product page. Exposes a scrape function the popup can
// invoke via chrome.scripting.executeScript.
function khkmScrapeBooker() {
  const url = new URL(window.location.href);
  const productCode = url.searchParams.get('Code');

  const nameEl = document.querySelector('h1');
  const name = nameEl ? nameEl.textContent.trim() : null;

  const bodyText = document.body.innerText;
  const priceMatch = bodyText.match(/£\s*(\d+\.\d{2})/);
  const packCost = priceMatch ? parseFloat(priceMatch[1]) : null;

  const packSizeMatch = bodyText.match(/Pack size\s*\n?\s*([^\n]+)/i);
  const packSizeText = packSizeMatch ? packSizeMatch[1].trim() : null;

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
