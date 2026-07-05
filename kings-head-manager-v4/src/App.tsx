import React, { useState } from 'react';
import {
  LayoutDashboard,
  ChefHat,
  Utensils,
  Boxes,
  Database,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Info,
  X,
  HelpCircle,
  Truck,
  ScanLine,
  ChevronDown,
  UtensilsCrossed,
  MonitorPlay
} from 'lucide-react';
import Dashboard from './components/Dashboard';
import Pantry from './components/Pantry';
import Catalog from './components/Catalog';
import Kitchen from './components/Kitchen';
import Service from './components/Service';
import Stock from './components/Stock';
import Suppliers from './components/Suppliers';
import InvoiceScanner from './components/InvoiceScanner';
import Help from './components/Help';
import FrontOfHouse from './components/FrontOfHouse';
import { useStore } from './store/useStore';

export type ViewType = 'dashboard' | 'pantry' | 'catalog' | 'kitchen' | 'service' | 'stock' | 'suppliers' | 'invoice' | 'settings' | 'foh';

const App: React.FC = () => {
  const currentView = useStore((state) => state.currentView);
  const setCurrentView = useStore((state) => state.setView);
  const toasts = useStore((state) => state.toasts);
  const dismissToast = useStore((state) => state.dismissToast);
  const [navCollapsed, setNavCollapsed] = useState<boolean>(true);
  const [kitchenOpen, setKitchenOpen] = useState<boolean>(true);

  const topItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  ] as const;

  const kitchenItems = [
    { id: 'pantry', label: 'Pantry', icon: Database },
    { id: 'catalog', label: 'Supplier Catalogue', icon: BookOpen },
    { id: 'kitchen', label: 'Recipes', icon: ChefHat },
    { id: 'service', label: 'Dishes', icon: Utensils },
  ] as const;

  const bottomItems = [
    { id: 'foh', label: 'Front of House', icon: MonitorPlay },
    { id: 'stock', label: 'Stock', icon: Boxes },
    { id: 'invoice', label: 'Invoices', icon: ScanLine },
    { id: 'suppliers', label: 'Suppliers', icon: Truck },
    { id: 'settings', label: 'Help', icon: HelpCircle },
  ] as const;

  return (
    <div className="flex h-screen w-screen bg-background overflow-hidden text-on-surface select-none font-sans">
      {/* 1. LEFT DOCK NAVIGATION */}
      <nav 
        className={`flex flex-col h-full bg-surface-container border-r border-outline-variant transition-all duration-300 ${
          navCollapsed ? 'w-[72px]' : 'w-60'
        }`}
        onMouseEnter={() => setNavCollapsed(false)}
        onMouseLeave={() => setNavCollapsed(true)}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center px-6 border-b border-outline-variant overflow-hidden flex-shrink-0">
          <span className="font-bold text-primary tracking-widest label-caps whitespace-nowrap">
            {navCollapsed ? 'KH' : "King's Head v4"}
          </span>
        </div>

        {/* Navigation Link List */}
        <div className="flex-1 flex flex-col gap-1 py-4 overflow-hidden">

          {/* Top items */}
          {topItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`relative h-12 flex items-center transition-colors duration-150 ${
                  isActive ? 'bg-surface-container-high text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                } ${navCollapsed ? 'justify-center' : 'px-6 gap-4'}`}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                <IconComponent className="h-6 w-6 flex-shrink-0" />
                {!navCollapsed && <span className="text-sm font-sans tracking-wide truncate">{item.label}</span>}
              </button>
            );
          })}

          {/* Kitchen group */}
          <button
            onClick={() => { if (!navCollapsed) setKitchenOpen(o => !o); }}
            className={`relative h-10 flex items-center transition-colors duration-150 mt-1 text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface ${navCollapsed ? 'justify-center' : 'px-6 gap-3'}`}
          >
            <UtensilsCrossed className="h-5 w-5 flex-shrink-0 text-outline" />
            {!navCollapsed && (
              <>
                <span className="text-[10px] font-bold label-caps tracking-widest text-outline flex-1">Kitchen</span>
                <ChevronDown className={`h-3.5 w-3.5 text-outline transition-transform duration-200 ${kitchenOpen ? '' : '-rotate-90'}`} />
              </>
            )}
          </button>

          {(kitchenOpen || navCollapsed) && kitchenItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`relative h-10 flex items-center transition-colors duration-150 ${
                  isActive ? 'bg-surface-container-high text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                } ${navCollapsed ? 'justify-center' : 'pl-10 pr-6 gap-3'}`}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                <IconComponent className="h-5 w-5 flex-shrink-0" />
                {!navCollapsed && <span className="text-sm font-sans tracking-wide truncate">{item.label}</span>}
              </button>
            );
          })}

          <div className="h-px bg-outline-variant mx-4 my-2 flex-shrink-0" />

          {/* Bottom items */}
          {bottomItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id)}
                className={`relative h-12 flex items-center transition-colors duration-150 ${
                  isActive ? 'bg-surface-container-high text-primary font-semibold' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
                } ${navCollapsed ? 'justify-center' : 'px-6 gap-4'}`}
              >
                {isActive && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
                <IconComponent className="h-6 w-6 flex-shrink-0" />
                {!navCollapsed && <span className="text-sm font-sans tracking-wide truncate">{item.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Version Footer */}
        <div className="h-12 flex items-center justify-center border-t border-outline-variant flex-shrink-0">
          <span className="text-[9px] font-mono font-bold text-outline uppercase tracking-widest">
            {navCollapsed ? 'v4' : 'Version 4.0.0'}
          </span>
        </div>
      </nav>

      {/* 2. MAIN WORKSPACE CONTAINER */}
      <main className="flex-1 h-full overflow-hidden flex flex-col">
        {/* Header Ribbon */}
        <header className="h-16 border-b border-outline-variant bg-surface-container-lowest flex items-center px-8 justify-between flex-shrink-0">
          <h1 className="headline-md text-on-surface capitalize font-semibold">
            {currentView.replace('-', ' ')}
          </h1>
          <div className="flex items-center gap-4">
            {/* EPOS status hidden */}
          </div>
        </header>

        {/* View Router */}
        <div className="flex-1 overflow-hidden relative bg-surface-container-lowest">
          {currentView === 'dashboard' && <Dashboard />}
          {currentView === 'pantry' && <Pantry />}
          {currentView === 'catalog' && <Catalog />}
          {currentView === 'kitchen' && <Kitchen />}
          {currentView === 'service' && <Service />}
          {currentView === 'stock' && <Stock />}
          {currentView === 'invoice' && <InvoiceScanner />}
          {currentView === 'foh' && <FrontOfHouse />}
          {currentView === 'suppliers' && <Suppliers />}
          {currentView === 'settings' && <Help />}
        </div>
      </main>

      {/* Toast Notifications */}
      <div className="fixed top-6 right-6 z-50 flex flex-col gap-3 w-80 max-w-[calc(100vw-3rem)] pointer-events-none">
        {toasts.map((toast) => {
          const isSuccess = toast.type === 'success';
          const isError = toast.type === 'error';
          
          return (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start justify-between gap-3 p-4 rounded-md shadow-lg border backdrop-blur-sm transform transition-all duration-300 animate-fade-in ${
                isSuccess 
                  ? 'bg-emerald-950/95 border-emerald-500/30 text-emerald-100' 
                  : isError 
                  ? 'bg-red-950/95 border-red-500/30 text-red-100' 
                  : 'bg-zinc-900/95 border-zinc-700/50 text-zinc-100'
              }`}
            >
              <div className="flex gap-2.5 items-start">
                {isSuccess && <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />}
                {isError && <AlertCircle className="h-5 w-5 text-red-400 shrink-0 mt-0.5" />}
                {!isSuccess && !isError && <Info className="h-5 w-5 text-zinc-400 shrink-0 mt-0.5" />}
                <p className="text-xs font-semibold leading-relaxed">{toast.message}</p>
              </div>
              <button 
                onClick={() => dismissToast(toast.id)}
                className={`shrink-0 p-0.5 rounded-full hover:bg-white/10 transition-colors ${
                  isSuccess ? 'text-emerald-400' : isError ? 'text-red-400' : 'text-zinc-400'
                }`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default App;
