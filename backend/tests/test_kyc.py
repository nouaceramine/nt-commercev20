"""M12: pure-logic tests for the KYC module (validation + review transitions)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from routes.kyc_routes import validate_submission, next_status, MAX_DOCS, MAX_DOC_B64_CHARS


def _ok_payload():
    return {
        "business_name": "متجر التجربة",
        "phone": "0555000000",
        "documents": [{"doc_type": "id_card", "filename": "id.png", "data_b64": "QUJD"}],
    }


def test_valid_payload_passes():
    assert validate_submission(_ok_payload()) == []


def test_business_name_required():
    p = _ok_payload(); p["business_name"] = "  "
    assert "business_name_required" in validate_submission(p)


def test_phone_required():
    p = _ok_payload(); p["phone"] = ""
    assert "phone_required" in validate_submission(p)


def test_documents_required():
    p = _ok_payload(); p["documents"] = []
    assert "documents_required" in validate_submission(p)


def test_too_many_documents():
    p = _ok_payload()
    p["documents"] = [{"doc_type": "other", "filename": f"f{i}", "data_b64": "QQ"} for i in range(MAX_DOCS + 1)]
    assert "too_many_documents" in validate_submission(p)


def test_bad_doc_type():
    p = _ok_payload(); p["documents"][0]["doc_type"] = "passport_xyz"
    assert "bad_doc_type" in validate_submission(p)


def test_empty_document():
    p = _ok_payload(); p["documents"][0]["data_b64"] = ""
    assert "empty_document" in validate_submission(p)


def test_document_too_large():
    p = _ok_payload(); p["documents"][0]["data_b64"] = "A" * (MAX_DOC_B64_CHARS + 1)
    assert "document_too_large" in validate_submission(p)


def test_all_doc_types_accepted():
    for dt in ("id_card", "rc_extract", "nif_doc", "photo_shop", "other"):
        p = _ok_payload(); p["documents"][0]["doc_type"] = dt
        assert validate_submission(p) == [], dt


def test_review_transitions():
    assert next_status("approve") == "approved"
    assert next_status("reject") == "rejected"
    for bad in ("", "delete", "APPROVE"):
        try:
            next_status(bad)
            assert False, bad
        except ValueError:
            pass
