"""Render the reviewed Markdown report as six full, readable A4 pages."""
from __future__ import annotations

import json
import re
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph, Spacer, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "docs" / "DEPLOYMENT_READINESS.md"
OUTPUT = ROOT / "output" / "pdf" / "personal-finance-project-report.pdf"
WIDTH, HEIGHT = A4
MARGIN = 40
TOP, BOTTOM = HEIGHT - 74, 48
BODY_WIDTH = WIDTH - MARGIN * 2


def safe(text: str) -> str:
    text = text.replace("\u2014", " - ").replace("\u2013", "-").replace("\u2011", "-")
    text = text.replace("\u2019", "'").replace("\u201c", '"').replace("\u201d", '"')
    return escape(text)


def blocks(markdown: str, size: float):
    body = ParagraphStyle("body", fontName="Helvetica", fontSize=size, leading=size * 1.36,
                          textColor=colors.HexColor("#202b3c"), alignment=TA_LEFT, spaceAfter=8)
    heading = ParagraphStyle("heading", parent=body, fontName="Helvetica-Bold", fontSize=size + 1.6,
                             leading=size * 1.55, textColor=colors.HexColor("#174b91"), spaceBefore=7, spaceAfter=5)
    title = ParagraphStyle("title", parent=body, fontName="Helvetica-Bold", fontSize=size + 5,
                           leading=size * 1.7, textColor=colors.HexColor("#172b4d"), spaceAfter=10)
    cell = ParagraphStyle("cell", parent=body, fontSize=max(8.4, size - 1.5), leading=size * 1.12, spaceAfter=0)
    lines = markdown.strip().splitlines()
    story = []
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        if line.startswith("|"):
            rows = []
            while index < len(lines) and lines[index].strip().startswith("|"):
                row = [part.strip() for part in lines[index].strip().strip("|").split("|")]
                if not all(re.fullmatch(r"[-:]+", part or "-") for part in row):
                    rows.append([Paragraph(safe(part), cell) for part in row])
                index += 1
            table = Table(rows, colWidths=[BODY_WIDTH / len(rows[0])] * len(rows[0]), hAlign="LEFT")
            table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#e8eff8")),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#c6d3e3")),
                ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
                ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            story.extend([table, Spacer(1, 8)])
            continue
        if line.startswith("## "):
            story.append(Paragraph(safe(line[3:]), heading))
        elif line.startswith("# "):
            story.append(Paragraph(safe(line[2:]), title))
        else:
            paragraph = [line]
            while index + 1 < len(lines) and lines[index + 1].strip() and not lines[index + 1].startswith(("#", "|")):
                index += 1
                paragraph.append(lines[index].strip())
            story.append(Paragraph(safe(" ".join(paragraph)), body))
        index += 1
    return story


def measure(story):
    return sum(item.wrap(BODY_WIDTH, 10000)[1] + item.getSpaceBefore() + item.getSpaceAfter() for item in story)


def main():
    # Keep incoming planning appendices separate from verified release evidence.
    report = SOURCE.read_text(encoding="utf-8").split("<!-- report-end -->", 1)[0]
    pages = report.split("<!-- page -->")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=A4)
    pdf.setTitle("Personal Finance Project - Improvement and Test Report")
    pdf.setAuthor("Personal Finance Project")
    metrics = []
    for number, page in enumerate(pages, 1):
        chosen = None
        # Use the largest comfortable type that fits, filling each page with
        # substantive content instead of a separate, mostly empty cover page.
        for step in range(125, 91, -1):
            size = step / 10
            story = blocks(page, size)
            height = measure(story)
            if height <= TOP - BOTTOM:
                chosen = (size, story, height)
                break
        if chosen is None:
            raise ValueError(f"Page {number} overflows even at minimum readable type")
        size, story, height = chosen
        if height / (TOP - BOTTOM) < 0.80:
            raise ValueError(f"Page {number} needs more content; only {height:.0f} points used")
        pdf.setFillColor(colors.HexColor("#174b91"))
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(MARGIN, HEIGHT - 31, "PERSONAL FINANCE PROJECT")
        pdf.setFillColor(colors.HexColor("#526176"))
        pdf.setFont("Helvetica", 9)
        pdf.drawRightString(WIDTH - MARGIN, HEIGHT - 31, "31 October 2026 | Development report")
        pdf.setStrokeColor(colors.HexColor("#b8c9de"))
        pdf.line(MARGIN, HEIGHT - 43, WIDTH - MARGIN, HEIGHT - 43)
        y = TOP
        for item in story:
            y -= item.getSpaceBefore()
            _, h = item.wrap(BODY_WIDTH, 10000)
            y -= h
            item.drawOn(pdf, MARGIN, y)
            y -= item.getSpaceAfter()
        if y < BOTTOM - 0.5:
            raise ValueError(f"Page {number} crosses footer")
        pdf.setFont("Helvetica", 8)
        pdf.setFillColor(colors.HexColor("#526176"))
        pdf.drawString(MARGIN, 26, "Local verification; staging and external services require final checks.")
        pdf.drawRightString(WIDTH - MARGIN, 26, f"Page {number} of {len(pages)}")
        metrics.append({"page": number, "font_size": size, "body_fill_pct": round(height / (TOP - BOTTOM) * 100, 1)})
        pdf.showPage()
    pdf.save()
    print(json.dumps({"output": str(OUTPUT), "pages": metrics}, indent=2))


if __name__ == "__main__":
    main()
