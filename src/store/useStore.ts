import { create } from 'zustand';
import { ViewType } from '../App';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface UIState {
  currentView: ViewType;
  selectedIngredientId: string | null;
  selectedRecipeId: string | null;
  selectedDishId: string | null;
  // Set when Catalog was opened from Pantry's "Find on Supplier Catalogue" flow — identifies
  // which ingredient a chosen product should be attached to as a supplier option, and that
  // the user should be returned to Pantry (with that ingredient selected) once done.
  linkBackIngredientId: string | null;
  // Set when navigating to Catalog with a specific product already known (e.g. Pantry's
  // "Cheaper Catalog Option Available" nudge) — Catalog auto-selects and scrolls to this
  // product on arrival instead of leaving the user to spot it in a filtered list.
  highlightProductId: string | null;

  // Sidebar Search/Filters
  searchTerm: string;
  categoryFilter: string;
  supplierFilter: string;

  // Bluetooth Scale State
  scaleConnected: boolean;
  scaleWeightGrams: number;
  activeContainerId: string | null;

  // Toast Notifications
  toasts: Toast[];

  // Setters
  setView: (view: ViewType) => void;
  selectIngredient: (id: string | null) => void;
  selectRecipe: (id: string | null) => void;
  selectDish: (id: string | null) => void;
  setSearchTerm: (term: string) => void;
  setCategoryFilter: (category: string) => void;
  setSupplierFilter: (supplier: string) => void;
  setScaleConnected: (connected: boolean) => void;
  setScaleWeight: (weight: number) => void;
  setActiveContainerId: (id: string | null) => void;
  navigateToCatalogWithSearch: (term: string) => void;
  navigateToCatalogAndHighlightProduct: (productId: string, searchTerm: string) => void;
  clearHighlightProduct: () => void;
  navigateToCatalogToLinkSupplier: (ingredientId: string, searchTerm: string) => void;
  clearLinkBackIngredient: () => void;
  navigateToPantryWithIngredient: (id: string) => void;
  navigateToStockWithIngredient: (id: string) => void;
  navigateToKitchenWithRecipe: (id: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  dismissToast: (id: string) => void;
}

export const useStore = create<UIState>((set) => ({
  currentView: 'dashboard',
  selectedIngredientId: null,
  selectedRecipeId: null,
  selectedDishId: null,
  linkBackIngredientId: null,
  highlightProductId: null,

  searchTerm: '',
  categoryFilter: 'All',
  supplierFilter: 'All',

  scaleConnected: false,
  scaleWeightGrams: 0,
  activeContainerId: null,

  toasts: [],

  setView: (view) => set({
    currentView: view,
    selectedIngredientId: null,
    selectedRecipeId: null,
    selectedDishId: null,
    linkBackIngredientId: null,
    highlightProductId: null,
    searchTerm: '',
    categoryFilter: 'All',
    supplierFilter: 'All'
  }),
  selectIngredient: (id) => set({ selectedIngredientId: id, selectedRecipeId: null, selectedDishId: null }),
  selectRecipe: (id) => set({ selectedRecipeId: id, selectedIngredientId: null, selectedDishId: null }),
  selectDish: (id) => set({ selectedDishId: id, selectedIngredientId: null, selectedRecipeId: null }),
  setSearchTerm: (term) => set({ searchTerm: term }),
  setCategoryFilter: (category) => set({ categoryFilter: category }),
  setSupplierFilter: (supplier) => set({ supplierFilter: supplier }),
  setScaleConnected: (connected) => set({ scaleConnected: connected }),
  setScaleWeight: (weight) => set({ scaleWeightGrams: weight }),
  setActiveContainerId: (id) => set({ activeContainerId: id }),
  navigateToCatalogWithSearch: (term) => set({
    currentView: 'catalog',
    selectedIngredientId: null,
    selectedRecipeId: null,
    selectedDishId: null,
    linkBackIngredientId: null,
    highlightProductId: null,
    searchTerm: term,
    categoryFilter: 'All',
    supplierFilter: 'All'
  }),
  navigateToCatalogAndHighlightProduct: (productId, searchTerm) => set({
    currentView: 'catalog',
    selectedIngredientId: null,
    selectedRecipeId: null,
    selectedDishId: null,
    linkBackIngredientId: null,
    highlightProductId: productId,
    searchTerm,
    categoryFilter: 'All',
    supplierFilter: 'All'
  }),
  clearHighlightProduct: () => set({ highlightProductId: null }),
  navigateToCatalogToLinkSupplier: (ingredientId, searchTerm) => set({
    currentView: 'catalog',
    selectedIngredientId: null,
    selectedRecipeId: null,
    selectedDishId: null,
    linkBackIngredientId: ingredientId,
    highlightProductId: null,
    searchTerm,
    categoryFilter: 'All',
    supplierFilter: 'All'
  }),
  clearLinkBackIngredient: () => set({ linkBackIngredientId: null }),
  navigateToPantryWithIngredient: (id) => set({
    currentView: 'pantry',
    selectedIngredientId: id,
    selectedRecipeId: null,
    selectedDishId: null,
    linkBackIngredientId: null,
    highlightProductId: null,
    searchTerm: '',
    categoryFilter: 'All',
    supplierFilter: 'All'
  }),
  navigateToStockWithIngredient: (id) => set({
    currentView: 'stock',
    selectedIngredientId: id,
    selectedRecipeId: null,
    selectedDishId: null,
    linkBackIngredientId: null,
    highlightProductId: null,
    searchTerm: '',
    categoryFilter: 'All',
    supplierFilter: 'All'
  }),
  navigateToKitchenWithRecipe: (id) => set({
    currentView: 'kitchen',
    selectedIngredientId: null,
    selectedRecipeId: id,
    selectedDishId: null,
    linkBackIngredientId: null,
    highlightProductId: null,
    searchTerm: '',
    categoryFilter: 'All',
    supplierFilter: 'All'
  }),

  showToast: (message, type = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    set((state) => ({
      toasts: [...state.toasts, { id, message, type }]
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id)
      }));
    }, 4000);
  },
  
  dismissToast: (id) => set((state) => ({
    toasts: state.toasts.filter((t) => t.id !== id)
  }))
}));
export type { UIState };
