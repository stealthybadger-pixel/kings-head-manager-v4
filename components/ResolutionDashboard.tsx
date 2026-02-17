
import React, { useState, useMemo } from 'react';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { Recipe, RecipeItem, Unit, Ingredient } from '../types';
import { parseRecipeContent, ParsedRecipe, ParsedIngredient } from '../utils/parser';
import { UI_STYLES, APPROVED_SUPPLIERS } from '../constants';
import { detectCategory, detectSupplierFromCategory, normalizeName } from '../utils/intelligence';
import { splitDocument, analyzeBulkCommit, executeBulkCommit, BulkCommitAnalysis } from '../services/batchProcessor';

export const ResolutionDashboard: React.FC = () => {
  const { recipes, ingredients, updateRecipeStatus, logUnresolvedIngredient, addIngredient, deleteRecipe, ingestRawRecipe } = useKitchenData();
  const { confirm } = useConfirmation();
  
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParsedRecipe | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [commitError, setCommitError] = useState<string | null>(null);
  
  // BULK COMMIT STATE
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkAnalysis, setBulkAnalysis] = useState<BulkCommitAnalysis | null>(null);
  const [bulkProgress, setBulkProgress] = useState(0); // 0-100
  
  // OPTIMISTIC EVICTION STATE
  // Tracks IDs that have been processed locally but might not have updated in Firestore snapshot yet
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());

  // ... (Existing Creation/Mapping/Splitter State) ...
  const [creationData, setCreationData] = useState<{
    isOpen: boolean;
    originalName: string;
    name: string;
    category: string;
    unit: Unit;
    supplier: string;
    packCost: number;
    packSize: number;
    isCase: boolean;
    error: string | null;
  }>({
    isOpen: false,
    originalName: '',
    name: '',
    category: 'Dry Store',
    unit: 'kg',
    supplier: 'Internal',
    packCost: 0,
    packSize: 1,
    isCase: false,
    error: null
  });

  const [mappingData, setMappingData] = useState<{
    isOpen: boolean;
    originalName: string;
    targetId: string;
    targetName: string;
    preserveNote: boolean;
    search: string;
  }>({
    isOpen: false,
    originalName: '',
    targetId: '',
    targetName: '',
    preserveNote: true,
    search: ''
  });

  const [splitterData, setSplitterData] = useState<{
    isOpen: boolean;
    recipeId: string;
    recipeName: string;
    content: string;
    delimiter: string;
    previewCount: number;
    previewChunks: string[];
  }>({
    isOpen: false,
    recipeId: '',
    recipeName: '',
    content: '',
    delimiter: '---',
    previewCount: 0,
    previewChunks: []
  });

  const pendingRecipes = useMemo(() => {
    return recipes.filter(r => 
      r.status === 'pending_validation' && 
      r.raw_text && 
      !processedIds.has(r.id)
    );
  }, [recipes, processedIds]);

  const selectedRecipe = useMemo(() => {
    return recipes.find(r => r.id === selectedRecipeId);
  }, [selectedRecipeId, recipes]);

  // --- EDIT & RESOLUTION LOGIC ---

  const handleNameChange = (index: number, newName: string) => {
    if (!parseResult) return;
    
    const updatedIngredients = [...parseResult.ingredients];
    const item = { ...updatedIngredients[index] };
    
    item.name = newName;
    
    // Live Match Check
    const normalized = normalizeName(newName).toLowerCase();
    const match = ingredients.find(i => normalizeName(i.name).toLowerCase() === normalized);
    
    item.matchedId = match ? match.id : undefined;
    updatedIngredients[index] = item;
    
    const matchedCount = updatedIngredients.filter(i => i.matchedId).length;
    
    setParseResult({
        ...parseResult,
        ingredients: updatedIngredients,
        matchRate: matchedCount / updatedIngredients.length
    });
  };

  const handleResetName = (index: number) => {
    if (!parseResult) return;
    const updatedIngredients = [...parseResult.ingredients];
    const item = { ...updatedIngredients[index] };
    item.name = item.originalName; // Revert to raw
    
    // Live Match Check for raw name
    const normalized = normalizeName(item.name).toLowerCase();
    const match = ingredients.find(i => normalizeName(i.name).toLowerCase() === normalized);
    
    item.matchedId = match ? match.id : undefined;
    updatedIngredients[index] = item;
    
    const matchedCount = updatedIngredients.filter(i => i.matchedId).length;
    setParseResult({
        ...parseResult,
        ingredients: updatedIngredients,
        matchRate: matchedCount / updatedIngredients.length
    });
  };

  // --- BULK COMMIT ACTIONS ---

  const handleOpenBulkCommit = () => {
    // 1. Analyze
    const analysis = analyzeBulkCommit(pendingRecipes, recipes, ingredients);
    setBulkAnalysis(analysis);
    setShowBulkModal(true);
    setBulkProgress(0);
  };

  const handleExecuteBulk = async () => {
    if (!bulkAnalysis) return;
    setIsProcessing(true);
    
    try {
      await executeBulkCommit(bulkAnalysis, (current, total) => {
        setBulkProgress((current / total) * 100);
      });
      
      // Post-Op Cleanup
      const affectedIds = bulkAnalysis.actions.map(a => a.pendingId);
      setProcessedIds(prev => {
        const next = new Set(prev);
        affectedIds.forEach(id => next.add(id));
        return next;
      });
      
      setTimeout(() => {
        setShowBulkModal(false);
        setBulkAnalysis(null);
        setIsProcessing(false);
        setBulkProgress(0);
      }, 1000);

    } catch (e) {
      console.error("Bulk commit failed", e);
      alert("Batch execution interrupted.");
      setIsProcessing(false);
    }
  };

  // ... (Existing Handlers: handleTestParse, handleOpenSplitter, handleSplitPreview, handleSplitCommit, getPreviewSnippet, handleOpenCreate, handleCreateSave, handleOpenMap, handleMapConfirm, handleCommit) ...

  const handleTestParse = () => {
    if (!selectedRecipe?.raw_text) return;
    const result = parseRecipeContent(selectedRecipe.raw_text, ingredients);
    setParseResult(result);
    setCommitError(null);
  };

  const handleOpenSplitter = (e: React.MouseEvent, recipe: Recipe) => {
    e.stopPropagation();
    setSplitterData({
      isOpen: true,
      recipeId: recipe.id,
      recipeName: recipe.name,
      content: recipe.raw_text || '',
      delimiter: '---',
      previewCount: 0,
      previewChunks: []
    });
  };

  const handleSplitPreview = () => {
    const parts = splitDocument(splitterData.content, splitterData.delimiter);
    setSplitterData(prev => ({ ...prev, previewCount: parts.length, previewChunks: parts }));
  };

  const handleSplitCommit = async () => {
    if (splitterData.previewChunks.length < 2) {
      alert("No split points confirmed. Please verify cuts first.");
      return;
    }
    const ok = await confirm(`Detected ${splitterData.previewChunks.length} recipes separated by ${splitterData.delimiter === 'WIDE_GAP' ? 'wide gaps' : 'markers'}.\nThis will delete the original file '${splitterData.recipeName}'.\nProceed with bulk extraction?`);
    if (!ok) return;

    setIsProcessing(true);
    try {
      setProcessedIds(prev => new Set(prev).add(splitterData.recipeId));
      if (selectedRecipeId === splitterData.recipeId) {
        setSelectedRecipeId(null);
        setParseResult(null);
      }
      await deleteRecipe(splitterData.recipeId);
      for (let i = 0; i < splitterData.previewChunks.length; i++) {
        const chunk = splitterData.previewChunks[i];
        const lines = chunk.split('\n').map(l => l.trim()).filter(l => l);
        const title = lines[0] ? lines[0].substring(0, 50) : `Split Part ${i+1}`;
        await ingestRawRecipe(chunk, title, `${splitterData.recipeName}_part_${i+1}`);
      }
      setSplitterData(prev => ({ ...prev, isOpen: false }));
    } catch (e) {
      console.error(e);
      alert("Split failed.");
      setProcessedIds(prev => { const next = new Set(prev); next.delete(splitterData.recipeId); return next; });
    } finally {
      setIsProcessing(false);
    }
  };

  const getPreviewSnippet = (text: string) => {
    const words = text.split(/\s+/);
    const start = words.slice(0, 5).join(' ');
    const end = words.slice(-5).join(' ');
    return { start, end };
  };

  const handleOpenCreate = (rawName: string) => {
    const detectedCat = detectCategory(rawName);
    const detectedSup = detectSupplierFromCategory(detectedCat);
    setCreationData({
      isOpen: true,
      originalName: rawName,
      name: rawName,
      category: detectedCat,
      unit: 'kg',
      supplier: detectedSup,
      packCost: 0,
      packSize: 1,
      isCase: false,
      error: null
    });
  };

  const handleCreateSave = async () => {
    const normalizedName = creationData.name.trim();
    if (!normalizedName) return;
    const exists = ingredients.find(i => i.name.toLowerCase() === normalizedName.toLowerCase());
    if (exists) {
      setCreationData(prev => ({ ...prev, error: `REGISTRY CONFLICT: "${exists.name}" already exists.` }));
      return;
    }
    try {
      const newIng = await addIngredient({
        name: normalizedName,
        category: creationData.category,
        suppliers: [{
          name: creationData.supplier,
          packCost: creationData.packCost,
          packSize: creationData.packSize,
          packUnit: creationData.unit,
          isPreferred: true,
          isCase: creationData.isCase
        }],
        wastePercent: 0,
        allergens: [],
        kcalPer100: 0,
        stockLevel: 0,
        incomplete: true,
        audited: true
      });
      if (parseResult) {
        const updatedIngredients = parseResult.ingredients.map(ing => {
          // Check against both originalName (for unmodified items) and current name (for edited items)
          if (ing.name === creationData.originalName || ing.name === normalizedName) {
            return { ...ing, matchedId: newIng.id, name: normalizedName, normalizedName: normalizedName.toLowerCase() };
          }
          return ing;
        });
        const matchedCount = updatedIngredients.filter(i => i.matchedId).length;
        setParseResult({ ...parseResult, ingredients: updatedIngredients, matchRate: matchedCount / updatedIngredients.length });
      }
      setCreationData(prev => ({ ...prev, isOpen: false }));
    } catch (e) {
      console.error(e);
      setCreationData(prev => ({ ...prev, error: "SYSTEM ERROR: WRITE FAILED" }));
    }
  };

  const handleOpenMap = (rawName: string) => {
    setMappingData({ isOpen: true, originalName: rawName, targetId: '', targetName: '', preserveNote: true, search: '' });
  };

  const handleMapConfirm = () => {
    if (!mappingData.targetId || !parseResult) return;
    const targetIng = ingredients.find(i => i.id === mappingData.targetId);
    if (!targetIng) return;
    const updatedIngredients = parseResult.ingredients.map(ing => {
      if (ing.name === mappingData.originalName) {
        return {
          ...ing,
          matchedId: targetIng.id,
          mappedNote: mappingData.preserveNote ? ing.name : undefined,
        };
      }
      return ing;
    });
    const matchedCount = updatedIngredients.filter(i => i.matchedId).length;
    setParseResult({ ...parseResult, ingredients: updatedIngredients, matchRate: matchedCount / updatedIngredients.length });
    setMappingData(prev => ({ ...prev, isOpen: false }));
  };

  const handleCommit = async () => {
    if (!selectedRecipe || !parseResult) return;
    // ... Single commit logic is now mostly superseded by bulk or smart check, but keeping for granular control
    // Adding Smart Check for Single Commit (Optional but good for consistency)
    const normalizedName = selectedRecipe.name.trim().toLowerCase();
    const existingActive = recipes.find(r => r.status === 'active' && r.name.toLowerCase() === normalizedName && r.id !== selectedRecipe.id);
    
    let targetId = selectedRecipe.id;
    let isMerge = false;

    if (existingActive) {
       const confirmMerge = await confirm(`An active recipe named "${existingActive.name}" already exists. Update it instead of creating a duplicate?`);
       if (confirmMerge) {
         targetId = existingActive.id;
         isMerge = true;
       }
    } else {
       const unresolvedCount = parseResult.ingredients.length - parseResult.ingredients.filter(i => i.matchedId).length;
       const ok = await confirm(`Confirming ${parseResult.ingredients.length} ingredients parsed.\n${unresolvedCount} require manual resolution.\nProceed to commit?`);
       if (!ok) return;
    }

    setIsProcessing(true);
    setCommitError(null);
    setProcessedIds(prev => new Set(prev).add(selectedRecipe.id));
    setSelectedRecipeId(null);
    setParseResult(null);

    try {
      const items: RecipeItem[] = parseResult.ingredients.map(p => {
         let note = p.mappedNote;
         if (!p.matchedId) {
            const missingLabel = `UNRESOLVED: ${p.name}`;
            note = note ? `${missingLabel} | ${note}` : missingLabel;
         }
         return {
           type: 'ingredient',
           id: p.matchedId || '',
           quantity: p.qty,
           unit: p.unit,
           notes: note || undefined
         };
      });

      const unresolved = parseResult.ingredients.filter(p => !p.matchedId);
      for (const item of unresolved) {
        await logUnresolvedIngredient(item.name, selectedRecipe.id);
      }

      const newStatus = unresolved.length > 0 ? 'needs_resolution' : 'active';
      const instructions = parseResult.method.join('\n\n');
      
      await updateRecipeStatus(targetId, newStatus, items, instructions);
      
      if (isMerge) {
         await deleteRecipe(selectedRecipe.id);
      }
      
    } catch (e: any) {
      console.error("Commit failed", e);
      setCommitError(`COMMIT FAILED: ${e.message}`);
      setProcessedIds(prev => { const next = new Set(prev); next.delete(selectedRecipe.id); return next; });
    } finally {
      setIsProcessing(false);
    }
  };

  const matchRate = parseResult ? parseResult.matchRate * 100 : 0;
  const isPerfectMatch = matchRate === 100;
  const CATEGORIES = ['Dry Store', 'Vegetable', 'Fruit', 'Meat', 'Fish', 'Dairy', 'Frozen', 'Alcohol', 'Non-Food'];

  const mappingCandidates = useMemo(() => {
    if (!mappingData.search) return [];
    const term = mappingData.search.toLowerCase();
    return ingredients.filter(i => i.name.toLowerCase().includes(term)).slice(0, 10);
  }, [ingredients, mappingData.search]);

  const unitCost = creationData.packCost && creationData.packSize ? (creationData.packCost / creationData.packSize) : 0;

  return (
    <div className="flex h-full bg-[#111111] overflow-hidden relative">
      
      {/* BULK CONFIRMATION MODAL */}
      {showBulkModal && bulkAnalysis && (
        <div className="fixed inset-0 z-[80] bg-black/90 flex items-center justify-center p-8">
           <div className="w-full max-w-lg bg-[#111] border border-[#c8a96e] shadow-2xl flex flex-col">
              <div className="p-4 border-b border-[#333] bg-[#1c1c1c]">
                 <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#c8a96e]">Batch Resolution Protocol</h3>
                 <p className="text-[10px] text-[#666] font-mono mt-1">CONFIRMATION_REQUIRED</p>
              </div>
              
              <div className="p-6 space-y-6">
                 <p className="text-sm text-[#e0e0e0] font-sans leading-relaxed">
                    You are about to update <strong className="text-[#c8a96e]">{bulkAnalysis.stats.update}</strong> existing records and create <strong className="text-white">{bulkAnalysis.stats.create}</strong> new ones.
                 </p>
                 
                 <div className="border border-[#333] p-4 bg-[#0d0d0d] font-mono text-[10px]">
                    <div className="flex justify-between mb-2">
                       <span className="text-[#888]">TARGET_SCOPE:</span>
                       <span className="text-white">{bulkAnalysis.actions.length} FILES</span>
                    </div>
                    <div className="flex justify-between mb-2">
                       <span className="text-[#888]">OPERATION_TYPE:</span>
                       <span className="text-[#c8a96e]">WRITE_BATCH (ATOMIC)</span>
                    </div>
                    <div className="flex justify-between">
                       <span className="text-[#888]">STAGING_ACTION:</span>
                       <span className="text-red-500">EVICT_ON_SUCCESS</span>
                    </div>
                 </div>

                 {isProcessing && (
                    <div className="w-full h-4 bg-[#333333] border border-[#333333]">
                       <div className="h-full bg-[#c8a96e] transition-all duration-300" style={{ width: `${bulkProgress}%` }}></div>
                    </div>
                 )}
              </div>

              <div className="p-4 border-t border-[#333] bg-[#1c1c1c] flex justify-end gap-4">
                 <button 
                   onClick={() => setShowBulkModal(false)}
                   disabled={isProcessing}
                   className="px-6 py-3 border border-[#333] text-[#888] text-[10px] font-bold uppercase tracking-widest hover:text-white disabled:opacity-50"
                 >
                   Abort
                 </button>
                 <button 
                   onClick={handleExecuteBulk}
                   disabled={isProcessing}
                   className="px-6 py-3 bg-[#c8a96e] text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#b8985e] disabled:opacity-50"
                 >
                   {isProcessing ? `EXECUTING (${Math.round(bulkProgress)}%)...` : 'PROCEED'}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* SPLITTER MODAL (Keep Existing) */}
      {splitterData.isOpen && (
        <div className="fixed inset-0 z-[60] bg-[#000000cc] flex items-center justify-center">
          {/* ... existing splitter modal content ... */}
          <div className="w-full max-w-4xl h-[80vh] bg-[#111111] border border-[#333] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-[#333] flex justify-between items-center bg-[#1c1c1c]">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-[0.2em] text-white">Document Splitter</h3>
                <p className="text-[10px] text-[#666] font-mono mt-1">SOURCE: {splitterData.recipeName}</p>
              </div>
              <button onClick={() => setSplitterData(prev => ({...prev, isOpen: false}))} className="text-[#666] hover:text-white">Close [X]</button>
            </div>
            {/* ... Rest of Splitter Modal ... */}
            <div className="flex-1 flex flex-col p-6 gap-4 overflow-hidden">
               <div className="flex items-center gap-4">
                  <label className={UI_STYLES.label}>Split Method</label>
                  <input type="text" value={splitterData.delimiter} onChange={(e) => setSplitterData(prev => ({ ...prev, delimiter: e.target.value, previewChunks: [] }))} placeholder="Enter Marker (e.g. ---)" className="bg-[#0d0d0d] border border-[#333] text-[#c8a96e] px-3 py-1 font-mono text-xs w-48 outline-none focus:border-[#c8a96e]" />
                  <button onClick={() => setSplitterData(prev => ({ ...prev, delimiter: 'WIDE_GAP', previewChunks: [] }))} className={`text-[9px] font-bold uppercase px-3 py-1 border transition-all ${splitterData.delimiter === 'WIDE_GAP' ? 'bg-[#c8a96e] text-black border-[#c8a96e]' : 'border-[#333] text-[#666] hover:text-white'}`}>Auto-Detect Wide Gaps</button>
               </div>
               <div className="flex-1 border border-[#333] bg-[#0d0d0d] relative flex flex-col overflow-hidden">
                  {splitterData.previewChunks.length > 0 ? (
                    <div className="flex-1 overflow-y-auto">
                       <div className="p-4 bg-[#111] text-[10px] text-[#666] font-mono uppercase border-b border-[#333] flex justify-between items-center">
                          <span>Preview: {splitterData.previewCount} Segments</span>
                          <button onClick={() => setSplitterData(prev => ({ ...prev, previewChunks: [], previewCount: 0 }))} className="text-[#c8a96e] hover:underline">Edit Raw Text</button>
                       </div>
                       {splitterData.previewChunks.map((chunk, i) => (
                           <div key={i}><div className="p-4"><div className="text-[9px] font-bold text-[#c8a96e] uppercase mb-2">Segment #{i+1}</div><div className="text-[10px] font-mono text-[#aaa] leading-relaxed">"{getPreviewSnippet(chunk).start} ... {getPreviewSnippet(chunk).end}"</div></div>{i < splitterData.previewChunks.length - 1 && <div className="h-px bg-[#c8a96e] mx-4 my-2 opacity-50"></div>}</div>
                       ))}
                    </div>
                  ) : (
                    <textarea value={splitterData.content} onChange={(e) => setSplitterData(prev => ({ ...prev, content: e.target.value }))} className="flex-1 w-full bg-transparent p-4 text-xs font-mono text-[#aaa] outline-none resize-none leading-relaxed" spellCheck={false} placeholder="Paste document..." />
                  )}
               </div>
            </div>
            <div className="p-4 border-t border-[#333] bg-[#1c1c1c] flex justify-end gap-4">
               {splitterData.previewChunks.length === 0 ? (
                 <button onClick={handleSplitPreview} className="px-6 py-2 border border-[#c8a96e] text-[#c8a96e] text-[10px] font-bold uppercase tracking-widest hover:bg-[#c8a96e] hover:text-black transition-all">Verify Cuts</button>
               ) : (
                 <button onClick={handleSplitCommit} className="px-6 py-2 bg-[#c8a96e] text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#b8985e] transition-all">Confirm & Extract</button>
               )}
            </div>
          </div>
        </div>
      )}

      {/* MAPPING MODAL (Keep Existing) */}
      {mappingData.isOpen && (
        <div className="fixed inset-0 z-50 bg-[#000000cc] flex items-center justify-center">
          {/* ... existing content ... */}
          <div className="w-full max-w-md bg-[#111111] border border-[#c8a96e] p-6 shadow-2xl flex flex-col gap-6">
             <div className="border-b border-[#333] pb-2"><h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#c8a96e]">Map to Registry</h3><p className="text-[10px] text-[#666] font-mono mt-1">LINKING: "{mappingData.originalName}"</p></div>
             <div className="space-y-4">
                <div><label className={UI_STYLES.label}>Search Master Ingredient</label><input autoFocus value={mappingData.search} onChange={(e) => setMappingData(prev => ({ ...prev, search: e.target.value }))} placeholder="Type to search..." className={`w-full ${UI_STYLES.input} rounded-none border-b-0`} /><div className="border border-[#333] max-h-40 overflow-y-auto bg-[#0d0d0d]">{mappingCandidates.map(ing => (<div key={ing.id} onClick={() => setMappingData(prev => ({ ...prev, targetId: ing.id, targetName: ing.name, search: ing.name }))} className={`p-2 text-[10px] uppercase font-mono cursor-pointer hover:bg-[#c8a96e] hover:text-black ${mappingData.targetId === ing.id ? 'bg-[#c8a96e] text-black' : 'text-[#aaa]'}`}>{ing.name}</div>))}</div></div>
                <div className="flex items-center gap-3 p-3 border border-[#333] bg-[#1c1c1c]"><input type="checkbox" checked={mappingData.preserveNote} onChange={(e) => setMappingData(prev => ({ ...prev, preserveNote: e.target.checked }))} className="accent-[#c8a96e]" /><div className="flex flex-col"><span className="text-[10px] font-bold uppercase text-[#e0e0e0]">Preserve Original Text?</span></div></div>
             </div>
             <div className="flex gap-3 pt-2"><button onClick={() => setMappingData(prev => ({...prev, isOpen: false}))} className="flex-1 py-3 border border-[#333] text-[#888] text-[10px] font-bold uppercase tracking-widest hover:bg-[#1c1c1c] rounded-none">Cancel</button><button onClick={handleMapConfirm} disabled={!mappingData.targetId} className="flex-1 py-3 bg-[#c8a96e] text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#b8985e] disabled:opacity-50 rounded-none border border-transparent">Confirm Link</button></div>
          </div>
        </div>
      )}

      {/* CREATION MODAL (Keep Existing) */}
      {creationData.isOpen && (
        <div className="fixed inset-0 z-50 bg-[#000000cc] flex items-center justify-center backdrop-blur-none">
          {/* ... existing content ... */}
          <div className="w-full max-w-md bg-[#111111] border border-[#c8a96e] p-6 shadow-2xl flex flex-col gap-6 relative">
             <div className="flex justify-between items-start border-b border-[#333] pb-2"><div><h3 className="text-sm font-bold uppercase tracking-[0.2em] text-[#c8a96e]">Promote to Registry</h3></div><button onClick={() => setCreationData(prev => ({...prev, isOpen: false}))} className="text-[#666] hover:text-white">X</button></div>
             {creationData.error && <div className="bg-red-950/20 border border-red-900 p-3"><span className="text-[10px] text-red-500 font-bold uppercase">{creationData.error}</span></div>}
             <div className="space-y-4">
                <div><label className={UI_STYLES.label}>Master Ingredient Name</label><input autoFocus value={creationData.name} onChange={(e) => setCreationData(prev => ({...prev, name: e.target.value, error: null}))} className={`w-full ${UI_STYLES.input}`} /></div>
                <div><label className={UI_STYLES.label}>Category</label><select value={creationData.category} onChange={(e) => setCreationData(prev => ({...prev, category: e.target.value}))} className={`w-full ${UI_STYLES.input}`}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className={UI_STYLES.label}>Pack Config</label><div className="border border-[#333] bg-[#111]"><div className="border-b border-[#333]"><select value={creationData.supplier} onChange={(e) => setCreationData(prev => ({...prev, supplier: e.target.value}))} className="w-full bg-transparent p-3 text-xs font-mono text-[#e0e0e0] outline-none">{APPROVED_SUPPLIERS.map(s => <option key={s} value={s}>{s}</option>)}</select></div><div className="border-b border-[#333]"><input type="number" placeholder="[PRICE]" value={creationData.packCost || ''} onChange={(e) => setCreationData(prev => ({...prev, packCost: parseFloat(e.target.value)}))} className="w-full bg-transparent p-3 text-xs font-mono text-[#e0e0e0] outline-none" /></div><div className="grid grid-cols-2 border-b border-[#333] divide-x divide-[#333]"><input type="number" placeholder="[QTY]" value={creationData.packSize || ''} onChange={(e) => setCreationData(prev => ({...prev, packSize: parseFloat(e.target.value)}))} className="w-full bg-transparent p-3 text-xs font-mono text-[#e0e0e0] outline-none" /><select value={creationData.unit} onChange={(e) => setCreationData(prev => ({...prev, unit: e.target.value as Unit}))} className="w-full bg-transparent p-3 text-xs font-mono text-[#e0e0e0] outline-none"><option value="kg">kg</option><option value="g">g</option><option value="ea">ea</option></select></div><div className="p-3 flex items-center gap-3 bg-[#0d0d0d]"><input type="checkbox" checked={creationData.isCase} onChange={(e) => setCreationData(prev => ({...prev, isCase: e.target.checked}))} className="accent-[#C8A96E]" /><span className="text-[10px] uppercase font-bold text-[#666]">Case?</span>{unitCost > 0 && <div className="ml-auto text-[9px] font-mono text-[#c8a96e]">£{unitCost.toFixed(4)}/{creationData.unit}</div>}</div></div></div>
             </div>
             <div className="flex gap-3 pt-2"><button onClick={() => setCreationData(prev => ({...prev, isOpen: false}))} className="flex-1 py-3 border border-[#333] text-[#888] text-[10px] font-bold uppercase tracking-widest hover:bg-[#1c1c1c] rounded-none">Cancel</button><button onClick={handleCreateSave} disabled={!creationData.name} className="flex-1 py-3 bg-[#c8a96e] text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#b8985e] disabled:opacity-50 rounded-none border border-transparent">Save & Map</button></div>
          </div>
        </div>
      )}

      {/* Sidebar List */}
      <div className="w-80 border-r border-[#333333] flex flex-col bg-[#0d0d0d]">
        <div className="p-4 border-b border-[#333333]">
          <h2 className="text-xs font-bold uppercase tracking-widest text-[#c8a96e]">Pending Resolution</h2>
          <div className="text-[10px] text-[#666] font-mono mt-1">{pendingRecipes.length} FILES QUEUED</div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {pendingRecipes.length === 0 ? (
             <div className="p-8 text-center flex flex-col items-center gap-2">
                <div className="w-2 h-2 bg-[#c8a96e] rounded-full animate-pulse mb-2"></div>
                <div className="text-[10px] text-[#c8a96e] font-bold uppercase tracking-widest border border-[#c8a96e] px-2 py-1">[SYSTEM: ALL RECIPES RESOLVED]</div>
                <div className="text-[8px] text-[#666] font-mono">NO PENDING ACTIONS</div>
             </div>
          ) : (
            <>
            {pendingRecipes.slice(0, 20).map(r => (
              <div 
                key={r.id}
                onClick={() => { setSelectedRecipeId(r.id); setParseResult(null); }}
                className={`p-4 border-b border-[#333] cursor-pointer hover:bg-[#1c1c1c] transition-colors group ${selectedRecipeId === r.id ? 'bg-[#1c1c1c] border-l-2 border-l-[#c8a96e]' : 'border-l-2 border-l-transparent'}`}
              >
                <div className="text-xs font-bold text-[#e0e0e0] uppercase truncate mb-1 flex justify-between items-center">
                  <span>{r.name}</span>
                  <button onClick={(e) => handleOpenSplitter(e, r)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-[#c8a96e]" title="Split Document"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" /></svg></button>
                </div>
                <div className="flex justify-between items-center">
                   <div className="text-[8px] font-mono text-[#666] uppercase">{r.source_filename || 'MANUAL_INPUT'}</div>
                   <div className="text-[8px] font-mono text-[#444]">{new Date(r.updatedAt || '').toLocaleDateString()}</div>
                </div>
              </div>
            ))}
            {pendingRecipes.length > 20 && (
                <div className="p-4 text-center text-[10px] text-[#666] font-mono border-b border-[#333] bg-[#111]">
                    + {pendingRecipes.length - 20} MORE PENDING ITEMS
                </div>
            )}
            </>
          )}
        </div>
        {pendingRecipes.length > 0 && (
           <div className="p-4 border-t border-[#333]">
              <button 
                onClick={handleOpenBulkCommit}
                className="w-full py-3 bg-[#c8a96e] text-black text-[10px] font-bold uppercase tracking-widest hover:bg-[#b8985e] transition-all border border-transparent"
              >
                AUTO-RESOLVE ALL [{pendingRecipes.length}]
              </button>
           </div>
        )}
      </div>

      {/* Main Workspace */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#111111]">
        {!selectedRecipe ? (
          <div className="flex-1 flex items-center justify-center text-[#444] font-mono text-[10px] uppercase tracking-widest">
            Select a file to initiate extraction
          </div>
        ) : (
          <>
            <div className="p-4 border-b border-[#333333] bg-[#1c1c1c] flex justify-between items-center">
               <div>
                 <h3 className="text-sm font-bold uppercase tracking-widest text-white">{selectedRecipe.name}</h3>
                 <div className="text-[9px] font-mono text-[#666] uppercase mt-1">RAW_TEXT_SIZE: {selectedRecipe.raw_text?.length || 0} CHARS</div>
               </div>
               <div className="flex gap-4">
                 {!parseResult && (
                    <button onClick={handleTestParse} className="px-6 py-2 border border-[#c8a96e] text-[#c8a96e] text-[10px] font-bold uppercase tracking-widest hover:bg-[#c8a96e] hover:text-black transition-all">Test Parse</button>
                 )}
                 {parseResult && (
                   <button onClick={handleCommit} disabled={isProcessing} className={`px-6 py-2 bg-[#005f73] text-white text-[10px] font-bold uppercase tracking-widest hover:bg-[#004a5d] transition-all disabled:opacity-50`}>{isProcessing ? 'COMMITTING...' : 'COMMIT EXTRACTION'}</button>
                 )}
               </div>
            </div>

            {commitError && (
              <div className="p-4 bg-[#1c1c1c] border-b border-[#c8a96e]">
                 <div className="border border-[#c8a96e] p-2 text-[#c8a96e] font-mono text-xs font-bold uppercase">{commitError}</div>
              </div>
            )}

            <div className="flex-1 flex overflow-hidden">
               <div className="flex-1 border-r border-[#333333] flex flex-col min-w-[300px]">
                 <div className="p-2 bg-[#0d0d0d] border-b border-[#333333] text-[9px] font-bold text-[#666] uppercase tracking-widest">Source Text</div>
                 <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] text-[#888] whitespace-pre-wrap leading-relaxed">{selectedRecipe.raw_text}</div>
               </div>

               <div className="flex-[1.5] flex flex-col bg-[#111111] overflow-hidden">
                  {!parseResult ? (
                    <div className="flex-1 flex items-center justify-center text-[#333] font-mono text-[10px] uppercase">NO PARSE DATA</div>
                  ) : (
                    <div className={`flex flex-col h-full border-[2px] transition-colors ${isPerfectMatch ? 'border-[#c8a96e]' : 'border-[#333333]'}`}>
                      <div className={`p-2 flex justify-between items-center text-[9px] font-bold uppercase tracking-widest text-black ${isPerfectMatch ? 'bg-[#c8a96e]' : 'bg-[#333333] text-[#888]'}`}>
                         <span>EXTRACTION STATUS: {isPerfectMatch ? 'OPTIMAL' : 'RESOLUTION_REQUIRED'}</span>
                         <span>MATCH_RATE: {matchRate.toFixed(1)}%</span>
                      </div>
                      <div className="p-2 border-b border-[#333333] flex justify-end">
                         <button onClick={() => setShowJson(!showJson)} className="text-[8px] font-mono text-[#666] hover:text-white uppercase underline">{showJson ? 'HIDE_JSON' : 'VIEW_RAW_JSON'}</button>
                      </div>
                      <div className="flex-1 overflow-y-auto">
                        {showJson ? (
                           <pre className="p-4 text-[9px] font-mono text-[#c8a96e] overflow-auto">{JSON.stringify(parseResult, null, 2)}</pre>
                        ) : (
                           <div className="flex flex-col h-full">
                              <div className="flex-1 overflow-y-auto">
                                <table className="w-full text-left border-collapse">
                                  <thead className="bg-[#1c1c1c] border-b border-[#333333]">
                                    <tr>
                                      <th className="p-2 text-[8px] font-bold text-[#666] uppercase border-r border-[#333]">QTY</th>
                                      <th className="p-2 text-[8px] font-bold text-[#666] uppercase border-r border-[#333]">UNIT</th>
                                      <th className="p-2 text-[8px] font-bold text-[#666] uppercase border-r border-[#333]">EXTRACTED NAME</th>
                                      <th className="p-2 text-[8px] font-bold text-[#666] uppercase">DB MATCH</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-[#222]">
                                    {parseResult.ingredients.map((ing, idx) => (
                                      <tr key={idx} className={`hover:bg-[#1a1a1a] ${!ing.matchedId ? 'bg-red-950/10' : ''}`}>
                                        <td className="p-2 text-[10px] font-mono text-white border-r border-[#333] text-right">{ing.qty}</td>
                                        <td className="p-2 text-[10px] font-mono text-[#888] border-r border-[#333]">{ing.unit}</td>
                                        <td className="p-2 text-[10px] font-mono text-white border-r border-[#333]">
                                          {ing.originalName !== ing.name && <div className="text-[#888] line-through text-[9px] mb-0.5">{ing.originalName}</div>}
                                          <div className="flex items-center gap-2 group/edit">
                                            <input 
                                                type="text" 
                                                value={ing.name}
                                                onChange={(e) => handleNameChange(idx, e.target.value)}
                                                className="bg-transparent border border-[#333333] text-[#C8A96E] px-2 py-1 w-full outline-none focus:border-[#C8A96E] text-[10px] font-mono transition-colors rounded-none"
                                            />
                                            {ing.name !== ing.originalName && (
                                                <button 
                                                    onClick={() => handleResetName(idx)}
                                                    title="Reset to raw text"
                                                    className="text-[#333] hover:text-[#C8A96E] opacity-0 group-hover/edit:opacity-100 transition-all"
                                                >
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                                </button>
                                            )}
                                          </div>
                                          {ing.mappedNote && <div className="text-[8px] text-[#c8a96e] mt-0.5 font-bold">NOTE: "{ing.mappedNote}"</div>}
                                        </td>
                                        <td className="p-2">
                                          {ing.matchedId ? <span className="text-[9px] font-bold text-[#c8a96e] uppercase tracking-wider">VERIFIED</span> : (
                                            <div className="flex items-center gap-2">
                                              <span className="text-[9px] font-bold text-red-500 uppercase tracking-wider">UNRESOLVED</span>
                                              <div className="flex gap-1">
                                                <button onClick={() => handleOpenCreate(ing.name)} className="px-2 py-0.5 border border-red-900 bg-red-900/20 text-[8px] font-bold text-red-400 uppercase hover:bg-red-900 hover:text-white transition-all">+ Create</button>
                                                <button onClick={() => handleOpenMap(ing.name)} className="px-2 py-0.5 border border-[#333] bg-[#1a1a1a] text-[8px] font-bold text-[#888] uppercase hover:bg-[#333] hover:text-white transition-all">Link</button>
                                              </div>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                                {parseResult.method.length > 0 && (
                                  <div className="p-4 border-t border-[#333]">
                                     <h4 className="text-[9px] font-bold text-[#666] uppercase mb-2">EXTRACTED METHOD</h4>
                                     <div className="space-y-2">{parseResult.method.map((line, i) => (<p key={i} className="text-[10px] font-mono text-[#aaa] leading-relaxed">{line}</p>))}</div>
                                  </div>
                                )}
                              </div>
                           </div>
                        )}
                      </div>
                    </div>
                  )}
               </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
