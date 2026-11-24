import os
import json
import uuid
import re
try:
    import pymupdf
except ImportError:
    try:
        import fitz as pymupdf
    except ImportError as e:
        raise ImportError(
            "PyMuPDF is not installed in the currently active Python interpreter.\n"
            "Please run: pip install pymupdf\n"
            f"Error details: {e}"
        ) from e

from flask import Flask, render_template, request, jsonify, session
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Load environment variables from .env if present
load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv("SECRET_KEY", "policyassist-secret-key-2026")
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB limit
app.config["UPLOAD_FOLDER"] = os.path.join(os.path.dirname(os.path.abspath(__file__)), "uploads")
app.config["DATA_FOLDER"] = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
app.config["SAMPLES_FOLDER"] = os.path.join(app.config["DATA_FOLDER"], "sample_policies")

ALLOWED_EXTENSIONS = {"pdf"}

# In-memory policy document cache: {doc_id: {"filename": str, "pages": int, "text": str}}
POLICY_CACHE = {}

# Default supported and free-tier eligible Gemini model
DEFAULT_GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.5-flash").strip() or "gemini-3.5-flash"


def allowed_file(filename):
    """Check if the uploaded file has an allowed extension (.pdf)."""
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def sanitize_error(err_str):
    """
    Sanitize error message to ensure API keys are never exposed in logs or user responses.
    """
    if not err_str:
        return ""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if api_key and len(api_key) > 5:
        err_str = err_str.replace(api_key, "[REDACTED]")
    # Also strip generic patterns that resemble Google API keys (e.g. AIzaSy..., AQ....)
    err_str = re.sub(r'key=[A-Za-z0-9_.-]{15,}', 'key=[REDACTED]', err_str)
    return err_str


def get_gemini_client():
    """
    Initialize and return the Google Gemini client if an API key is configured.
    Returns None if GEMINI_API_KEY is not set or contains the default placeholder.
    """
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key or "your_gemini_api_key_here" in api_key:
        return None
    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except Exception as e:
        app.logger.error(f"Error initializing Google Gemini client: {sanitize_error(str(e))}")
        return None


# ==============================================================================
# CORE WORKFLOW FUNCTIONS (Modular, Interview-Ready AI Agent Architecture)
# ==============================================================================

def clean_ai_response_text(text):
    """
    Cleans AI-generated text:
    - Removes unwanted markdown dividers (***, ---, ___)
    - Removes duplicate trailing disclaimer statements (rendered separately in the UI)
    - Strips leading and trailing artifact whitespace
    """
    if not text:
        return ""

    # Remove standalone markdown horizontal rules (***, ---, ___) anywhere in text
    cleaned = re.sub(r'^\s*([*\-_])\s*\1\s*\1[\s*\-_]*$', '', text, flags=re.MULTILINE)

    # Remove trailing disclaimer paragraphs (e.g. "*Disclaimer: PolicyAssist...", "Disclaimer:...", "Notice:...")
    disclaimer_pattern = r'(?is)(?:\n+|\A)\s*(?:\*{1,2}|_{1,2})?\s*(?:disclaimer|notice|important\s+notice)\s*[:\-].*?(?:insurer|insurance company|guarantee|approval|underwriting|decisions).*?$'
    cleaned = re.sub(disclaimer_pattern, '', cleaned)

    # Strip any dangling asterisks, dashes or dividers at the end
    cleaned = re.sub(r'[\s*\-_]+$', '', cleaned)

    return cleaned.strip()


