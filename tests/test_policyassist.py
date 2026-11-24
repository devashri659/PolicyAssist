import os
import sys
import io
import json
import unittest

# Ensure project root is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app import app, POLICY_CACHE, extract_policy_text, evaluate_document_readiness, get_claim_checklist


class PolicyAssistTestCase(unittest.TestCase):
    def setUp(self):
        app.config["TESTING"] = True
        self.client = app.test_client()
        self.samples_dir = app.config["SAMPLES_FOLDER"]

    def test_01_homepage_renders(self):
        """Test that homepage loads with exact header, hero copy, and 3 feature cards."""
        res = self.client.get("/")
        self.assertEqual(res.status_code, 200)
        html = res.data.decode("utf-8")
        self.assertIn("PolicyAssist", html)
        self.assertIn("Insurance Policy & Document Assistant", html)
        self.assertIn("Your Insurance, <span class=\"highlight\">Simplified.</span>", html)
        self.assertIn("Understand Policy", html)
        self.assertIn("Claim Documents", html)
        self.assertIn("Check Documents", html)
        self.assertIn('href="/policy"', html)
        self.assertIn('href="/documents"', html)
        self.assertIn('href="/check-documents"', html)

    def test_02_all_pages_render(self):
        """Test that /policy, /documents, /check-documents, and /help all return 200."""
        for endpoint, expected_text in [
            ("/policy", "Understand Your Policy"),
            ("/documents", "Claim Documents Checklist"),
            ("/check-documents", "Check Document Readiness"),
            ("/help", "How to Use PolicyAssist")
        ]:
            res = self.client.get(endpoint)
            self.assertEqual(res.status_code, 200, f"Failed on endpoint: {endpoint}")
            self.assertIn(expected_text, res.data.decode("utf-8"))

    def test_03_invalid_file_upload(self):
        """Test that uploading a non-PDF file returns a 400 error."""
        data = {
            "policy_file": (io.BytesIO(b"Hello fake document text"), "test_file.txt")
        }
        res = self.client.post("/api/upload-policy", data=data, content_type="multipart/form-data")
        self.assertEqual(res.status_code, 400)
        json_data = res.get_json()
        self.assertIn("Invalid file format", json_data.get("message", ""))

    def test_04_no_text_pdf_upload(self):
        """Test that uploading a PDF without extractable text produces a helpful error."""
        scanned_pdf = os.path.join(self.samples_dir, "Sample_Scanned_NoText_Policy.pdf")
        self.assertTrue(os.path.exists(scanned_pdf), "Sample scanned PDF not found.")

        with open(scanned_pdf, "rb") as f:
            data = {"policy_file": (f, "Sample_Scanned_NoText_Policy.pdf")}
            res = self.client.post("/api/upload-policy", data=data, content_type="multipart/form-data")
            self.assertEqual(res.status_code, 400)
            json_data = res.get_json()
            self.assertEqual(json_data.get("error_type"), "no_extractable_text")
            self.assertIn("contains no extractable text", json_data.get("message", ""))

    def test_05_valid_pdf_upload_and_extraction(self):
        """Test that uploading a valid text-based PDF extracts pages and word count."""
        sample_pdf = os.path.join(self.samples_dir, "Sample_Comprehensive_Motor_Policy.pdf")
        self.assertTrue(os.path.exists(sample_pdf), "Sample PDF not found.")

        with open(sample_pdf, "rb") as f:
            data = {"policy_file": (f, "Sample_Comprehensive_Motor_Policy.pdf")}
            res = self.client.post("/api/upload-policy", data=data, content_type="multipart/form-data")
            self.assertEqual(res.status_code, 200)
            json_data = res.get_json()
            self.assertEqual(json_data.get("status"), "success")
            self.assertEqual(json_data.get("page_count"), 2)
            self.assertGreater(json_data.get("word_count"), 200)
            self.assertIn("doc_id", json_data)

    def test_06_load_sample_policy_endpoint(self):
        """Test loading built-in sample policies."""
        res = self.client.post("/api/load-sample-policy", json={"sample_name": "comprehensive"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "success")
        self.assertEqual(data.get("filename"), "Sample_Comprehensive_Motor_Policy.pdf")
        self.assertIn("doc_id", data)

    def test_07_ask_policy_missing_api_key_message(self):
        """Test that asking a question without GEMINI_API_KEY returns a clear, helpful message."""
        # Load sample to get a valid doc_id
        load_res = self.client.post("/api/load-sample-policy", json={"sample_name": "comprehensive"})
        doc_id = load_res.get_json()["doc_id"]

        # Temporarily ensure no valid API key is present
        orig_key = os.environ.get("GEMINI_API_KEY")
        os.environ["GEMINI_API_KEY"] = "your_gemini_api_key_here"

        try:
            res = self.client.post("/api/ask-policy", json={
                "doc_id": doc_id,
                "question": "What are the deductibles?"
            })
            self.assertEqual(res.status_code, 400)
            data = res.get_json()
            self.assertEqual(data.get("error_type"), "missing_api_key")
            self.assertIn("Gemini API key is not configured", data.get("message", ""))
        finally:
            if orig_key is not None:
                os.environ["GEMINI_API_KEY"] = orig_key
            else:
                os.environ.pop("GEMINI_API_KEY", None)

    def test_08_generate_checklist_for_all_claim_types(self):
        """Test retrieving checklists from knowledge base for all three supported claim types."""
        claim_types = ["accident_collision", "vehicle_theft", "vehicle_damage"]
        for ct in claim_types:
            res = self.client.post("/api/generate-checklist", json={"claim_type": ct})
            self.assertEqual(res.status_code, 200)
            data = res.get_json()
            self.assertEqual(data.get("status"), "success")
            self.assertEqual(data.get("claim_type"), ct)
            self.assertGreater(len(data.get("documents", [])), 4)

            # Ensure both standard and conditional documents are present
            categories = {d["category"] for d in data["documents"]}
            self.assertIn("standard", categories)
            self.assertIn("conditional", categories)

    def test_09_check_documents_evaluation_logic(self):
        """Test the document readiness calculation and summary formulation."""
        # 1. Partial completion test
        marked = {
            "doc_claim_form": "available",
            "doc_policy_schedule": "available",
            "doc_rc_copy": "available",
            "doc_dl_copy": "available",
            "doc_damage_photos": "missing",
            "doc_repair_estimate": "missing",
            "doc_fir_police": "missing",
            "doc_medical_receipts": "missing"
        }
        res = self.client.post("/api/check-documents", json={
            "claim_type": "accident_collision",
            "marked_documents": marked
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertEqual(data.get("status"), "success")
        self.assertEqual(data.get("available_count"), 4)
        self.assertEqual(data.get("missing_count"), 4)
        self.assertEqual(data.get("total_count"), 8)
        self.assertEqual(data.get("percentage"), 50.0)
        self.assertEqual(data.get("status_category"), "partial")
        self.assertEqual(
            data.get("headline"),
            "Your checklist is partially complete. You have marked 4 of 8 documents as available."
        )
        self.assertEqual(len(data.get("missing_items", [])), 4)

        # 2. Complete completion test
        all_marked = {k: "available" for k in marked.keys()}
        res_complete = self.client.post("/api/check-documents", json={
            "claim_type": "accident_collision",
            "marked_documents": all_marked
        })
        data_complete = res_complete.get_json()
        self.assertEqual(data_complete.get("available_count"), 8)
        self.assertEqual(data_complete.get("missing_count"), 0)
        self.assertEqual(data_complete.get("status_category"), "complete")
        self.assertIn("ready for insurer submission", data_complete.get("headline", ""))

    def test_10_extract_policy_text_unit(self):
        """Test extract_policy_text unit function."""
        pdf_path = os.path.join(self.samples_dir, "Sample_Comprehensive_Motor_Policy.pdf")
        result = extract_policy_text(pdf_path)
        self.assertTrue(result["has_text"])
        self.assertEqual(result["page_count"], 2)
        self.assertIn("[Page 1]", result["text"])
        self.assertIn("[Page 2]", result["text"])
        self.assertIn("DEDUCTIBLES", result["text"])
        self.assertIn("GENERAL EXCLUSIONS", result["text"])


if __name__ == "__main__":
    unittest.main()
