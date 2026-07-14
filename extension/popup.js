const KHKM_APP_URL_PATTERNS = ['http://localhost:3000/*', 'https://kings-head-kitchen-claude.web.app/*'];

let currentScrape = null;

const scrapeBtn = document.getElementById('scrapeBtn');
const sendBtn = document.getElementById('sendBtn');
const preview = document.getElementById('preview');
const status = document.getElementById('status');

function normalizePackFromText(packSizeText) {
  // Minimal inline mirror of src/utils/packParser.ts's simplest cases, kept
  // deliberately small here since the extension has no build step to share
  // code with the app. If this can't confidently parse, size/unit are left
  // for the user to fill in inside the KHKM review modal.
  if (!packSizeText) return { packSize: 1, packUnit: 'ea' };
  const caseMatch = packSizeText.match(/case of (\d+)/i);
  if (caseMatch) return { packSize: parseInt(caseMatch[1], 10), packUnit: 'ea' };
  const bareMatch = packSizeText.match(/(\d+(?:\.\d+)?)\s*(ml|l|kg|g|oz)/i);
  if (bareMatch) return { packSize: parseFloat(bareMatch[1]), packUnit: bareMatch[2].toLowerCase() };
  return { packSize: 1, packUnit: 'ea' };
}

// Which scraper file handles which supplier host.
const SCRAPER_FOR_HOST = [
  { match: 'booker.co.uk', file: 'content-scripts/booker.js' },
  { match: 'fresho.com', file: 'content-scripts/fresho.js' },
  { match: 'urbanfoodservice.co.uk', file: 'content-scripts/urban.js' }
];

scrapeBtn.addEventListener('click', async () => {
  status.textContent = '';
  status.className = '';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const scraper = SCRAPER_FOR_HOST.find((s) => (tab.url || '').includes(s.match));
  if (!scraper) {
    status.textContent = 'This is not a supported supplier page (Booker, Fresho/David Catt, or Urban).';
    status.className = 'error';
    return;
  }

  let results;
  try {
    // Inject the scraper file fresh, then invoke it. Injecting on demand means it works
    // even right after the extension is reloaded, without needing to refresh the supplier
    // tab (a declarative content script would be stripped from already-open tabs on reload).
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: [scraper.file] });
    results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        if (window.khkmScrapeBooker) return window.khkmScrapeBooker();
        if (window.khkmScrapeFresho) return window.khkmScrapeFresho();
        if (window.khkmScrapeUrban) return window.khkmScrapeUrban();
        return null;
      }
    });
  } catch (err) {
    status.textContent = 'Could not read this page: ' + (err && err.message ? err.message : String(err));
    status.className = 'error';
    return;
  }

  const raw = results && results[0] ? results[0].result : null;
  if (!raw) {
    status.textContent = "Couldn't read this page — make sure you're on a product page and try again.";
    status.className = 'error';
    preview.classList.remove('visible');
    sendBtn.style.display = 'none';
    return;
  }

  const { packSize, packUnit } = normalizePackFromText(raw.packSizeText);
  currentScrape = {
    supplier: raw.supplier,
    name: raw.name,
    packCost: raw.packCost,
    packSize,
    packUnit,
    productCode: raw.productCode,
    sourceUrl: raw.sourceUrl
  };

  preview.textContent = `${currentScrape.name} — £${currentScrape.packCost.toFixed(2)} (${currentScrape.packSize}${currentScrape.packUnit})`;
  preview.classList.add('visible');
  sendBtn.style.display = 'block';
});

sendBtn.addEventListener('click', async () => {
  if (!currentScrape) return;
  const tabsPerPattern = await Promise.all(
    KHKM_APP_URL_PATTERNS.map((pattern) => chrome.tabs.query({ url: pattern }))
  );
  const tabs = tabsPerPattern.flat();

  if (tabs.length === 0) {
    status.textContent = 'KHKM app is not open. Open it in a tab (logged in as a manager), then click "Send to KHKM" again.';
    status.className = 'error';
    return;
  }

  // Inject the postMessage straight into the app tab rather than relying on the relay
  // content script being pre-injected — that breaks every time the extension is reloaded
  // (an already-open app tab won't have the fresh relay until it's refreshed). Injecting
  // on demand works regardless and lets us surface a real error instead of failing silently.
  const target = tabs[0];
  try {
    await chrome.scripting.executeScript({
      target: { tabId: target.id },
      func: (payload) => {
        window.postMessage({ type: 'KHKM_CATALOG_CAPTURE', payload }, window.location.origin);
      },
      args: [currentScrape]
    });
    await chrome.tabs.update(target.id, { active: true });
    status.textContent = 'Sent — check the KHKM tab (you must be logged in as a manager).';
    status.className = '';
  } catch (err) {
    status.textContent = 'Send failed: ' + (err && err.message ? err.message : String(err));
    status.className = 'error';
  }
});
