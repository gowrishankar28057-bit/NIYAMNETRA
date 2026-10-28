"""Generators for synthetic sample documents (seed data, demo uploads, tests).

Every generated file carries a visible "synthetic sample" notice. None of them is,
or imitates, a document issued by AICTE or any university.
"""

import io

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

NOTICE = "SYNTHETIC SAMPLE FOR NEYAMNETRA DEMONSTRATION - NOT ISSUED BY AICTE OR ANY UNIVERSITY"


def sample_pdf(title, lines, footer=None):
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    c.setTitle(title)
    c.setAuthor("NeyamNetra demo generator")
    c.setFillColor(HexColor("#0b2a5b"))
    c.rect(0, height - 70, width, 70, fill=1, stroke=0)
    c.setFillColor(HexColor("#ffffff"))
    c.setFont("Helvetica-Bold", 15)
    c.drawString(40, height - 42, title)
    c.setFont("Helvetica", 8)
    c.drawString(40, height - 58, NOTICE)
    c.setFillColor(HexColor("#111827"))
    y = height - 110
    for line in lines:
        if line == "":
            y -= 10
            continue
        bold = line.startswith("## ")
        text = line[3:] if bold else line
        c.setFont("Helvetica-Bold" if bold else "Helvetica", 11 if bold else 10.5)
        c.drawString(48, y, text)
        y -= 18
    c.saveState()
    c.setFillColor(Color(0.8, 0.1, 0.1, alpha=0.10))
    c.setFont("Helvetica-Bold", 46)
    c.translate(width / 2, height / 2 - 60)
    c.rotate(35)
    c.drawCentredString(0, 0, "SYNTHETIC SAMPLE")
    c.restoreState()
    c.setFont("Helvetica-Oblique", 8)
    c.setFillColor(HexColor("#6b7280"))
    c.drawString(40, 30, footer or "Generated test document. Replace with the institution's actual document for real use.")
    c.showPage()
    c.save()
    return buf.getvalue()


def _font(size):
    for path in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size=size)


def document_image(title, lines, size=(1654, 2339)):
    """A scanned-page style raster (A4 at ~200 DPI)."""
    w, h = size
    img = Image.new("RGB", (w, h), (247, 246, 240))
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, w, 150], fill=(11, 42, 91))
    d.text((70, 40), title, fill=(255, 255, 255), font=_font(54))
    d.text((70, 108), NOTICE, fill=(220, 230, 255), font=_font(22))
    y = 220
    body = _font(34)
    for line in lines:
        d.text((90, y), line, fill=(20, 24, 32), font=body)
        y += 58
    # Table grid to give the page realistic structure.
    top = y + 40
    for r in range(9):
        d.line([(90, top + r * 70), (w - 90, top + r * 70)], fill=(60, 60, 60), width=3)
    for cx in (90, 520, 1000, w - 90):
        d.line([(cx, top), (cx, top + 8 * 70)], fill=(60, 60, 60), width=3)
    for r in range(8):
        d.text((110, top + r * 70 + 16), f"Item {r + 1}", fill=(30, 30, 30), font=_font(30))
        d.text((540, top + r * 70 + 16), f"Detail {r + 1:02d}-A", fill=(30, 30, 30), font=_font(30))
        d.text((1020, top + r * 70 + 16), f"{(r + 3) * 117} sq.m", fill=(30, 30, 30), font=_font(30))
    d.text((w - 600, h - 200), "Seal / signature area", fill=(120, 120, 120), font=_font(28))
    return img


def to_jpeg(img, quality=90):
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=quality)
    return buf.getvalue()


def blurred(img, sigma=6.0):
    arr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    arr = cv2.GaussianBlur(arr, (0, 0), sigma)
    return Image.fromarray(cv2.cvtColor(arr, cv2.COLOR_BGR2RGB))


def image_pdf(img):
    """Wrap a raster page in a PDF with no text layer (a 'scanned' PDF)."""
    buf = io.BytesIO()
    img.save(buf, "PDF", resolution=200.0)
    return buf.getvalue()