def extract_policy_text(pdf_path):
    """
    Function 1: Policy Text Extraction via PyMuPDF.
    Extracts text page by page with structural page markers.
    Returns:
        dict: {"text": str, "page_count": int, "word_count": int, "has_text": bool}
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found at: {pdf_path}")

    doc = pymupdf.open(pdf_path)
    page_count = len(doc)
    extracted_pages = []
    total_words = 0

    for page_num in range(page_count):
        page = doc.load_page(page_num)
        text = page.get_text("text").strip()
        words = len(text.split())
        total_words += words
        extracted_pages.append(f"--- [Page {page_num + 1}] ---\n{text}")

    doc.close()

    full_text = "\n\n".join(extracted_pages).strip()
    has_text = total_words > 15  # Avoid empty or scanned placeholder pages

    return {
        "text": full_text,
        "page_count": page_count,
        "word_count": total_words,
        "has_text": has_text
    }


def answer_policy_question(policy_text, question, model=None):
    """
    Function 2: Policy Question Answering via Google Gemini API (`google-genai` SDK).
    Sends extracted policy text and user's query to Gemini with strict grounding constraints.
    Returns:
        dict: {"answer": str, "grounded": bool, "status": "success"} or error dict
    """
    client = get_gemini_client()
    if client is None:
        return {
            "status": "error",
            "error_type": "missing_api_key",
            "message": "Gemini API key is not configured. Please set your GEMINI_API_KEY in the .env file to enable AI answers."
        }

    target_model = model or DEFAULT_GEMINI_MODEL

    # Limit text to ~35,000 characters to keep within fast bounds while preserving full policy substance
    truncated_text = policy_text[:35000] if len(policy_text) > 35000 else policy_text

    system_instruction = (
        "You are PolicyAssist, an AI-powered insurance policy and documentation assistant.\n"
        "Your task is to provide clear, helpful, and 100% grounded explanations based EXCLUSIVELY on the provided insurance policy document text.\n\n"
        "CRITICAL RULES:\n"
        "1. GROUNDING: Answer ONLY using information explicitly stated in the provided policy document. Do not invent coverage details, exclusions, deductibles, or limits.\n"
        "2. UNKNOWN INFORMATION: If the document does not specify or support the answer, explicitly state: 'The provided document does not specify this information.' or 'This information could not be found in the provided policy document.' Do not speculate or make assumptions.\n"
        "3. CITATIONS: Whenever possible, reference the relevant page number (e.g., [Page 1]) or section heading where the information appears.\n"
        "4. CLARITY & STRUCTURE: Present complex terms using clear Markdown headings (###), bold key terms, and neatly structured bullet points or numbered lists.\n"
        "5. NO DUPLICATE DISCLAIMERS OR DIVIDERS: Do NOT include disclaimer statements or horizontal dividers (such as ***, ---, or ___) in your answer. The user interface already displays a permanent official legal notice box directly below your response."
    )

    user_prompt = (
        f"--- POLICY DOCUMENT TEXT START ---\n{truncated_text}\n--- POLICY DOCUMENT TEXT END ---\n\n"
        f"USER QUESTION: {question}\n\n"
        "Please provide an accurate, grounded answer based strictly on the text above."
    )

    try:
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction=system_instruction,
            temperature=0.2,
            max_output_tokens=800
        )

        response = client.models.generate_content(
            model=target_model,
            contents=user_prompt,
            config=config
        )

        raw_text = response.text.strip() if response.text else ""
        answer_content = clean_ai_response_text(raw_text)
        if not answer_content:
            return {
                "status": "error",
                "error_type": "empty_response",
                "message": "The Gemini model returned an empty response. Please try rephrasing your question."
            }

        return {
            "status": "success",
            "answer": answer_content,
            "model_used": target_model
        }

    except Exception as e:
        err_msg = sanitize_error(str(e))
        app.logger.error(f"Gemini API call failed: {err_msg}")

        # Distinguish specific common error types
        err_lower = err_msg.lower()
        if "429" in err_msg or "resource_exhausted" in err_lower or "quota" in err_lower:
            return {
                "status": "error",
                "error_type": "quota_exceeded",
                "message": "Gemini API rate limit or quota exceeded. Please wait a moment before trying again."
            }
        elif "503" in err_msg or "unavailable" in err_lower or "high demand" in err_lower:
            # Attempt seamless fallback to gemini-3.5-flash-lite if the primary model is busy
            if target_model != "gemini-3.5-flash-lite":
                app.logger.info("Retrying with fallback model gemini-3.5-flash-lite...")
                return answer_policy_question(policy_text, question, model="gemini-3.5-flash-lite")
            return {
                "status": "error",
                "error_type": "service_unavailable",
                "message": "The Gemini service is temporarily experiencing high demand. Please try again in a few moments."
            }
        elif "connection" in err_lower or "timeout" in err_lower or "network" in err_lower or "getaddrinfo" in err_lower:
            return {
                "status": "error",
                "error_type": "network_error",
                "message": "Unable to connect to the Google Gemini API. Please check your internet connection."
            }
        elif "400" in err_msg or "invalid" in err_lower or "api_key" in err_lower:
            return {
                "status": "error",
                "error_type": "invalid_api_key",
                "message": "Invalid Gemini API key. Please check your GEMINI_API_KEY in the .env file."
            }
        else:
            return {
                "status": "error",
                "error_type": "api_failure",
                "message": f"Gemini API error: {err_msg}"
            }


def get_claim_checklist(claim_type_id):
    """
    Function 3: Knowledge Base Checklist Retrieval.
    Retrieves predefined document requirements from data/document_requirements.json.
    Returns:
        dict: Claim category information and list of required/conditional documents.
    """
    json_path = os.path.join(app.config["DATA_FOLDER"], "document_requirements.json")
    if not os.path.exists(json_path):
        return None

    with open(json_path, "r", encoding="utf-8") as f:
        kb = json.load(f)

    for item in kb.get("claim_types", []):
        if item["id"] == claim_type_id:
            return item

    # Fallback to first if not matched
    return kb.get("claim_types", [])[0] if kb.get("claim_types") else None


def evaluate_document_readiness(claim_type_id, marked_docs):
    """
    Function 4: Document Checklist Comparison & Readiness Evaluator.
    Compares the user's collected documents against the knowledge base requirements.
    Args:
        claim_type_id (str): 'accident_collision', 'vehicle_theft', or 'vehicle_damage'
        marked_docs (dict): {doc_id: 'available' | 'missing'}
    Returns:
        dict: Completion statistics, list of available items, missing items, and status summary.
    """
    checklist_data = get_claim_checklist(claim_type_id)
    if not checklist_data:
        return {
            "status": "error",
            "message": f"Claim type '{claim_type_id}' not found."
        }

    all_docs = checklist_data.get("documents", [])
    total_count = len(all_docs)

    available_items = []
    missing_items = []

    for doc in all_docs:
        doc_id = doc["id"]
        status = marked_docs.get(doc_id, "missing")  # default to missing if not marked
        doc_copy = dict(doc)
        doc_copy["user_status"] = status

        if status == "available":
            available_items.append(doc_copy)
        else:
            missing_items.append(doc_copy)

    available_count = len(available_items)
    missing_count = len(missing_items)
    percentage = round((available_count / total_count * 100), 1) if total_count > 0 else 0

    if available_count == total_count:
        status_category = "complete"
        headline = f"All {total_count} documents are marked as available! Your claim file is ready for insurer submission."
    elif available_count == 0:
        status_category = "empty"
        headline = f"Checklist not started. All {total_count} required documents are currently marked as missing."
    else:
        status_category = "partial"
        headline = f"Your checklist is partially complete. You have marked {available_count} of {total_count} documents as available."

    return {
        "status": "success",
        "claim_type_id": claim_type_id,
        "claim_type_name": checklist_data.get("name"),
        "total_count": total_count,
        "available_count": available_count,
        "missing_count": missing_count,
        "percentage": percentage,
        "status_category": status_category,
        "headline": headline,
        "available_items": available_items,
        "missing_items": missing_items
    }


def explain_checklist_with_ai(claim_type_name, incident_desc, documents):
    """
    Optional AI Helper: Uses Google Gemini to explain the checklist in plain language
    specifically tailored to the user's brief incident description.
    """
    client = get_gemini_client()
    if client is None:
        return None

    doc_names = [f"- {d['name']} ({d['category']})" for d in documents]
    docs_summary = "\n".join(doc_names)

    prompt = (
        f"Claim Type: {claim_type_name}\n"
        f"Incident Description: {incident_desc if incident_desc else 'Standard incident'}\n\n"
        f"Required Documents:\n{docs_summary}\n\n"
        "Provide a short, 3-paragraph plain-English summary explaining: "
        "1. Why these documents are crucial for this specific situation. "
        "2. Practical tips on how to obtain or verify them quickly. "
        "3. A gentle disclaimer that requirements vary by insurer."
    )

    try:
        from google.genai import types

        config = types.GenerateContentConfig(
            system_instruction="You are a helpful insurance claims assistant.",
            temperature=0.3,
            max_output_tokens=400
        )

        response = client.models.generate_content(
            model=DEFAULT_GEMINI_MODEL,
            contents=prompt,
            config=config
        )
        return clean_ai_response_text(response.text.strip()) if response.text else None
    except Exception as e:
        app.logger.warning(f"Optional AI checklist explanation failed: {sanitize_error(str(e))}")
        return None


# ==============================================================================
# WEB PAGE ROUTES
# ==============================================================================

@app.route("/")
def index():
    """Homepage: Exact dashboard design matching the provided reference image."""
    return render_template("index.html")


@app.route("/policy")
def policy_page():
    """Feature 1: Understand Your Policy page."""
    return render_template("policy.html")


@app.route("/documents")
def documents_page():
    """Feature 2: Claim Documents checklist generator page."""
    return render_template("documents.html")


@app.route("/check-documents")
def check_documents_page():
    """Feature 3: Document Readiness and missing items checker page."""
    return render_template("check_documents.html")


@app.route("/help")
def help_page():
    """Help and user guidance page."""
    return render_template("help.html")


# ==============================================================================
# API ENDPOINTS
# ==============================================================================

@app.route("/api/upload-policy", methods=["POST"])
def api_upload_policy():
    """
    POST /api/upload-policy
    Uploads an insurance policy PDF, extracts text using PyMuPDF,
    and returns document statistics and a unique session document ID.
    """
    if "policy_file" not in request.files:
        return jsonify({"status": "error", "message": "No file part in the request."}), 400

    file = request.files["policy_file"]
    if file.filename == "":
        return jsonify({"status": "error", "message": "No file was selected for upload."}), 400

    if not allowed_file(file.filename):
        return jsonify({
            "status": "error",
            "message": "Invalid file format. Please upload a PDF document (.pdf)."
        }), 400

    safe_name = secure_filename(file.filename)
    doc_id = str(uuid.uuid4())
    save_path = os.path.join(app.config["UPLOAD_FOLDER"], f"{doc_id}_{safe_name}")

    try:
        file.save(save_path)
        extraction = extract_policy_text(save_path)

        if not extraction["has_text"]:
            return jsonify({
                "status": "error",
                "error_type": "no_extractable_text",
                "message": (
                    "The uploaded PDF contains no extractable text. "
                    "It may be a scanned image or empty document without an OCR text layer. "
                    "Please upload a digital text-based PDF."
                )
            }), 400

        # Cache in memory
        POLICY_CACHE[doc_id] = {
            "filename": safe_name,
            "filepath": save_path,
            "page_count": extraction["page_count"],
            "word_count": extraction["word_count"],
            "text": extraction["text"]
        }

        # Store doc_id in session
        session["current_doc_id"] = doc_id

        return jsonify({
            "status": "success",
            "doc_id": doc_id,
            "filename": safe_name,
            "page_count": extraction["page_count"],
            "word_count": extraction["word_count"],
            "message": f"Successfully parsed '{safe_name}' ({extraction['page_count']} pages, {extraction['word_count']} words)."
        })

    except Exception as e:
        app.logger.error(f"Error processing policy upload: {sanitize_error(str(e))}")
        return jsonify({
            "status": "error",
            "message": f"Failed to process the PDF: {str(e)}"
        }), 500


@app.route("/api/load-sample-policy", methods=["POST"])
def api_load_sample_policy():
    """
    POST /api/load-sample-policy
    Loads one of the pre-built sample policies for immediate evaluation.
    """
    data = request.get_json() or {}
    sample_name = data.get("sample_name", "comprehensive")

    mapping = {
        "comprehensive": "Sample_Comprehensive_Motor_Policy.pdf",
        "motorcycle": "Sample_Motorcycle_Policy.pdf",
        "scanned": "Sample_Scanned_NoText_Policy.pdf"
    }

    filename = mapping.get(sample_name, "Sample_Comprehensive_Motor_Policy.pdf")
    sample_path = os.path.join(app.config["SAMPLES_FOLDER"], filename)

    if not os.path.exists(sample_path):
        return jsonify({"status": "error", "message": f"Sample policy file '{filename}' not found."}), 404

    try:
        extraction = extract_policy_text(sample_path)

        if not extraction["has_text"]:
            return jsonify({
                "status": "error",
                "error_type": "no_extractable_text",
                "message": (
                    "The selected sample PDF contains no extractable text. "
                    "This simulates a scanned document without OCR."
                )
            }), 400

        doc_id = str(uuid.uuid4())
        POLICY_CACHE[doc_id] = {
            "filename": filename,
            "filepath": sample_path,
            "page_count": extraction["page_count"],
            "word_count": extraction["word_count"],
            "text": extraction["text"]
        }
        session["current_doc_id"] = doc_id

        return jsonify({
            "status": "success",
            "doc_id": doc_id,
            "filename": filename,
            "page_count": extraction["page_count"],
            "word_count": extraction["word_count"],
            "message": f"Loaded sample policy '{filename}' successfully."
        })

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/api/ask-policy", methods=["POST"])
def api_ask_policy():
    """
    POST /api/ask-policy
    Answers questions grounded in the extracted policy text using Google Gemini API.
    Request body: {"doc_id": str, "question": str}
    """
    data = request.get_json() or {}
    doc_id = data.get("doc_id") or session.get("current_doc_id")
    question = (data.get("question") or "").strip()

    if not doc_id or doc_id not in POLICY_CACHE:
        return jsonify({
            "status": "error",
            "message": "No active policy document found. Please upload a policy PDF first."
        }), 400

    if not question:
        return jsonify({
            "status": "error",
            "message": "Please enter a question to ask about the policy."
        }), 400

    policy_data = POLICY_CACHE[doc_id]
    result = answer_policy_question(policy_data["text"], question)

    if result.get("status") == "error":
        # Check error type
        if result.get("error_type") == "missing_api_key":
            return jsonify(result), 400
        return jsonify(result), 500

    return jsonify({
        "status": "success",
        "question": question,
        "answer": result["answer"],
        "filename": policy_data["filename"],
        "model_used": result.get("model_used")
    })


@app.route("/api/generate-checklist", methods=["POST"])
def api_generate_checklist():
    """
    POST /api/generate-checklist
    Retrieves document requirements for a specified claim type from JSON knowledge base.
    Request body: {"claim_type": str, "description": str}
    """
    data = request.get_json() or {}
    claim_type = data.get("claim_type", "accident_collision")
    description = (data.get("description") or "").strip()

    checklist_data = get_claim_checklist(claim_type)
    if not checklist_data:
        return jsonify({"status": "error", "message": "Claim type not found."}), 404

    # Optional AI explanation if API key is present
    ai_summary = None
    if description:
        ai_summary = explain_checklist_with_ai(
            checklist_data["name"],
            description,
            checklist_data["documents"]
        )

    return jsonify({
        "status": "success",
        "claim_type": checklist_data["id"],
        "name": checklist_data["name"],
        "short_desc": checklist_data["short_desc"],
        "guidance": checklist_data["guidance"],
        "documents": checklist_data["documents"],
        "total_documents": len(checklist_data["documents"]),
        "ai_summary": ai_summary
    })


@app.route("/api/check-documents", methods=["POST"])
def api_check_documents():
    """
    POST /api/check-documents
    Compares user's marked documents against required checklist.
    Request body: {"claim_type": str, "marked_documents": {doc_id: 'available' | 'missing'}}
    """
    data = request.get_json() or {}
    claim_type = data.get("claim_type", "accident_collision")
    marked_docs = data.get("marked_documents", {})

    evaluation = evaluate_document_readiness(claim_type, marked_docs)
    if evaluation.get("status") == "error":
        return jsonify(evaluation), 400

    return jsonify(evaluation)


@app.route("/api/knowledge-base", methods=["GET"])
def api_knowledge_base():
    """
    GET /api/knowledge-base
    Returns all claim types available in the knowledge base.
    """
    json_path = os.path.join(app.config["DATA_FOLDER"], "document_requirements.json")
    if not os.path.exists(json_path):
        return jsonify({"claim_types": []})

    with open(json_path, "r", encoding="utf-8") as f:
        kb = json.load(f)
    return jsonify(kb)


# Health check
@app.route("/api/status", methods=["GET"])
def api_status():
    """Returns application status and configuration diagnostic."""
    client = get_gemini_client()
    return jsonify({
        "app": "PolicyAssist",
        "version": "1.1.0",
        "gemini_configured": client is not None,
        "gemini_model": DEFAULT_GEMINI_MODEL,
        "sample_policies_count": len(os.listdir(app.config["SAMPLES_FOLDER"])) if os.path.exists(app.config["SAMPLES_FOLDER"]) else 0,
        "cached_policies": len(POLICY_CACHE)
    })


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
