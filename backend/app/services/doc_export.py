"""Turns a document's markdown sections into PDF and PowerPoint files."""

from __future__ import annotations

import io
import re
from xml.sax.saxutils import escape

from pptx import Presentation
from pptx.util import Pt
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from .document_builder import KIND_LABEL

MAX_BULLETS_PER_SLIDE = 7
# The built-in PDF fonts have no glyphs for these.
REPLACEMENTS = {"→": "->", "←": "<-", "≤": "<=", "≥": ">=", "⇄": "<->", "−": "-"}


def _clean(text: str) -> str:
    for old, new in REPLACEMENTS.items():
        text = text.replace(old, new)
    return text


def _inline(text: str) -> str:
    """Markdown bold / italic / code to the small markup reportlab paragraphs understand."""
    out = escape(_clean(text.replace("\\|", "|")))
    out = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", out)
    out = re.sub(r"(?<![\w*])\*(?!\s)(.+?)\*(?![\w*])", r"<i>\1</i>", out)
    out = re.sub(r"(?<![\w_])_(?!\s)(.+?)_(?![\w_])", r"<i>\1</i>", out)
    return re.sub(r"`(.+?)`", r'<font face="Courier">\1</font>', out)


def _plain(text: str) -> str:
    """Markdown markers removed, for slides."""
    out = text.replace("\\|", "|")
    out = re.sub(r"\*\*(.+?)\*\*", r"\1", out)
    out = re.sub(r"(?<![\w*])\*(?!\s)(.+?)\*(?![\w*])", r"\1", out)
    out = re.sub(r"(?<![\w_])_(?!\s)(.+?)_(?![\w_])", r"\1", out)
    return re.sub(r"`(.+?)`", r"\1", out).strip()


def _cells(line: str) -> list[str]:
    return [c.strip() for c in re.split(r"(?<!\\)\|", line.strip()[1:-1])]


def _is_table_rule(line: str) -> bool:
    return bool(re.fullmatch(r"[\s|:\-]+", line)) and "-" in line


def _blocks(body: str) -> list[tuple[str, object]]:
    """Group markdown lines into heading / paragraph / bullets / numbers / table blocks."""
    blocks: list[tuple[str, object]] = []
    for raw in body.splitlines():
        line = raw.strip()
        if not line:
            blocks.append(("break", None))
        elif line.startswith("#"):
            blocks.append(("heading", line.lstrip("#").strip()))
        elif line.startswith("|") and line.endswith("|") and len(line) > 1:
            if _is_table_rule(line):
                continue
            if blocks and blocks[-1][0] == "table":
                blocks[-1][1].append(_cells(line))  # type: ignore[union-attr]
            else:
                blocks.append(("table", [_cells(line)]))
        elif re.match(r"^[-*•]\s+", line):
            text = re.sub(r"^[-*•]\s+", "", line)
            if blocks and blocks[-1][0] == "bullets":
                blocks[-1][1].append(text)  # type: ignore[union-attr]
            else:
                blocks.append(("bullets", [text]))
        elif re.match(r"^\d+\.\s+", line):
            text = re.sub(r"^\d+\.\s+", "", line)
            if blocks and blocks[-1][0] == "numbers":
                blocks[-1][1].append(text)  # type: ignore[union-attr]
            else:
                blocks.append(("numbers", [text]))
        else:
            blocks.append(("paragraph", line))
    return [b for b in blocks if b[0] != "break"]


def to_pdf(doc, project) -> bytes:
    sheet = getSampleStyleSheet()
    body_style = ParagraphStyle("DocBody", parent=sheet["BodyText"], fontSize=10, leading=14, spaceAfter=6)
    cell_style = ParagraphStyle("DocCell", parent=body_style, fontSize=8.5, leading=11, spaceAfter=0)
    width = A4[0] - 4 * cm

    client = (project.client or {}).get("name", "")
    story: list = [
        Paragraph(_inline(doc.title), sheet["Title"]),
        Paragraph(_inline(f"{KIND_LABEL.get(doc.kind, doc.kind)} · {client} · Version {doc.version} · {doc.status.replace('-', ' ').title()}"), body_style),
        Spacer(1, 12),
    ]
    for index, section in enumerate(doc.sections or [], start=1):
        story.append(Paragraph(_inline(f"{index}. {section['title']}"), sheet["Heading1"]))
        for kind, value in _blocks(section.get("body", "")):
            if kind == "heading":
                story.append(Paragraph(_inline(value), sheet["Heading3"]))
            elif kind == "paragraph":
                story.append(Paragraph(_inline(value), body_style))
            elif kind in ("bullets", "numbers"):
                items = [ListItem(Paragraph(_inline(t), body_style)) for t in value]
                story.append(ListFlowable(items, bulletType="bullet" if kind == "bullets" else "1", start="•" if kind == "bullets" else 1, leftIndent=14))
            elif kind == "table":
                columns = max(len(r) for r in value)
                rows = [[Paragraph(_inline(c), cell_style) for c in r + [""] * (columns - len(r))] for r in value]
                table = Table(rows, colWidths=[width / columns] * columns, repeatRows=1)
                table.setStyle(TableStyle([
                    ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
                    ("BACKGROUND", (0, 0), (-1, 0), colors.whitesmoke),
                    ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ]))
                story += [table, Spacer(1, 8)]

    buffer = io.BytesIO()
    SimpleDocTemplate(buffer, pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=2 * cm, bottomMargin=2 * cm, title=doc.title).build(story)
    return buffer.getvalue()


def _slide_lines(body: str) -> list[str]:
    lines: list[str] = []
    for kind, value in _blocks(body):
        if kind in ("heading", "paragraph"):
            lines.append(_plain(value))
        elif kind in ("bullets", "numbers"):
            lines += [_plain(t) for t in value]
        elif kind == "table":
            lines += [" · ".join(_plain(c) for c in row if _plain(c)) for row in value[1:]]  # the header row adds nothing on a slide
    return [line for line in lines if line]


def to_pptx(doc, project) -> bytes:
    prs = Presentation()
    title_slide = prs.slides.add_slide(prs.slide_layouts[0])
    title_slide.shapes.title.text = doc.title
    title_slide.placeholders[1].text = f"{(project.client or {}).get('name', '')} · Version {doc.version}"

    for section in doc.sections or []:
        lines = _slide_lines(section.get("body", "")) or [""]
        chunks = [lines[i:i + MAX_BULLETS_PER_SLIDE] for i in range(0, len(lines), MAX_BULLETS_PER_SLIDE)]
        for page, chunk in enumerate(chunks):
            slide = prs.slides.add_slide(prs.slide_layouts[1])
            slide.shapes.title.text = section["title"] + (" (continued)" if page else "")
            frame = slide.placeholders[1].text_frame
            frame.word_wrap = True
            for i, line in enumerate(chunk):
                paragraph = frame.paragraphs[0] if i == 0 else frame.add_paragraph()
                paragraph.text = line
                paragraph.font.size = Pt(20)

    buffer = io.BytesIO()
    prs.save(buffer)
    return buffer.getvalue()
