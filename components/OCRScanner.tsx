
import React, { useState, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { useKitchenData } from '../hooks/useKitchenData';
import { RecipeItem, Unit } from '../types';
import { UI_STYLES } from '../constants';

interface OCRScannerProps {
  onSuccess: (recipe: { name: string, batchSize: number, batchUnit: Unit, items: RecipeItem[], instructions: string }) => void;
  onCancel: () => void;
}

export const OCRScanner: React.FC<OCRScannerProps> = ({ onSuccess, onCancel }) => {
  const { ingredients } = useKitchenData();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async () => {
    if (!previewUrl) return;

    setIsProcessing(true);
    setError(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = previewUrl.split(',')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: 'image/png',
                data: base64Data,
              },
            },
            {
              text: `You are a professional chef. Extract recipe information from this image. 
              Match the ingredients as closely as possible to this master list of available ingredients: ${ingredients.map(i => i.name).join(', ')}.
              
              If an ingredient in the image is not in the master list, still include it but use the name from the image.
              Quantities must be numbers. Units must be one of: g, ml, kg, l, ea.
              
              Try to identify the batch yield (total amount the recipe makes).
              
              Format the output as a JSON object with the following structure:
              {
                "name": "Recipe Name",
                "batchSize": 1,
                "batchUnit": "kg",
                "ingredients": [
                  { "name": "Ingredient Name", "quantity": 100, "unit": "g" }
                ],
                "instructions": "Step by step method text"
              }`
            },
          ],
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              batchSize: { type: Type.NUMBER },
              batchUnit: { type: Type.STRING },
              ingredients: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    quantity: { type: Type.NUMBER },
                    unit: { type: Type.STRING }
                  },
                  required: ["name", "quantity", "unit"]
                }
              },
              instructions: { type: Type.STRING }
            },
            required: ["name", "ingredients", "instructions", "batchSize", "batchUnit"]
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      
      // Map extracted ingredients back to IDs from our database
      const mappedItems: RecipeItem[] = result.ingredients.map((item: any) => {
        const matchedIng = ingredients.find(ing => 
          ing.name.toLowerCase() === item.name.toLowerCase() || 
          item.name.toLowerCase().includes(ing.name.toLowerCase())
        );

        return {
          type: 'ingredient',
          ingredientId: matchedIng ? matchedIng.id : 'ghost-' + Math.random().toString(36).substr(2, 9),
          quantity: item.quantity,
          unit: ['g', 'ml', 'kg', 'l', 'ea'].includes(item.unit) ? item.unit as Unit : 'g'
        };
      });

      onSuccess({
        name: result.name,
        batchSize: result.batchSize,
        batchUnit: ['g', 'ml', 'kg', 'l', 'ea'].includes(result.batchUnit) ? result.batchUnit as Unit : 'kg',
        items: mappedItems,
        instructions: result.instructions
      });

    } catch (err: any) {
      console.error("OCR Error:", err);
      setError("Failed to process image. Please try a clearer photo.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-[100] p-4 backdrop-blur-sm">
      <div className={`w-full max-w-xl ${UI_STYLES.panel} bg-[#1c1c1c] shadow-2xl`}>
        <div className="p-4 border-b border-[#333333] flex justify-between items-center">
          <h3 className="text-xs font-bold uppercase tracking-widest text-[#c8a96e]">Recipe Vision Scan</h3>
          <button onClick={onCancel} className="text-[#666666] hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-8 flex flex-col items-center gap-6">
          {!previewUrl ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-full h-64 border-2 border-dashed border-[#333333] flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-[#222] transition-colors group"
            >
              <svg className="w-12 h-12 text-[#444] group-hover:text-[#c8a96e] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#666]">Upload or Capture Recipe</div>
            </div>
          ) : (
            <div className="relative w-full group">
              <img src={previewUrl} className="w-full h-64 object-contain bg-black border border-[#333333]" alt="Preview" />
              {!isProcessing && (
                <button 
                  onClick={() => setPreviewUrl(null)}
                  className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded hover:bg-black transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          )}

          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            className="hidden" 
          />

          {error && <div className="text-[10px] font-bold text-[#ff4d4d] uppercase tracking-widest text-center">{error}</div>}

          <div className="w-full flex gap-3">
             <button 
              onClick={onCancel}
              disabled={isProcessing}
              className={`${UI_STYLES.button} flex-1 border border-[#333333] text-[#888888] disabled:opacity-30`}
            >
              Abort
            </button>
            <button 
              onClick={processImage}
              disabled={!previewUrl || isProcessing}
              className={`${UI_STYLES.button} flex-1 bg-[#c8a96e] text-black hover:bg-[#b8985e] disabled:opacity-30 flex items-center justify-center gap-2`}
            >
              {isProcessing ? (
                <>
                  <div className="w-3 h-3 border-2 border-black/20 border-t-black animate-spin rounded-full"></div>
                  Digitizing...
                </>
              ) : (
                'Confirm & Extract'
              )}
            </button>
          </div>
        </div>

        <div className="p-4 bg-[#111] border-t border-[#333333] text-center">
          <p className="text-[9px] font-mono text-[#444] uppercase leading-relaxed tracking-tighter">
            Powered by Gemini Intelligence • 0-Cost Compute Layer
          </p>
        </div>
      </div>
    </div>
  );
};
