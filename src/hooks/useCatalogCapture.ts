import { useEffect, useState } from 'react';
import { useSupplierProducts } from './useKitchenData';
import { findExistingMatch, type CapturedProduct } from '../utils/catalogCapture';
import type { SupplierProduct } from '../types';

export interface CaptureState {
  captured: CapturedProduct;
  existingMatch: SupplierProduct | null;
}

const MESSAGE_TYPE = 'KHKM_CATALOG_CAPTURE';

function isCapturedProduct(value: unknown): value is CapturedProduct {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.supplier === 'string' &&
    typeof v.name === 'string' &&
    typeof v.packCost === 'number' &&
    typeof v.packSize === 'number' &&
    typeof v.packUnit === 'string' &&
    typeof v.sourceUrl === 'string'
  );
}

/**
 * Listens for a KHKM_CATALOG_CAPTURE message posted into the page by the
 * catalogue-capture Chrome extension's relay content script, and resolves
 * whether the captured product already exists in the catalogue.
 */
export function useCatalogCapture() {
  const [state, setState] = useState<CaptureState | null>(null);
  const { data: existingProducts = [] } = useSupplierProducts();

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== MESSAGE_TYPE) return;
      if (!isCapturedProduct(event.data.payload)) return;

      const captured = event.data.payload as CapturedProduct;
      setState({
        captured,
        existingMatch: findExistingMatch(captured, existingProducts)
      });
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [existingProducts]);

  return { state, clear: () => setState(null) };
}
