import io

import pytest

from app.config import Config
from app.quality import FileRejected, check_image, check_pdf, run_quality_check, validate_upload
from app.samples import blurred, document_image, image_pdf, sample_pdf, to_jpeg

CFG = {k: getattr(Config, k) for k in dir(Config) if k.startswith("QUALITY_")}


def page():
    return document_image("Sample Document", ["Name of the Institution: Maharaja Agrasen Institute of Technology", "Permanent ID: 1-4261798"])


def test_sharp_image_accepted():
    result = check_image(to_jpeg(page()), CFG)
    assert result["verdict"] == "accepted"
    assert result["metrics"]["blur_effect"] < CFG["QUALITY_BLUR_EFFECT_WARN"]


def test_blurry_image_failed():
    result = check_image(to_jpeg(blurred(page(), 6)), CFG)
    assert result["verdict"] == "failed"
    assert any(r["code"] == "blurry" for r in result["reasons"])
    assert result["message"]


def test_clear_replacement_accepted_after_blur():
    assert check_image(to_jpeg(blurred(page(), 6)), CFG)["verdict"] == "failed"
    assert check_image(to_jpeg(page()), CFG)["verdict"] == "accepted"


def test_low_resolution_failed():
    small = page().resize((380, 537))
    result = check_image(to_jpeg(small), CFG)
    assert result["verdict"] == "failed"
    assert any(r["code"] == "low_resolution" for r in result["reasons"])


def test_blank_page_failed():
    from PIL import Image

    result = check_image(to_jpeg(Image.new("RGB", (1200, 1600), (252, 252, 252))), CFG)
    assert result["verdict"] == "failed"
    assert any(r["code"] in ("blank_page", "very_low_contrast") for r in result["reasons"])


def test_text_pdf_not_penalised_for_sharpness():
    result = check_pdf(sample_pdf("Affiliation", ["Line one", "Name of the Institution: Maharaja Agrasen Institute of Technology"]), CFG)
    assert result["verdict"] == "accepted"
    assert result["text_layer_pages"] >= 1


def test_scanned_pdf_blur_detected():
    assert check_pdf(image_pdf(page()), CFG)["verdict"] == "accepted"
    assert check_pdf(image_pdf(blurred(page(), 6)), CFG)["verdict"] == "failed"


def test_validate_upload_rejects_unsupported_type():
    with pytest.raises(FileRejected) as exc:
        validate_upload("notes.txt", b"hello", 10 * 1024 * 1024)
    assert exc.value.code == "unsupported_type"


def test_validate_upload_rejects_type_mismatch():
    with pytest.raises(FileRejected) as exc:
        validate_upload("photo.png", to_jpeg(page()), 10 * 1024 * 1024)
    assert exc.value.code == "type_mismatch"


def test_validate_upload_rejects_oversize():
    with pytest.raises(FileRejected) as exc:
        validate_upload("big.pdf", b"%PDF-" + b"0" * 2048, 1024)
    assert exc.value.code == "file_too_large"


def test_run_quality_check_dispatch():
    assert run_quality_check("image", to_jpeg(page()), CFG)["kind"] == "image"
    assert run_quality_check("pdf", sample_pdf("x", ["y"]), CFG)["kind"] == "pdf"
