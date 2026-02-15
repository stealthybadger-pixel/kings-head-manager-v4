
import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import RecipeBuilder from './components/RecipeBuilder';
import { FinancialHUD } from './components/FinancialHUD';
import { Navigation } from './components/Navigation';
import { IngredientManager } from './components/IngredientManager';
import { DishBuilder } from './components/DishBuilder';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { ConfirmationProvider } from './hooks/useConfirmation';
import { useRecursiveBuilder } from './hooks/useRecursiveBuilder';
import { db } from './firebase';

const App: React.FC = () => {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectionType, setSelectionType] = useState<'ingredient' | 'recipe'>('ingredient');
  const [currentView, setCurrentView] = useState('dashboard');
  const [libraryTab, setLibraryTab] = useState<'ingredients' | 'recipes'>('ingredients');
  const [availableTabs, setAvailableTabs] = useState<('ingredients' | 'recipes')[]>(['ingredients', 'recipes']);
  const [configError, setConfigError] = useState(false);

  // Recursive Builder Stack
  const { stack, pushLevel, popLevel, currentLevel, isNested } = useRecursiveBuilder();

  useEffect(() => {
    // Check if the firebase config is still using placeholders
    // @ts-ignore
    const options = db.app.options;
    if (options.apiKey === "PLACEHOLDER_API_KEY") {
      setConfigError(true);
    }
  }, []);

  const handleSelectItem = (id: string, type: 'ingredient' | 'recipe') => {
    setSelectedItemId(id);
    setSelectionType(type);
  };

  const handleDashboardNavigate = (view: string, targetId?: string) => {
    setCurrentView(view);
    if (targetId) {
      const type = view === 'kitchen' ? 'recipe' : 'ingredient';
      setSelectedItemId(targetId);
      setSelectionType(type);
      setLibraryTab(type === 'recipe' ? 'recipes' : 'ingredients');
      setAvailableTabs(type === 'recipe' ? ['recipes'] : ['ingredients']);
    } else if (view === 'kitchen' || view === 'service') {
      setSelectedItemId(null);
      setSelectionType('ingredient');
      setAvailableTabs(view === 'kitchen' ? ['ingredients'] : ['ingredients', 'recipes']);
      setLibraryTab('ingredients');
    }
  };

  const handleViewChange = (view: string) => {
    setCurrentView(view);
    // Reset selection when changing views via main nav
    setSelectedItemId(null);
    setSelectionType('ingredient');
    
    if (view === 'kitchen') {
      setAvailableTabs(['ingredients']);
      setLibraryTab('ingredients');
    } else if (view === 'service') {
      setAvailableTabs(['ingredients', 'recipes']);
      setLibraryTab('ingredients');
    }
  };

  if (configError) {
    return (
      <div className="flex h-screen w-full bg-[#111111] items-center justify-center p-8 text-[#e0e0e0] font-sans">
        <div className="max-w-2xl border border-[#ff4d4d] bg-[#1c1c1c] p-8 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-1 h-full bg-[#ff4d4d]"></div>
          <h1 className="text-2xl font-bold uppercase tracking-widest text-[#ff4d4d] mb-4">Database Configuration Required</h1>
          <p className="mb-6 leading-relaxed text-[#888888]">
            Firebase credentials required. Update firebase.ts with your production keys to enable the Kitchen Manager.
          </p>
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
            {currentView === 'dashboard' && <Dashboard onNavigate={handleDashboardNavigate} />}

            {currentView === 'service' && (
              <div className="flex h-full w-full">
                  <div className="w-80 h-full flex-shrink-0 border-r border-[#333333]">
                    <Sidebar 
                      onSelectItem={handleSelectItem} 
                      activeTab={libraryTab}
                      availableTabs={availableTabs}
                      onTabChange={setLibraryTab}
                    />
                  </div>
                  <div className="flex-1 h-full">
                    <DishBuilder 
                      stagedItemId={selectedItemId}
                      stagedItemType={selectionType}
                      clearStaged={() => setSelectedItemId(null)}
                      onPushIngredient={() => pushLevel('ingredient')}
                      onPushRecipe={() => pushLevel('recipe')}
                    />
                  </div>
              </div>
            )}

            {currentView === 'kitchen' && (
                <div className="flex h-full w-full">
                    <div className="w-80 h-full flex-shrink-0 border-r border-[#333333]">
                    <Sidebar 
                      onSelectItem={handleSelectItem} 
                      activeTab={libraryTab}
                      availableTabs={availableTabs}
                      onTabChange={setLibraryTab}
                    />
                    </div>
                    <div className="flex-1 h-full overflow-y-auto relative">
                    <RecipeBuilder 
                        stagedItemId={selectedItemId} 
                        stagedItemType={selectionType}
                        clearStaged={() => setSelectedItemId(null)}
                        onSetLibraryTab={setLibraryTab}
                        onSetAvailableTabs={setAvailableTabs}
                        isLibraryTabRecipes={libraryTab === 'recipes'}
                    />
                    </div>
                </div>
            )}

            {currentView === 'ingredients' && (
              <IngredientManager initialEditId={selectionType === 'ingredient' ? selectedItemId : null} />
            )}

            {currentView === 'settings' && <Settings />}

            {/* RECURSIVE BUILDER OVERLAYS */}
            {isNested && (
              <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 backdrop-blur-[2px]">
                <div className="w-full max-w-6xl h-[85vh] bg-[#111] border border-[#444] flex flex-col relative shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                  <div className="h-10 border-b border-[#444] bg-[#1c1c1c] flex items-center px-4 justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-[#c8a96e] uppercase tracking-[0.2em]">Recursive Creation //</span>
                      <span className="text-[10px] font-bold text-[#888] uppercase">{currentLevel.level}</span>
                    </div>
                    <button onClick={popLevel} className="text-[#888] hover:text-white font-mono text-xs uppercase tracking-tighter">Discard Layer [ESC]</button>
                  </div>
                  <div className="flex-1 overflow-hidden bg-black">
                    {currentLevel.level === 'recipe' && (
                      <div className="flex h-full">
                        <div className="w-72 border-r border-[#333]"><Sidebar onSelectItem={handleSelectItem} activeTab="ingredients" availableTabs={['ingredients']} onTabChange={()=>{}} /></div>
                        <div className="flex-1"><RecipeBuilder stagedItemId={selectedItemId} stagedItemType="ingredient" clearStaged={()=>setSelectedItemId(null)} onSetLibraryTab={()=>{}} onSetAvailableTabs={()=>{}} isLibraryTabRecipes={false} /></div>
                      </div>
                    )}
                    {currentLevel.level === 'ingredient' && (
                      <IngredientManager />
                    )}
                  </div>
                  {/* Visual Metadata */}
                  <div className="absolute bottom-4 right-4 text-[8px] font-mono text-[#444] uppercase tracking-widest pointer-events-none">Stack Depth: {stack.length} // LAYER_ISOLATION: ACTIVE</div>
                </div>
              </div>
            )}
        </div>
      </div>
    </ConfirmationProvider>
  );
};

export default App;
