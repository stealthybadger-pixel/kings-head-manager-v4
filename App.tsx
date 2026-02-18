
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import RecipeBuilder from './components/RecipeBuilder';
import { FinancialHUD } from './components/FinancialHUD';
import { Navigation } from './components/Navigation';
import { IngredientManager } from './components/IngredientManager';
import { DishBuilder } from './components/DishBuilder';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { MassIngester } from './components/MassIngester';
import { ResolutionDashboard } from './components/ResolutionDashboard';
import { DataInspector } from './components/DataInspector';
import { ConfirmationProvider } from './hooks/useConfirmation';
import { useRecursiveBuilder } from './hooks/useRecursiveBuilder';
import { db } from './firebase';

const App: React.FC = () => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectionType, setSelectionType] = useState<'ingredient' | 'recipe' | 'dish'>('ingredient');
  const [currentView, setCurrentView] = useState('dashboard');
  const [libraryTab, setLibraryTab] = useState<'ingredients' | 'recipes' | 'dishes'>('ingredients');
  const [availableTabs, setAvailableTabs] = useState<('ingredients' | 'recipes' | 'dishes')[]>(['ingredients', 'recipes']);
  const [configError, setConfigError] = useState(false);
  
  // Global Inspector State
  const [inspectedItem, setInspectedItem] = useState<{id: string, type: 'ingredient' | 'recipe'} | null>(null);

  // Track Dish Builder Mode for Sidebar Pivot
  const [isDishEditing, setIsDishEditing] = useState(false);
  const [forceNewDish, setForceNewDish] = useState(false);
  const [forceNewRecipe, setForceNewRecipe] = useState(false);

  const { pushLevel, popLevel, currentLevel, isNested, depth } = useRecursiveBuilder();

  useEffect(() => {
    // @ts-ignore
    const options = db.app.options;
    if (options.apiKey === "PLACEHOLDER_API_KEY") {
      setConfigError(true);
    }
  }, []);

  const handleSelectItem = (id: string, type: 'ingredient' | 'recipe' | 'dish') => {
    setSelectedItemId(id);
    setSelectionType(type);
  };

  const handleDashboardNavigate = (view: string, targetId?: string) => {
    setCurrentView(view);
    setIsDishEditing(false); // Reset editing state on nav
    if (targetId) {
      const type = view === 'kitchen' ? 'recipe' : 'ingredient';
      setSelectedItemId(targetId);
      setSelectionType(type);
      
      if (view === 'kitchen') {
        setLibraryTab('recipes');
        setAvailableTabs(['recipes']);
      } else {
        setLibraryTab(type === 'recipe' ? 'recipes' : 'ingredients');
        setAvailableTabs(['ingredients', 'recipes']);
      }
    } else {
      setSelectedItemId(null);
      setSelectionType('ingredient');
      
      if (view === 'kitchen') {
        setLibraryTab('recipes');
        setAvailableTabs(['recipes']);
      } else if (view === 'service') {
        setLibraryTab('dishes');
        setAvailableTabs(['ingredients', 'recipes', 'dishes']);
      } else {
        setLibraryTab('ingredients');
        setAvailableTabs(['ingredients', 'recipes']);
      }
    }
  };

  const handleViewChange = (view: string) => {
    setCurrentView(view);
    setSelectedItemId(null);
    setSelectionType('ingredient');
    setIsDishEditing(false); // Reset editing state on nav
    setInspectedItem(null); // Close inspector on nav change
    
    // Context-aware default tab selection
    if (view === 'kitchen') {
        setLibraryTab('recipes');
        setAvailableTabs(['recipes']);
    } else if (view === 'service') {
        setLibraryTab('dishes');
        setAvailableTabs(['ingredients', 'recipes', 'dishes']);
    } else {
        setLibraryTab('ingredients');
        setAvailableTabs(['ingredients', 'recipes']);
    }
  };

  const handleNewRecipe = useCallback(() => {
    setCurrentView('kitchen');
    setSelectedItemId(null);
    setSelectionType('recipe');
    setForceNewRecipe(true);
  }, []);

  const handleNewDish = useCallback(() => {
    setCurrentView('service');
    setSelectedItemId(null);
    setSelectionType('dish');
    setForceNewDish(true);
    setIsDishEditing(true);
  }, []);

  const handleRecursiveAddRequest = useCallback((name: string, type: 'ingredient' | 'recipe' | 'dish') => {
    // Dish creation not currently recursive-supported in first pass but kept for consistency
    if (type === 'dish') return;
    pushLevel(type as any, { name }, (newItemId) => {
      setSelectedItemId(newItemId);
      setSelectionType(type as any);
    });
  }, [pushLevel]);

  const handleInspect = useCallback((id: string, type: 'ingredient' | 'recipe') => {
    setInspectedItem({ id, type });
  }, []);

  if (configError) {
    return (
      <div className="flex h-screen w-full bg-[#111111] items-center justify-center p-8 text-[#e0e0e0] font-sans">
        <div className="max-w-2xl border border-[#ff4d4d] bg-[#1c1c1c] p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#ff4d4d]"></div>
          <h1 className="text-2xl font-bold uppercase tracking-widest text-[#ff4d4d] mb-4">Database Configuration Required</h1>
          <p className="mb-6 leading-relaxed text-[#888888]">Firebase credentials required. Update firebase.ts.</p>
          <button onClick={() => window.location.reload()} className="px-6 py-3 bg-[#ff4d4d] text-white font-bold uppercase tracking-widest text-xs">Refresh Core</button>
        </div>
      </div>
    );
  }

  return (
    <ConfirmationProvider>
      <div className="flex flex-col h-screen w-full bg-[#111111] overflow-hidden select-none font-sans">
        <Navigation activeView={currentView} onViewChange={handleViewChange} />
        <div className="flex-1 relative overflow-hidden">
            {/* GLOBAL INSPECTOR OVERLAY */}
            {inspectedItem && (
              <DataInspector 
                id={inspectedItem.id} 
                type={inspectedItem.type} 
                onClose={() => setInspectedItem(null)} 
              />
            )}

            {currentView === 'dashboard' && <Dashboard onNavigate={handleDashboardNavigate} />}
            {currentView === 'ingest' && <MassIngester />}
            {currentView === 'resolution' && <ResolutionDashboard />}
            {(currentView === 'service' || currentView === 'kitchen') && (
              <div className="flex h-full w-full">
                  <div className="w-80 h-full flex-shrink-0 border-r border-[#333333]">
                    <Sidebar 
                      onSelectItem={handleSelectItem} 
                      activeTab={libraryTab}
                      availableTabs={availableTabs}
                      allTabs={availableTabs}
                      onTabChange={setLibraryTab}
                      onCreateRequest={handleRecursiveAddRequest}
                      isHybrid={currentView === 'service' && isDishEditing}
                      onInspect={handleInspect}
                      inspectedItem={inspectedItem}
                      onNewRecipe={handleNewRecipe}
                      onNewDish={handleNewDish}
                      kitchenMode={currentView === 'kitchen'}
                    />
                  </div>
                  <div className="flex-1 h-full overflow-hidden">
                    {currentView === 'service' ? (
                      <DishBuilder 
                        stagedItemId={selectedItemId}
                        stagedItemType={selectionType}
                        clearStaged={() => setSelectedItemId(null)}
                        onPushIngredient={(name) => pushLevel('ingredient', { name })}
                        onPushRecipe={(name) => pushLevel('recipe', { name })}
                        onSetLibraryTab={setLibraryTab}
                        onSetAvailableTabs={setAvailableTabs}
                        onModeChange={setIsDishEditing}
                        onInspect={handleInspect}
                        inspectedItem={inspectedItem}
                        forceNewDish={forceNewDish}
                      />
                    ) : (
                      <RecipeBuilder 
                        stagedItemId={selectedItemId} 
                        stagedItemType={selectionType as any}
                        clearStaged={() => setSelectedItemId(null)}
                        onSetLibraryTab={setLibraryTab as any}
                        onSetAvailableTabs={setAvailableTabs as any}
                        isLibraryTabRecipes={libraryTab === 'recipes'}
                        onPushIngredient={(name) => pushLevel('ingredient', { name })}
                        onPushRecipe={(name) => pushLevel('recipe', { name })}
                        onInspect={handleInspect}
                        inspectedItem={inspectedItem}
                        forceNew={forceNewRecipe}
                        onForceNewHandled={() => setForceNewRecipe(false)}
                      />
                    )}
                  </div>
              </div>
            )}
            {currentView === 'ingredients' && (
              <IngredientManager initialEditId={selectionType === 'ingredient' ? selectedItemId : null} />
            )}
            {currentView === 'settings' && <Settings />}
            {isNested && (
              <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[2px] flex justify-end">
                <div className="w-full max-w-4xl h-full bg-[#111] border-l border-[#444] flex flex-col relative animate-slide-in-right">
                  <div className="h-12 border-b border-[#444] bg-[#1c1c1c] flex items-center px-6 justify-between flex-shrink-0">
                    <span className="text-[10px] font-bold text-[#c8a96e] uppercase tracking-[0.2em]">Context Creation</span>
                    <button onClick={popLevel} className="text-[#888] hover:text-white font-mono text-[10px] uppercase tracking-widest border border-[#333] px-3 py-1.5 hover:bg-[#333]">Discard [ESC]</button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    {currentLevel.level === 'recipe' && (
                      <div className="flex h-full">
                        <div className="w-72 border-r border-[#333] flex-shrink-0">
                          <Sidebar 
                            onSelectItem={handleSelectItem} 
                            activeTab="ingredients" 
                            availableTabs={['ingredients']} 
                            onTabChange={()=>{}} 
                            onInspect={handleInspect}
                            inspectedItem={inspectedItem}
                          />
                        </div>
                        <div className="flex-1 overflow-y-auto">
                          <RecipeBuilder 
                            stagedItemId={selectedItemId} stagedItemType="ingredient" 
                            clearStaged={()=>setSelectedItemId(null)} onSetLibraryTab={()=>{}} onSetAvailableTabs={()=>{}} 
                            isLibraryTabRecipes={false} isRecursive initialName={currentLevel.initialData?.name}
                            onComplete={(id) => { if (currentLevel.onComplete) currentLevel.onComplete(id, 'recipe'); popLevel(); }}
                            onInspect={handleInspect}
                            inspectedItem={inspectedItem}
                          />
                        </div>
                      </div>
                    )}
                    {currentLevel.level === 'ingredient' && (
                      <IngredientManager isRecursive initialName={currentLevel.initialData?.name} onComplete={(id) => { if (currentLevel.onComplete) currentLevel.onComplete(id, 'ingredient'); popLevel(); }} />
                    )}
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    </ConfirmationProvider>
  );
};

export default App;
