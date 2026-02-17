
import React, { useState } from 'react';

interface NavigationProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export const Navigation: React.FC<NavigationProps> = ({ activeView, onViewChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'service', label: 'DISH LIBRARY' },
    { id: 'kitchen', label: 'Recipe Library' },
    { id: 'ingredients', label: 'Master Ingredient List' },
    { id: 'settings', label: 'System Settings' },
  ];

  const handleNav = (id: string) => {
    onViewChange(id);
    setIsOpen(false);
  };

  return (
    <>
      {/* Top Bar */}
      <div className="h-12 border-b border-[#333333] bg-[#111111] flex items-center px-4 justify-between z-40 relative flex-shrink-0">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsOpen(true)} 
            className="text-[#e0e0e0] hover:text-[#c8a96e] transition-colors p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-xs font-bold uppercase tracking-[0.2em] text-[#c8a96e] cursor-pointer" onClick={() => handleNav('dashboard')}>
            King's Head <span className="text-[#666666]">Manager</span>
          </h1>
        </div>
        <div className="flex items-center gap-4">
           <div className="w-2 h-2 rounded-full bg-green-900 border border-green-500 animate-pulse"></div>
           <div className="text-[9px] font-mono text-[#444444]">V1.1.2</div>
        </div>
      </div>

      {/* Flyout Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-[2px]" onClick={() => setIsOpen(false)}>
           <div 
             className="absolute top-0 left-0 h-full w-72 bg-[#111111] border-r border-[#333333] shadow-2xl flex flex-col"
             onClick={e => e.stopPropagation()}
           >
              <div className="h-12 flex items-center px-4 border-b border-[#333333] justify-between flex-shrink-0">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#888888]">Menu</span>
                <button onClick={() => setIsOpen(false)} className="text-[#666666] hover:text-white p-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="flex-1 overflow-y-auto py-4">
                <div className="mb-6 px-4">
                  <div className="text-[9px] font-mono text-[#444444] uppercase mb-2">Modules</div>
                  <div className="space-y-1">
                    {menuItems.map(item => (
                      <button
                        key={item.id}
                        onClick={() => handleNav(item.id)}
                        className={`w-full text-left px-3 py-3 text-xs uppercase font-bold tracking-widest border border-transparent hover:border-[#333333] hover:bg-[#1c1c1c] transition-all duration-200 ${
                          activeView === item.id 
                            ? 'text-[#c8a96e] bg-[#1c1c1c] border-[#333333]' 
                            : 'text-[#888888]'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              
              <div className="p-4 border-t border-[#333333] flex-shrink-0">
                 <div className="text-[9px] font-mono text-[#444444]">
                   Logged in as <span className="text-[#888888]">Chef Admin</span>
                 </div>
              </div>
           </div>
        </div>
      )}
    </>
  );
};
