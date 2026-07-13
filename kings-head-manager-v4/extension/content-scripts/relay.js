// Runs on the KHKM app page. Its only job: receive a message from the
// extension's popup/background and post it into the page's own window so
// the React app's message listener (useCatalogCapture) can pick it up.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== 'KHKM_RELAY_CAPTURE') return;

  window.postMessage(
    { type: 'KHKM_CATALOG_CAPTURE', payload: message.payload },
    window.location.origin
  );
  sendResponse({ relayed: true });
});
