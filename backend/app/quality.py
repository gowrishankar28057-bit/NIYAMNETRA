"""Document readability checks.

These checks estimate whether an upload is legible enough for a reviewer. They do
not establish that a document is authentic.

Sharpness uses two independent signals so a single score is never decisive:
  * variance of the Laplacian over content-bearing tiles (edge energy), and
  * the no-reference "blur effect" of Crete-Roffet et al. (2007), which measures how
    much local variation survives a deliberate re-blur (0 = sharp, 1 = blurred).
Resolution, contrast, brightness and blank-page checks run alongside.
"""

import hashlib
import io

import cv2
import numpy as np
import pymupdf
from PIL import Image, UnidentifiedImageError

ALLOWED = {
    "pdf": "application/pdf",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "png": "image/png",
}
Image.MAX_IMAGE_PIXELS = 60_000_000
ANALYSIS_LONG_SIDE = 1600
PDF_SAMPLE_PAGES = 3
PDF_RENDER_DPI = 150
TEXT_LAYER_MIN_CHARS = 40

QUALITY_MESSAGE = (
    "Document quality insufficient. The image appears blurry or low resolution. "
    "Please upload a clearer copy."
)


class FileRejected(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code
        self.message = message


def sniff_type(data):
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpg"
    return None


def validate_upload(filename, data, max_bytes):
    """Server-side gate: extension whitelist, size limit and magic-byte match."""
    if not data:
        raise FileRejected("empty_file", "The selected file is empty.")
    if len(data) > max_bytes:
        raise FileRejected("file_too_large", f"File exceeds the {max_bytes // (1024 * 1024)} MB limit.")
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED:
        raise FileRejected("unsupported_type", "Only PDF, JPG, JPEG and PNG files are accepted.")
    sniffed = sniff_type(data)
    if sniffed is None:
        raise FileRejected("unrecognised_content", "File content is not a valid PDF, JPEG or PNG.")
    expected = "jpg" if ext in ("jpg", "jpeg") else ext
    if sniffed != expected:
        raise FileRejected("type_mismatch", f"File extension .{ext} does not match its content ({sniffed.upper()}).")
    return sniffed, ALLOWED[ext]


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def blur_effect(gray, h_size=11):
    img = gray.astype(np.float64) / 255.0
    scores = []
    # cv2 ksize is (width, height): blur along the same axis we difference.
    for axis, ksize in ((0, (1, h_size)), (1, (h_size, 1))):
        blurred = cv2.blur(img, ksize)
        d_f = np.abs(np.diff(img, axis=axis))
        d_b = np.abs(np.diff(blurred, axis=axis))
        t = np.maximum(0, d_f - d_b)
        s_f = d_f[1:-1, 1:-1].sum()
        s_v = t[1:-1, 1:-1].sum()
        scores.append((s_f - s_v) / s_f if s_f > 0 else 1.0)
    return float(max(scores))


def _tile_laplacian(gray, grid=8, min_std=12.0):
    h, w = gray.shape
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    values, content_tiles = [], 0
    for r in range(grid):
        for c in range(grid):
            y0, y1 = r * h // grid, (r + 1) * h // grid
            x0, x1 = c * w // grid, (c + 1) * w // grid
            tile = gray[y0:y1, x0:x1]
            if tile.size == 0 or tile.std() < min_std:
                continue
            content_tiles += 1
            values.append(lap[y0:y1, x0:x1].var())
    coverage = content_tiles / (grid * grid)
    return (float(np.percentile(values, 75)) if values else 0.0), coverage


def analyze_image_array(bgr, cfg):
    h, w = bgr.shape[:2]
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY) if bgr.ndim == 3 else bgr
    scale = ANALYSIS_LONG_SIDE / max(h, w)
    if scale < 1:
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    lap_var, coverage = _tile_laplacian(gray)
    be = blur_effect(gray)
    contrast = float(gray.std())
    brightness = float(gray.mean())
    short_side = min(h, w)

    reasons = []

    def add(code, severity, message):
        reasons.append({"code": code, "severity": severity, "message": message})

    if short_side < cfg["QUALITY_MIN_SHORT_SIDE"] or h * w < 300_000:
        add("low_resolution", "fail", f"Resolution {w}×{h}px is too low to read reliably (minimum short side {cfg['QUALITY_MIN_SHORT_SIDE']}px).")
    elif short_side < cfg["QUALITY_WARN_SHORT_SIDE"]:
        add("modest_resolution", "warn", f"Resolution {w}×{h}px is modest; small text may be hard to read.")

    if coverage < 0.03:
        add("blank_page", "fail", "The page appears blank or nearly empty.")
    else:
        strong_blur = be >= cfg["QUALITY_BLUR_EFFECT_FAIL"]
        weak_edges = lap_var < cfg["QUALITY_LAPLACIAN_FAIL"]
        # Fail only when both signals agree, or one is far past its threshold.
        if (strong_blur and lap_var < cfg["QUALITY_LAPLACIAN_WARN"]) or (weak_edges and be >= cfg["QUALITY_BLUR_EFFECT_WARN"]) or be >= cfg["QUALITY_BLUR_EFFECT_FAIL"] + 0.12:
            add("blurry", "fail", "The image appears blurry; text edges are not sharp enough to read reliably.")
        elif be >= cfg["QUALITY_BLUR_EFFECT_WARN"] or lap_var < cfg["QUALITY_LAPLACIAN_WARN"]:
            add("slightly_soft", "warn", "The image is slightly soft; a reviewer should confirm it is legible.")

    if contrast < cfg["QUALITY_MIN_CONTRAST"] * 0.6:
        add("very_low_contrast", "fail", "Contrast is too low; the content is washed out or faded.")
    elif contrast < cfg["QUALITY_MIN_CONTRAST"]:
        add("low_contrast", "warn", "Contrast is low; the scan may be faded.")
    if brightness < 45:
        add("too_dark", "fail" if brightness < 25 else "warn", "The image is very dark.")
    elif brightness > 250 and contrast < 10:
        add("overexposed", "fail", "The image is overexposed.")

    metrics = {
        "width": w,
        "height": h,
        "megapixels": round(h * w / 1e6, 2),
        "laplacian_variance": round(lap_var, 1),
        "blur_effect": round(be, 3),
        "contrast_rms": round(contrast, 1),
        "mean_brightness": round(brightness, 1),
        "content_coverage": round(coverage, 2),
    }
    return metrics, reasons


