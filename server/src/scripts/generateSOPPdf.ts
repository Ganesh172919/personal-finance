import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface SOPSection {
  title: string;
  content: string;
}

function createSOPFrameworkPdf(): void {
  const doc = new PDFDocument({ size: "A4", margin: 54 });
  const outputPath = path.join(__dirname, "../../../docs/SOP_Submission_Framework.pdf");

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(22).fillColor("#111827").text("Statement of Purpose (SOP)", { align: "center" });
  doc.fontSize(16).fillColor("#4b5563").text("Submission Framework", { align: "center" });
  doc.moveDown(0.5);
  doc.fontSize(10).fillColor("#6b7280").text("FinWise - AI-Powered Personal Finance Platform", { align: "center" });
  doc.moveDown(1);

  const sections: SOPSection[] = [
    {
      title: "Overview",
      content: `All registered students are required to submit a Statement of Purpose (SOP) in PDF format. The SOP should be within 500 words. This document outlines the framework and guidelines for SOP submission.`
    },
    {
      title: "Submission Requirements",
      content: `• Format: PDF only (.pdf)
• Word Limit: Maximum 500 words
• File Naming: SOP_YourName_StudentID.pdf
• Submission Portal: To be communicated to shortlisted participants`
    },
    {
      title: "SOP Structure",
      content: `Students must address the following sections in their SOP:

1. Introduction (50-75 words)
   - Brief introduction about yourself
   - Your current academic background and institution
   - Your area of study/specialization

2. Motivation (100-125 words)
   - Why are you interested in this Personal Finance project?
   - What drew you to the intersection of technology and finance?
   - How does this project align with your career aspirations?

3. Relevant Skills & Experience (100-125 words)
   - Technical skills you bring (programming, data analysis, AI/ML, etc.)
   - Previous projects or experiences related to finance or technology
   - Any certifications, courses, or achievements relevant to this domain

4. Project Understanding (100-125 words)
   - Demonstrate your understanding of the FinWise platform
   - Which features or components interest you most?
   - How do you envision AI-powered personal finance tools transforming financial literacy?

5. Learning Objectives & Contribution (100-125 words)
   - What do you hope to learn from this project?
   - How will you contribute to the team?
   - What unique perspective or skills will you bring?

6. Conclusion (50 words)
   - Summarize your enthusiasm and commitment
   - Your availability and dedication to the project`
    },
    {
      title: "Evaluation Criteria",
      content: `SOPs will be evaluated based on:

• Clarity of thought and writing: 20%
• Understanding of the project domain: 25%
• Relevant skills and experience: 25%
• Motivation and career alignment: 15%
• Originality and authenticity: 15%`
    },
    {
      title: "Tips for a Strong SOP",
      content: `1. Be Authentic — Write in your own voice; avoid generic templates
2. Be Specific — Reference specific features of FinWise (multi-agent AI, budgeting tools, etc.)
3. Show, Don't Tell — Use examples from your experience rather than vague claims
4. Stay Within Limit — Adhere strictly to the 500-word limit
5. Proofread — Check for grammar, spelling, and formatting errors
6. Be Concise — Every sentence should add value`
    },
    {
      title: "Important Notes",
      content: `• SOP must be entirely your own work
• Plagiarism or use of AI-generated content without disclosure will result in disqualification
• All submissions will be checked for originality
• Specific deadlines will be communicated separately`
    }
  ];

  sections.forEach((section, index) => {
    if (index > 0) {
      doc.moveDown(1);
    }
    
    doc.fontSize(14).fillColor("#111827").text(section.title);
    doc.moveDown(0.3);
    doc.fontSize(11).fillColor("#374151").text(section.content, {
      lineGap: 4,
      align: "left"
    });
  });

  doc.moveDown(1);
  doc.fontSize(9).fillColor("#6b7280").text(
    "This framework will be communicated to shortlisted participants at a later stage.",
    { align: "center" }
  );

  doc.end();

  stream.on("finish", () => {
    console.log(`SOP Framework PDF generated: ${outputPath}`);
  });

  stream.on("error", (err) => {
    console.error("Error generating PDF:", err);
  });
}

createSOPFrameworkPdf();
