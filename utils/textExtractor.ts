
import mammoth from 'mammoth';

export async function extractTextFromFile(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase();

  // Word Documents
  if (extension === 'docx') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (e) {
      console.error("Mammoth extraction failed", e);
      return `[SYSTEM ERROR: FAILED TO EXTRACT TEXT FROM ${file.name}]`;
    }
  }

  // JSON Files (Beautify for readability in raw_text)
  if (extension === 'json') {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      return JSON.stringify(json, null, 2);
    } catch (e) {
      return await file.text(); // Fallback to raw text if parse fails
    }
  }

  // Standard Text / Markdown
  return await file.text();
}
