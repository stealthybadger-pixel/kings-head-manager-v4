
import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useKitchenData } from '../hooks/useKitchenData';
import { useConfirmation } from '../hooks/useConfirmation';
import { extractTextFromFile } from '../utils/textExtractor';
import { UI_STYLES } from '../constants';

interface PendingFile {
  id: string;
  name: string;
  size: number;
  content: string;
  status: 'ready' | 'uploading' | 'complete' | 'error';
}

export const RawIngestionEngine: React.FC = () => {
  const { ingestRawRecipe, batchIngestFiles } = useKitchenData();
  const { confirm } = useConfirmation();
  
  const [activeTab, setActiveTab] = useState<'text' | 'file'>('text');
  const [rawText, setRawText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [commitProgress, setCommitProgress] = useState(0);
  const [statusLog, setStatusLog] = useState<string[]>([]);
  
  // File Upload State
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const addLog = (msg: string) => {
    setStatusLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));
  };

  const handleTextIngest = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    try {
      await ingestRawRecipe(rawText, `Manual Paste ${new Date().toLocaleString()}`);
      addLog('SUCCESS: Text payload ingested to pending_validation.');
      setRawText('');
    } catch (e) {
      console.error(e);
      addLog('ERROR: Ingestion failed.');
    } finally {
      setIsProcessing(false);
    }
  };

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsProcessing(true);
    addLog(`BUFFERING: Analyzing ${acceptedFiles.length} inbound files...`);
    
    try {
      const newFiles: PendingFile[] = [];

      for (const file of acceptedFiles) {
        try {
          const text = await extractTextFromFile(file);
          newFiles.push({
            id: `${file.name}-${Date.now()}-${Math.random()}`,
            name: file.name,
            size: file.size,
            content: text,
            status: 'ready'
          });
          // Avoid flooding log for large drops, just log summary at end
        } catch (e) {
          console.error(e);
          addLog(`ERROR: Failed to read ${file.name}.`);
        }
      }
      
      addLog(`BUFFER COMPLETE: ${newFiles.length} files staged for commitment.`);
      setPendingFiles(prev => [...prev, ...newFiles]);
    } catch (e) {
      console.error("Critical Drop Error", e);
      addLog("CRITICAL: Dropzone handler failed.");
    } finally {
      setIsProcessing(false);
    }
  }, []);

  const handleCommitFiles = async () => {
    const readyFiles = pendingFiles.filter(f => f.status === 'ready');
    if (readyFiles.length === 0) {
      addLog("ABORT: No ready files to commit.");
      return;
    }

    const ok = await confirm(`Confirming upsert of ${readyFiles.length} recipe files. Existing source_filenames will be updated. Proceed?`);
    if (!ok) return;

    setIsProcessing(true);
    setCommitProgress(0);
    addLog(`COMMITTING: upsert batch operation started...`);

    try {
      // Execute Batch
      await batchIngestFiles(
        readyFiles.map(f => ({ name: f.name, content: f.content })),
        (percent, logs) => {
           setCommitProgress(percent);
           // Stream logs into terminal
           logs.forEach(l => addLog(l));
        }
      );

      // Successful Completion Logic
      const processedIds = new Set(readyFiles.map(f => f.id));
      setPendingFiles(prev => prev.filter(p => !processedIds.has(p.id))); // Evict successfully processed files
      addLog("BATCH OPERATION COMPLETE: All files synced.");

    } catch (err) {
      console.error("Batch Commit Error", err);
      addLog("CRITICAL: Batch operation failed. See console.");
    } finally {
      setIsProcessing(false);
      setCommitProgress(0);
    }
  };

  const handleClearFiles = () => {
    if (pendingFiles.length === 0) return;
    setPendingFiles([]);
    addLog('BUFFER CLEARED: Staging area reset.');
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/json': ['.json'],
      'text/markdown': ['.md'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx']
    } 
  });

  const readyCount = pendingFiles.filter(f => f.status === 'ready').length;
  const isCommitDisabled = isProcessing || readyCount === 0;

  return (
    <div className="flex flex-col h-full bg-[#111111] p-6 text-[#C8A96E] font-mono">
      <div className="border-b border-[#333333] pb-4 mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.3em] text-[#C8A96E]">Raw Ingestion Engine</h2>
          <p className="text-[10px] text-[#666] mt-1">DUMB_PIPE_PROTOCOL // V1.1 MULTI-THREAD</p>
        </div>
        <div className="flex border border-[#333333]">
          <button 
            onClick={() => setActiveTab('text')}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'text' ? 'bg-[#C8A96E] text-black' : 'text-[#666] hover:text-[#888]'}`}
          >
            Text Stream
          </button>
          <button 
            onClick={() => setActiveTab('file')}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest border-l border-[#333333] transition-all ${activeTab === 'file' ? 'bg-[#C8A96E] text-black' : 'text-[#666] hover:text-[#888]'}`}
          >
            File Batch
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-6 overflow-hidden">
        {activeTab === 'text' ? (
          <div className="flex-1 flex flex-col gap-4">
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="// PASTE RAW RECIPE DATA HERE..."
              className="flex-1 bg-[#1c1c1c] border border-[#333333] p-4 text-[#C8A96E] text-xs font-mono outline-none resize-none placeholder-[#444]"
              spellCheck={false}
            />
            <div className="flex justify-end">
              <button
                onClick={handleTextIngest}
                disabled={isProcessing || !rawText.trim()}
                className="px-8 py-3 border border-[#C8A96E] text-[#C8A96E] text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-[#C8A96E] hover:text-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isProcessing ? 'INGESTING...' : 'INGEST PAYLOAD'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-6 overflow-hidden">
            <div 
              {...getRootProps()} 
              className={`h-40 border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${isDragActive ? 'border-[#C8A96E] bg-[#C8A96E]/10 border-solid' : 'border-[#333333] hover:border-[#C8A96E] hover:border-solid hover:bg-[#1c1c1c]'}`}
            >
              <input {...getInputProps()} />
              <div className="text-4xl text-[#C8A96E] mb-2 font-thin">+</div>
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#e0e0e0] mb-1">Drop Raw Files Here</div>
              <div className="text-[9px] font-mono text-[#666] uppercase">.TXT .MD .JSON .DOCX</div>
            </div>

            <div className="flex-1 border border-[#333333] bg-[#0d0d0d] flex flex-col overflow-hidden">
              <div className="p-2 border-b border-[#333333] flex justify-between items-center bg-[#1c1c1c]">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#888]">Staging Buffer ({pendingFiles.length})</span>
                {pendingFiles.length > 0 && (
                  <button onClick={handleClearFiles} className="text-[9px] text-red-500 hover:text-white uppercase font-bold">Clear All</button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {pendingFiles.length === 0 && (
                  <div className="h-full flex items-center justify-center text-[10px] text-[#444] font-mono uppercase tracking-widest">
                    Buffer Empty // Awaiting Input
                  </div>
                )}
                {pendingFiles.map(file => (
                  <div key={file.id} className="flex items-center justify-between p-2 bg-[#161616] border border-[#333333] group">
                    <div className="flex items-center gap-4">
                      <span className={`text-[10px] font-mono ${file.status === 'complete' ? 'text-green-500' : file.status === 'error' ? 'text-red-500' : 'text-[#e0e0e0]'}`}>
                        {file.name}
                      </span>
                      <span className="text-[9px] text-[#666] font-mono">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                    <span className="text-[9px] font-bold uppercase tracking-widest">
                      {file.status === 'ready' && <span className="text-[#C8A96E]">READY</span>}
                      {file.status === 'uploading' && <span className="text-[#C8A96E] animate-pulse">UPLOADING...</span>}
                      {file.status === 'complete' && <span className="text-green-500">SYNCED</span>}
                      {file.status === 'error' && <span className="text-red-500">FAILED</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex flex-col items-end gap-2">
              <button
                onClick={handleCommitFiles}
                disabled={isCommitDisabled}
                className={`px-8 py-3 text-[10px] font-bold uppercase tracking-[0.2em] transition-all border ${
                  isCommitDisabled
                    ? 'bg-[#111111] text-[#333333] border-[#333333] cursor-not-allowed'
                    : 'bg-[#C8A96E] text-black border-[#C8A96E] hover:bg-[#b8985e]'
                }`}
              >
                {isProcessing ? `COMMITTING ${commitProgress}%...` : `COMMIT ${readyCount} FILES TO SKELETON`}
              </button>
              {isCommitDisabled && !isProcessing && (
                <span className="text-[9px] font-mono text-[#444] uppercase tracking-wider">
                  {pendingFiles.length > 0 ? 'NO READY FILES' : 'BUFFER EMPTY: DROP FILES TO PROCEED'}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="h-48 border-t border-[#333333] bg-[#0d0d0d] p-2 overflow-y-auto font-mono text-[9px] flex flex-col-reverse">
          {statusLog.length === 0 && <span className="text-[#444] self-end w-full">SYSTEM_IDLE...</span>}
          {statusLog.map((log, i) => (
            <div key={i} className="text-[#888] mb-1 border-b border-[#222] pb-1 last:border-0">{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
};
