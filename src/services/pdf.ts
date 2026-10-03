/** Extracts the text layer of each PDF page (digital PDFs only; scans go through OCR). */
export async function pdfText(file: Blob | ArrayBuffer): Promise<{ pages: string[] }> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href;
  const data = new Uint8Array(file instanceof Blob ? await file.arrayBuffer() : file);
  const task = pdfjs.getDocument({ data });
  try {
    const doc = await task.promise;
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = '';
      let lastY: number | undefined;
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const y: number = item.transform[5];
        // A new baseline without hasEOL (table rows, positioned text) is still a new line.
        if (lastY !== undefined && Math.abs(y - lastY) > item.height / 2 && !text.endsWith('\n')) text += '\n';
        else if (text && !text.endsWith('\n') && !text.endsWith(' ') && item.str) text += ' ';
        text += item.str;
        if (item.hasEOL) text += '\n';
        lastY = y;
      }
      pages.push(text.trim());
    }
    return { pages };
  } finally {
    await task.destroy();
  }
}
