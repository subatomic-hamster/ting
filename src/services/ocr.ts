/** Reads text from a photo. AWS Textract replaces `localOcr` behind this interface. */
export interface OcrProvider {
  /** `confidence` is 0..1. */
  recognize(image: Blob): Promise<{ text: string; confidence: number }>;
}

/** Longest a photo may take to read before we stop and say so. */
export const OCR_TIMEOUT_MS = 60_000;

// Browser-only: tesseract.js is imported on first use so it never loads at app start or in tests.
export const localOcr: OcrProvider = {
  async recognize(image) {
    const { createWorker } = await import('tesseract.js');
    const base = window.TING_CONFIG?.ocrAssetBase;
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        // Stop the worker so it doesn't keep burning CPU after we gave up.
        void worker?.terminate().catch(() => undefined);
        reject(new Error('Reading the photo took too long (over a minute). Try a smaller or sharper photo, or paste the text instead.'));
      }, OCR_TIMEOUT_MS);
    });
    try {
      const read = (async () => {
        worker = await createWorker('eng', 1, base ? {
          workerPath: `${base}/worker.min.js`,
          corePath: base,
          langPath: base,
        } : {});
        const { data } = await worker.recognize(image);
        return { text: data.text, confidence: data.confidence / 100 };
      })();
      read.catch(() => undefined); // a late failure after the timeout must not become an unhandled rejection
      return await Promise.race([read, timeout]);
    } finally {
      clearTimeout(timer);
      await worker?.terminate().catch(() => undefined);
    }
  },
};
