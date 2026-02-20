import React, { useMemo } from 'react';
import { ScanQueueItem } from '../hooks/useKitchenData';

interface ScanQueueProps {
  items: ScanQueueItem[];
  onProcess: (item: ScanQueueItem) => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

function formatAge(ts: any): string {
  if (!ts) return '';
  const ms = typeof ts.toMillis === 'function' ? ts.toMillis() : Date.now();
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export const ScanQueue: React.FC<ScanQueueProps> = ({ items, onProcess, onDismiss, onClose }) => {
  const scanUrl = useMemo(() => {
    const { protocol, hostname, port } = window.location;
    const p = port || (protocol === 'https:' ? '443' : '80');
    return `${protocol}//${hostname}:${p}/scan.html`;
  }, []);

  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(scanUrl)}&bgcolor=111111&color=c8a96e&format=png&qzone=1`;

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 backdrop-blur-[2px] flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-sm h-full bg-[#111] border-l border-[#333] flex flex-col font-mono shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="h-12 border-b border-[#333] flex items-center px-4 justify-between flex-shrink-0">
          <span className="text-[10px] font-bold text-[#c8a96e] uppercase tracking-[0.2em]">Scan Queue</span>
          <button onClick={onClose} className="text-[#555] hover:text-white p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* QR / URL section */}
          <div className="p-4 border-b border-[#222]">
            <div className="text-[9px] text-[#555] uppercase tracking-widest mb-3">Scan from Mobile</div>
            <div className="flex gap-3 items-start">
              <img
                src={qrSrc}
                alt="QR code"
                className="w-[90px] h-[90px] flex-shrink-0 border border-[#333]"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[8px] text-[#444] uppercase mb-1">Point your phone camera at the QR code, or open:</div>
                <div className="text-[9px] text-[#c8a96e] break-all leading-relaxed">{scanUrl}</div>
                <button
                  onClick={() => navigator.clipboard?.writeText(scanUrl)}
                  className="mt-2 text-[8px] text-[#555] border border-[#333] px-2 py-1 hover:text-[#888] hover:border-[#555] transition-colors uppercase tracking-widest"
                >
                  Copy URL
                </button>
              </div>
            </div>
          </div>

          {/* Queue items */}
          <div className="p-4">
            <div className="text-[9px] text-[#555] uppercase tracking-widest mb-3">
              Pending — {items.length} item{items.length !== 1 ? 's' : ''}
            </div>

            {items.length === 0 ? (
              <div className="py-10 text-center text-[#333] text-[9px] uppercase tracking-widest">
                Queue is empty
              </div>
            ) : (
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="border border-[#2a2a2a] bg-[#0d0d0d] overflow-hidden">
                    {/* Thumbnail */}
                    {item.imageUrl && (
                      <div className="h-28 bg-black overflow-hidden relative">
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="w-full h-full object-cover opacity-60"
                        />
                        <div className="absolute top-2 left-2">
                          <span className={`text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 ${
                            item.type === 'invoice'
                              ? 'bg-blue-900/80 text-blue-300 border border-blue-700'
                              : 'bg-amber-900/80 text-amber-300 border border-amber-700'
                          }`}>
                            {item.type}
                          </span>
                        </div>
                        <div className="absolute top-2 right-2 text-[7px] text-[#666] uppercase">
                          {formatAge(item.uploadedAt)}
                        </div>
                      </div>
                    )}

                    {/* Meta */}
                    <div className="px-3 py-2">
                      {item.note && (
                        <div className="text-[9px] text-[#888] mb-2 leading-relaxed">{item.note}</div>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => onProcess(item)}
                          className="flex-1 py-2 bg-[#c8a96e] text-black text-[9px] font-bold uppercase tracking-widest hover:bg-[#e0c080] transition-colors"
                        >
                          Process
                        </button>
                        <button
                          onClick={() => onDismiss(item.id)}
                          className="px-3 py-2 border border-[#333] text-[#555] text-[9px] uppercase tracking-widest hover:border-[#666] hover:text-[#888] transition-colors"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
