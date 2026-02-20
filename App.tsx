
import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import RecipeBuilder from './components/RecipeBuilder';
import { FinancialHUD } from './components/FinancialHUD';
import { Navigation } from './components/Navigation';
import { IngredientManager } from './components/IngredientManager';
import { DishBuilder } from './components/DishBuilder';
import { Dashboard } from './components/Dashboard';
import { StockManager } from './components/StockManager';
import { Settings } from './components/Settings';
import { MassIngester } from './components/MassIngester';
import { ResolutionDashboard } from './components/ResolutionDashboard';
import { DataInspector } from './components/DataInspector';
import { ConfirmationProvider } from './hooks/useConfirmation';
import { useRecursiveBuilder } from './hooks/useRecursiveBuilder';
import { db } from './firebase';
import { useVoiceCommand } from './hooks/useVoiceCommand';
import { useKitchenData, ScanQueueItem } from './hooks/useKitchenData';
import { ScanQueue } from './components/ScanQueue';
import { InvoiceScanner } from './components/InvoiceScanner';
import { OCRScanner } from './components/OCRScanner';

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

  // Scale mode request — set when user right-clicks a recipe in the sidebar
  const [requestScaleMode, setRequestScaleMode] = useState(false);

  // Scan queue state
  const [scanQueueOpen, setScanQueueOpen] = useState(false);
  const [activeQueueScan, setActiveQueueScan] = useState<ScanQueueItem | null>(null);

  // Voice Data & State
  const { ingredients, recipes, updateIngredient, addIngredient, scanQueue, dismissScanQueueItem, saveRecipe } = useKitchenData();
  const [shoppingList, setShoppingList] = useState<string[]>([]);

  const speak = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      // Optional: Select a specific voice if available, or adjust rate/pitch
      // utterance.rate = 1.1; 
      window.speechSynthesis.speak(utterance);
    }
  }, []);

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

  const handleScaleRecipe = useCallback((id: string) => {
    setCurrentView('kitchen');
    setSelectedItemId(id);
    setSelectionType('recipe');
    setRequestScaleMode(true);
  }, []);

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

  const handleProcessQueueItem = useCallback((item: ScanQueueItem) => {
    setActiveQueueScan(item);
    setScanQueueOpen(false);
  }, []);

  const handleQueueRecipeItems = useCallback(async (items: any[], instructions?: string, title?: string) => {
    await saveRecipe({
      name: title || 'Scanned Recipe',
      items,
      instructions: instructions || '',
      status: 'pending_validation' as any,
      isDirty: true,
    } as any);
    setActiveQueueScan(null);
    handleViewChange('resolution');
  }, [saveRecipe]);

  // Voice Command Handler
  const handleVoiceCommand = useCallback((cmd: string) => {
    console.log("Voice Command:", cmd);
    const lower = cmd.toLowerCase();

    // 1. Navigation
    if (lower.includes('dashboard')) handleViewChange('dashboard');
    else if (lower.includes('kitchen') || lower.includes('recipe')) handleViewChange('kitchen');
    else if (lower.includes('service') || lower.includes('dish')) handleViewChange('service');
    else if (lower.includes('stock')) handleViewChange('stock');
    else if (lower.includes('ingredient')) handleViewChange('ingredients');
    else if (lower.includes('settings')) handleViewChange('settings');
    
    // 2. Query Recipe: "How much [ingredient] in [recipe]"
    const queryMatch = lower.match(/how much (.+) in (?:my )?(.+?)(?: recipe)?$/);
    if (queryMatch) {
      const [_, ingName, recipeName] = queryMatch;
      const recipe = recipes.find(r => r.name.toLowerCase().includes(recipeName.trim()));
      if (recipe) {
        const targetIng = ingredients.find(i => i.name.toLowerCase().includes(ingName.trim()));
        if (targetIng) {
            const item = recipe.items.find(i => i.id === targetIng.id);
            if (item) speak(`${item.quantity} ${item.unit} of ${targetIng.name} in ${recipe.name}`);
            else speak(`No ${ingName} found in ${recipe.name}`);
        } else {
             speak(`Could not identify ingredient ${ingName}`);
        }
      } else {
        speak(`Recipe ${recipeName} not found`);
      }
      return;
    }

    // 3. Add to Stock: "Add [qty] [unit] [name] to stock"
    const stockMatch = lower.match(/add (\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+(.+) to stock/);
    if (stockMatch) {
        let [_, qtyStr, unitStr, name] = stockMatch;
        const qty = parseFloat(qtyStr);
        let unit = unitStr ? unitStr.trim() : '';
        if (unit === 'k' || unit === 'kilo') unit = 'kg'; // Normalize voice shorthand
        
        const ing = ingredients.find(i => i.name.toLowerCase().includes(name.trim()));
        if (ing) {
            const current = ing.stockLevel || 0;
            updateIngredient(ing.id, { stockLevel: current + qty });
            speak(`Added ${qty}${unit} ${ing.name}. New stock: ${current + qty}`);
        } else {
            speak(`Ingredient ${name} not found`);
        }
        return;
    }

    // 4. Add New Ingredient: "Add [name] to ingredients"
    const newIngMatch = lower.match(/add (.+) to ingredients/);
    if (newIngMatch) {
        const name = newIngMatch[1].trim();
        addIngredient({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            category: 'Uncategorized',
            suppliers: [],
            wastePercent: 0,
            allergens: [],
            kcalPer100: 0,
            stockLevel: 0,
            audited: false,
            incomplete: true
        });
        speak(`Created new ingredient: ${name}`);
        return;
    }

    // 5. Shopping List: "Add [name] to order"
    const orderMatch = lower.match(/add (.+) to (?:temp )?order/);
    if (orderMatch) setShoppingList(prev => [...prev, orderMatch[1].trim()]);

  }, [handleViewChange, recipes, ingredients, updateIngredient, addIngredient, speak]);

  const { isListening, lastTranscript, error: voiceError, toggleListening } = useVoiceCommand(handleVoiceCommand);

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
        <Navigation
          activeView={currentView}
          onViewChange={handleViewChange}
          scanQueueCount={scanQueue.length}
          onScanQueueClick={() => setScanQueueOpen(true)}
        />
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
            {currentView === 'stock' && <StockManager />}
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
                      onScaleRecipe={handleScaleRecipe}
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
                        startInScaleMode={requestScaleMode}
                        onScaleModeConsumed={() => setRequestScaleMode(false)}
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

        {/* Voice HUD (Option A) */}
        {shoppingList.length > 0 && (
            <div className="fixed bottom-24 right-6 z-[200] bg-[#111] border border-[#333] p-4 w-64 pointer-events-none">
                <h3 className="text-[#c8a96e] text-[10px] font-bold uppercase tracking-widest mb-2 border-b border-[#333] pb-1">Temp Order List</h3>
                <ul className="space-y-1">
                    {shoppingList.map((item, i) => (
                        <li key={i} className="text-[#888] text-[10px] font-mono uppercase">• {item}</li>
                    ))}
                </ul>
            </div>
        )}
        <div className="fixed bottom-6 right-6 z-[200] flex flex-col items-end gap-2 pointer-events-none">
            {voiceError && <div className="bg-red-900/90 text-white text-[10px] px-2 py-1 border border-red-500 font-mono uppercase">{voiceError}</div>}
            {isListening && lastTranscript && (
                 <div className="bg-[#111]/90 border border-[#c8a96e] text-[#c8a96e] text-[10px] px-3 py-2 font-mono uppercase tracking-widest animate-pulse">
                    {lastTranscript}
                 </div>
            )}
            <button 
                onClick={toggleListening}
                className={`pointer-events-auto w-12 h-12 flex items-center justify-center border transition-all duration-300 ${isListening ? 'bg-[#c8a96e] border-[#c8a96e] text-black shadow-[0_0_15px_rgba(200,169,110,0.3)]' : 'bg-[#111] border-[#333] text-[#666] hover:border-[#666] hover:text-[#888]'}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
            </button>
        </div>
      </div>

        {/* Scan Queue Panel */}
        {scanQueueOpen && (
          <ScanQueue
            items={scanQueue}
            onProcess={handleProcessQueueItem}
            onDismiss={dismissScanQueueItem}
            onClose={() => setScanQueueOpen(false)}
          />
        )}

        {/* Queue item scanners */}
        {activeQueueScan?.type === 'invoice' && (
          <InvoiceScanner
            initialImageUrl={activeQueueScan.imageUrl}
            queueItemId={activeQueueScan.id}
            onQueueItemDone={dismissScanQueueItem}
            onCancel={() => setActiveQueueScan(null)}
          />
        )}
        {activeQueueScan?.type === 'recipe' && (
          <OCRScanner
            initialImageUrl={activeQueueScan.imageUrl}
            queueItemId={activeQueueScan.id}
            onQueueItemDone={dismissScanQueueItem}
            onAddItems={handleQueueRecipeItems}
            onCancel={() => setActiveQueueScan(null)}
            onIngredientCreateRequest={() => {}}
          />
        )}
    </ConfirmationProvider>
  );
};

export default App;
