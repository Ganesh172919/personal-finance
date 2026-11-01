import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createSOPSamplePdf(): void {
  const doc = new PDFDocument({ size: "A4", margin: 54 });
  const outputPath = path.join(__dirname, "../../../docs/SOP_Sample_Template.pdf");

  const stream = fs.createWriteStream(outputPath);
  doc.pipe(stream);

  doc.fontSize(22).fillColor("#111827").text("Statement of Purpose", { align: "center" });
  doc.fontSize(14).fillColor("#4b5563").text("Sample Template (For Reference Only)", { align: "center" });
  doc.moveDown(1);

  doc.fontSize(12).fillColor("#111827").text("Applicant Information");
  doc.moveDown(0.3);
  doc.fontSize(11).fillColor("#374151").text("Applicant Name: [Your Full Name]");
  doc.text("Student ID: [Your ID]");
  doc.text("Institution: [Your College/University]");
  doc.text("Program: [Your Degree/Program]");
  doc.moveDown(1);

  const sections = [
    {
      title: "Introduction",
      content: "I am [Your Name], a [Year] year [Degree] student at [Institution], specializing in [Your Specialization]. With a strong foundation in [relevant field], I am eager to explore the intersection of technology and personal finance through the FinWise project."
    },
    {
      title: "Motivation",
      content: "My interest in financial technology stems from [specific reason/experience]. The FinWise platform's innovative approach to AI-powered personal finance management, particularly its multi-agent reasoning system and real-time financial insights, aligns perfectly with my goal of [career aspiration]. I believe that democratizing financial literacy through technology can significantly impact how individuals manage their finances."
    },
    {
      title: "Relevant Skills & Experience",
      content: "During my academic journey, I have developed proficiency in [list 2-3 key skills]. My experience with [specific project/course/certification] has equipped me with [specific skill relevant to the project]. For instance, I [brief description of a relevant project or achievement]. Additionally, my coursework in [relevant courses] has strengthened my understanding of [relevant concepts]."
    },
    {
      title: "Project Understanding",
      content: "FinWise stands out for its comprehensive approach to personal finance management. The platform's features—from envelope-based budgeting to AI-driven conversation insights—demonstrate a deep understanding of user needs. I am particularly fascinated by the [specific feature, e.g., multi-agent AI system, what-if scenarios, or financial story generation] and its potential to transform how users interact with their financial data."
    },
    {
      title: "Learning Objectives & Contribution",
      content: "Through this project, I aim to [specific learning goal]. My background in [your skill] will allow me to contribute effectively to [specific area of the project]. I bring [unique perspective/skill] that will complement the team's work on [specific component]."
    },
    {
      title: "Conclusion",
      content: "I am committed to dedicating my time and effort to the success of the FinWise project. I look forward to the opportunity to learn from peers and mentors while contributing meaningfully to this innovative platform."
    }
  ];

  sections.forEach((section, index) => {
    if (index > 0) {
      doc.moveDown(0.8);
    }
    
    doc.fontSize(12).fillColor("#111827").text(section.title);
    doc.moveDown(0.2);
    doc.fontSize(11).fillColor("#374151").text(section.content, {
      lineGap: 3,
      align: "left"
    });
  });

  doc.moveDown(1.5);
  doc.fontSize(10).fillColor("#6b7280").text("Important Notes:", { underline: true });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor("#6b7280").text("• This is a sample template only — do not copy content directly");
  doc.text("• Adapt the structure and content to reflect your genuine experiences");
  doc.text("• Ensure your SOP is authentic and personal");
  doc.text("• Stay within the 500-word limit");
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor("#9ca3af").text("Word Count: ~380 words (Template Reference)", { align: "center" });

  doc.end();

  stream.on("finish", () => {
    console.log(`SOP Sample PDF generated: ${outputPath}`);
  });

  stream.on("error", (err) => {
    console.error("Error generating PDF:", err);
  });
}

createSOPSamplePdf();
