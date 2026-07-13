# KHKM Catalogue Capture

Chrome extension for capturing a single supplier product's details into the
King's Head Manager catalogue.

## Loading it (unpacked, for development)

1. Open `chrome://extensions`
2. Enable "Developer mode" (top right)
3. Click "Load unpacked" and select this `extension/` folder
4. Pin the extension icon to the toolbar for easy access

## How to use

1. Open the KHKM app in one tab (`http://localhost:3000` in dev)
2. Navigate to a single product page on a supported supplier site:
   - Booker: a product detail page (`booker.co.uk/products/product?Code=...`)
   - David Catt: search Fresho for an exact product name so exactly one
     result card is showing
   - Urban Foodservice: a product detail page
     (`shop.urbanfoodservice.co.uk/#/products/detail/...`)
3. Click the extension icon, then "Scrape this page"
4. Check the preview, then "Send to KHKM"
5. Switch to the KHKM tab — a review modal opens, prefilled. Edit anything
   that looks wrong, then Save.

## Supported sites

- Booker (`booker.co.uk`)
- David Catt / Fresho (`app.fresho.com`)
- Urban Foodservice (`shop.urbanfoodservice.co.uk`)