def _verdict(reasons):
    if any(r["severity"] == "fail" for r in reasons):
        return "failed"
    if any(r["severity"] == "warn" for r in reasons):
        return "warning"
    return "accepted"


def _cfg(config):
    keys = [k for k in config.keys() if k.startswith("QUALITY_")]
    return {k: config[k] for k in keys}


def check_image(data, config):
    cfg = _cfg(config)
    try:
        with Image.open(io.BytesIO(data)) as probe:
            probe.verify()
        with Image.open(io.BytesIO(data)) as im:
            exif = {}
            try:
                raw = im.getexif()
                for tag, name in ((305, "software"), (306, "datetime"), (271, "make"), (272, "model")):
                    if raw.get(tag):
                        exif[name] = str(raw.get(tag))[:120]
            except Exception:
                exif = {}
            rgb = im.convert("RGB")
            arr = cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise FileRejected("corrupt_image", f"Image could not be decoded ({exc.__class__.__name__}).")
    metrics, reasons = analyze_image_array(arr, cfg)
    verdict = _verdict(reasons)
    return {
        "kind": "image",
        "verdict": verdict,
        "message": QUALITY_MESSAGE if verdict == "failed" else None,
        "reasons": reasons,
        "metrics": metrics,
        "exif": exif,
        "method": "OpenCV: Laplacian variance (content tiles) + Crete-Roffet blur effect, resolution, contrast, brightness",
        "page_count": 1,
    }


def check_pdf(data, config):
    cfg = _cfg(config)
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception as exc:
        raise FileRejected("corrupt_pdf", f"PDF could not be opened ({exc.__class__.__name__}).")
    with doc:
        if doc.needs_pass:
            raise FileRejected("encrypted_pdf", "Password-protected PDFs cannot be inspected. Upload an unlocked copy.")
        if doc.page_count == 0:
            raise FileRejected("empty_pdf", "The PDF has no pages.")
        pages, text_parts = [], []
        for index in range(min(doc.page_count, PDF_SAMPLE_PAGES)):
            page = doc[index]
            text = page.get_text("text") or ""
            text_parts.append(text)
            if len(text.strip()) >= TEXT_LAYER_MIN_CHARS:
                pages.append({"page": index + 1, "kind": "text", "reasons": [], "metrics": {"text_chars": len(text.strip())}})
                continue
            pix = page.get_pixmap(dpi=PDF_RENDER_DPI)
            arr = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
            arr = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR if pix.n == 3 else cv2.COLOR_RGBA2BGR)
            metrics, reasons = analyze_image_array(arr, cfg)
            # Render size is a function of DPI, not of the scan; judge resolution from the embedded image.
            reasons = [r for r in reasons if r["code"] not in ("low_resolution", "modest_resolution")]
            images = page.get_images(full=True)
            if images:
                xref = images[0][0]
                info = doc.extract_image(xref)
                iw, ih = info.get("width", 0), info.get("height", 0)
                metrics["embedded_image"] = f"{iw}×{ih}"
                if min(iw, ih) < cfg["QUALITY_MIN_SHORT_SIDE"]:
                    reasons.append({"code": "low_resolution", "severity": "fail", "message": f"Embedded scan is only {iw}×{ih}px."})
            pages.append({"page": index + 1, "kind": "scanned", "reasons": reasons, "metrics": metrics})
        metadata = {k: v for k, v in (doc.metadata or {}).items() if v}
        revisions = data.count(b"%%EOF")
        page_count = doc.page_count

    all_reasons = []
    for p in pages:
        for r in p["reasons"]:
            all_reasons.append(dict(r, message=f"Page {p['page']}: {r['message']}"))
    verdict = _verdict(all_reasons)
    text_pages = sum(1 for p in pages if p["kind"] == "text")
    return {
        "kind": "pdf",
        "verdict": verdict,
        "message": QUALITY_MESSAGE if verdict == "failed" else None,
        "reasons": all_reasons,
        "pages": pages,
        "page_count": page_count,
        "sampled_pages": len(pages),
        "text_layer_pages": text_pages,
        "pdf_metadata": metadata,
        "pdf_revisions": revisions,
        "text_excerpt": "\n".join(text_parts)[:20000],
        "method": (
            "PyMuPDF: pages with a text layer are treated as digitally generated (no camera-blur test); "
            "image-only pages are rendered at 150 DPI and checked with the image pipeline"
        ),
    }


def run_quality_check(kind, data, config):
    result = check_pdf(data, config) if kind == "pdf" else check_image(data, config)
    result["checked"] = True
    return result


def document_status_for(verdict):
    return {"accepted": "accepted", "warning": "needs_review", "failed": "quality_failed"}[verdict]
