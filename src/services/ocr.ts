/** Reads text from a photo. AWS Textract replaces `localOcr` behind this interface. */
export interface OcrProvider {
  /** `confidence` is 0..1. */
  recognize(image: Blob): Promise<{ text: string; confidence: number }>;
}

// Browser-only: tesseract.js is imported on first use so it never loads at app start or in tests.
export const localOcr: OcrProvider = {
  async recognize(image) {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng');
    try {
      const { data } = await worker.recognize(image);
      return { text: data.text, confidence: data.confidence / 100 };
    } finally {
      await worker.terminate();
    }
  },
};
