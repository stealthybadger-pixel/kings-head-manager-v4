const KHKM_APP_URL_PATTERN = 'http://localhost:3000/*';

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

scrapeBtn.addEventListener('click', async () => {
  status.textContent = '';
  status.className = '';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => {
      if (window.khkmScrapeBooker) return window.khkmScrapeBooker();
      if (window.khkmScrapeFresho) return window.khkmScrapeFresho();
      if (window.khkmScrapeUrban) return window.khkmScrapeUrban();
      return null;
    }
  });

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
  const tabs = await chrome.tabs.query({ url: KHKM_APP_URL_PATTERN });

  if (tabs.length === 0) {
    status.textContent = 'KHKM app is not open. Opening it now — click "Send to KHKM" again once it loads.';
    status.className = 'error';
    chrome.tabs.create({ url: 'http://localhost:3000' });
    return;
  }

  await chrome.tabs.sendMessage(tabs[0].id, { type: 'KHKM_RELAY_CAPTURE', payload: currentScrape });
  await chrome.tabs.update(tabs[0].id, { active: true });
  status.textContent = 'Sent — check the KHKM tab.';
  status.className = '';
});
