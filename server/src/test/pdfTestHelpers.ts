import PDFDocument from "pdfkit";

/** Real PDFs keep parser/page-number regressions visible without provider calls. */
export const createTextPdf = (pages: string[]): Promise<Buffer> => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ autoFirstPage: false });
  const buffers: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => buffers.push(chunk));
  doc.on("error", reject);
  doc.on("end", () => resolve(Buffer.concat(buffers)));
  for (const text of pages) {
    doc.addPage();
    if (text) doc.fontSize(11).text(text);
  }
  doc.end();
});
