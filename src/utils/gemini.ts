// Shared client for the two Gemini vision features (Invoice Scanner, recipe scan)
// — one place for the model name, retry behaviour, and image prep so a fix to one
// (e.g. the gemini-1.5-flash -> gemini-3.5-flash retirement) doesn't need repeating.

// Tried in order — gemini-3.5-flash is the primary model, but its image-processing
// path in particular has been seen returning a genuine Google-side 503 ("high demand")
// for extended stretches, not just a one-off blip. Falls back to gemini-2.5-flash
// (an older, likely less demand-contended model) rather than failing the scan outright.
const GEMINI_MODELS = ['gemini-3.5-flash', 'gemini-2.5-flash'];
const MAX_IMAGE_DIMENSION = 1600; // px — plenty for OCR-quality text extraction
const JPEG_QUALITY = 0.85;
const RETRYABLE_STATUSES = new Set([503, 429]);
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1500;

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Downscales an image file to at most MAX_IMAGE_DIMENSION on its longest side and
// re-encodes as JPEG, cutting the bytes sent to Gemini (cost + upload time) with no
// meaningful loss for text-extraction purposes. PDFs are passed through untouched —
// canvas can't rasterize them, and Gemini accepts application/pdf natively already.
export async function prepareImageForGemini(file: File): Promise<{ base64: string; mimeType: string }> {
  if (file.type === 'application/pdf') {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { base64, mimeType: 'application/pdf' };
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = dataUrl;
  });

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    // Canvas unavailable for some reason — fall back to the original file rather than fail the scan.
    return { base64: dataUrl.split(',')[1], mimeType: file.type || 'image/jpeg' };
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const compressedDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  return { base64: compressedDataUrl.split(',')[1], mimeType: 'image/jpeg' };
}

async function callGeminiModel(model: string, key: string, prompt: string, base64Image: string, mimeType: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Image } }] }],
        // 'low' thinking is plenty for straightforward extraction tasks like this —
        // the model can't fully disable its hidden reasoning step, but this avoids
        // paying for deep multi-step reasoning it doesn't need here.
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'low' } }
      })
    }
  );

  if (!response.ok) {
    const error = new Error(`Gemini API error: ${response.status}`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const data = await response.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// Tries each model in GEMINI_MODELS in order, retrying transient errors (503
// overloaded, 429 rate-limited) a couple of times per model before moving on to the
// next — anything else (bad key, bad request) fails immediately rather than wasting
// the same error across every model.
export async function callGeminiVision(prompt: string, base64Image: string, mimeType: string): Promise<string> {
  const key = localStorage.getItem('geminiApiKey');
  if (!key) throw new Error('No Gemini API key set. Add it in Settings.');

  let lastError: Error | null = null;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAY_MS * attempt);

      try {
        return await callGeminiModel(model, key, prompt, base64Image, mimeType);
      } catch (err) {
        const error = err as Error & { status?: number };
        lastError = error;
        const isRetryable = error.status !== undefined && RETRYABLE_STATUSES.has(error.status);
        if (!isRetryable) break; // move on to the next model immediately, don't burn retries on a non-transient error
      }
    }
  }

  throw lastError ?? new Error('Gemini request failed');
}

export function parseGeminiJson<T>(text: string): T {
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(cleaned) as T;
}
