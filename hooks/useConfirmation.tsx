
import React, { createContext, useContext, useState, useCallback } from 'react';
import { UI_STYLES, COLORS } from '../constants';

interface ConfirmationContextType {
  confirm: (message: string) => Promise<boolean>;
}

const ConfirmationContext = createContext<ConfirmationContextType | undefined>(undefined);

export const ConfirmationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [modal, setModal] = useState<{ message: string; resolve: (val: boolean) => void } | null>(null);

  const confirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setModal({ message, resolve });
    });
  }, []);

  const handleChoice = (choice: boolean) => {
    if (modal) {
      modal.resolve(choice);
      setModal(null);
    }
  };

  return (
    <ConfirmationContext.Provider value={{ confirm }}>
      {children}
      {modal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]">
          <div className={`p-8 w-full max-w-sm ${UI_STYLES.panel} bg-[#1c1c1c]`}>
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#888888] mb-4">Confirmation Required</h3>
            <p className="text-sm mb-8 leading-relaxed font-sans">{modal.message}</p>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => handleChoice(false)}
                className={`${UI_STYLES.button} border border-[#333333] text-[#888888] hover:bg-[#333333] hover:text-white`}
              >
                Cancel
              </button>
              <button
                onClick={() => handleChoice(true)}
                className={`${UI_STYLES.button} border border-[#ff4d4d] text-[#ff4d4d] hover:bg-[#ff4d4d] hover:text-white`}
              >
                Are you sure?
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmationContext.Provider>
  );
};

export const useConfirmation = () => {
  const context = useContext(ConfirmationContext);
  if (!context) throw new Error("useConfirmation must be used within a ConfirmationProvider");
  return context;
};
