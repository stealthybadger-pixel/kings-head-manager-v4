export interface SupplierUrlItem {
  name: string;
  supplier: string;
  bookerProductCode?: string;
  urbanProductId?: string;
  sku?: string;
  productCode?: string;
}

/**
 * Dynamically constructs a URL to view the supplier product on their website/platform.
 */
export const getSupplierUrl = (item: SupplierUrlItem): string => {
  if (!item) return '';
  const supplierLower = (item.supplier || '').trim().toLowerCase();
  
  if (supplierLower === 'booker') {
    const code = item.bookerProductCode;
    return code
      ? `https://www.booker.co.uk/products/product?Code=${code}`
      : `https://www.google.com/search?q=${encodeURIComponent(`Booker ${item.name || ''}`.trim())}`;
  }

  if (supplierLower === 'urban' || supplierLower === 'urban foodservice') {
    const code = item.urbanProductId;
    return code
      ? `https://shop.urbanfoodservice.co.uk/#/products/detail/${code}`
      : `https://www.google.com/search?q=${encodeURIComponent(`Urban Foodservice ${item.name || ''}`.trim())}`;
  }
  
  if (supplierLower === 'david catt') {
    // David Catt uses Fresho Marketplace
    const base = 'https://app.fresho.com/marketplace/products?company_id=053d4097-ab85-4017-b807-1699698f15b4&mode=buy&supplier_id=a7648017-0863-418e-a301-16aed6fa3d0d';
    return `${base}&search=${encodeURIComponent(item.name)}`;
  }
  
  // Fallback Google search for other wholesalers (Crouch, Cranbrook, Glovers, etc.)
  const query = `${item.supplier || ''} ${item.name || ''}`.trim();
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
};
