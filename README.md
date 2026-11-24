# PolicyAssist — AI-Powered Insurance Policy and Documentation Assistant

**PolicyAssist** is a clean, practical web application designed to help policyholders understand their car insurance policies, identify required claim documents, and verify documentation readiness before filing a claim.

Built to demonstrate grounded AI workflows, modular backend engineering, and clean UI execution for entry-level insurtech engineering interviews.

---

## 1. Problem Statement

Navigating auto insurance policies and filing claims is notoriously frustrating for consumers:
1. **Dense Policy Jargon**: Policies are filled with legal exclusions, sub-limits, and deductibles that standard consumers struggle to understand.
2. **Ambiguous Documentation Requirements**: Claimants often don't know which documents are mandatory versus conditional, leading to delays and claim rejections.
3. **Disorganized Claim Files**: Claimants submit incomplete packages without knowing what is still missing.

**PolicyAssist** solves these challenges by combining:
- **PyMuPDF-powered document extraction** with strictly grounded **Google Gemini API responses** that reference document pages and avoid hallucinations.
- A **curated insurance knowledge base** delivering structured, scenario-specific checklists.
- An **interactive document readiness matrix** that calculates completion and highlights missing items needing attention.

---

## 2. Features

### Feature 1: Understand Your Policy (`/policy`)
- **PDF Policy Upload**: Drag-and-drop or select any text-based insurance policy PDF (up to 16MB).
- **Instant Sample Policies**: Built-in comprehensive motor and motorcycle policies for instant one-click demonstration.
- **PyMuPDF Text Extraction**: Extracts text page-by-page, adds page markers, and computes word counts.
- **Empty / Scanned PDF Detection**: Shows a clear, helpful error if a PDF has no extractable text layer rather than hallucinating an analysis.
- **Grounded AI Q&A (Google Gemini)**: Answers questions strictly using policy text, cites page numbers, explains jargon simply, and explicitly states when information is not specified in the document.
- **Suggested Question Chips**: One-click questions covering coverage, major exclusions, deductibles, required claim documents, and policy conditions.

### Feature 2: Claim Documents Checklist (`/documents`)
- **Three Core Claim Scenarios**:
  - Accident or Collision
  - Vehicle Theft / Total Loss
  - Non-Collision Vehicle Damage (Flood, Fire, Vandalism, Falling Objects)
- **JSON Knowledge Base**: Retrieves itemized checklists from `data/document_requirements.json`.
- **Standard vs. Conditional Distinction**: Distinguishes universal requirements (e.g. Claim Form, RC, DL) from conditional documents (e.g. Police FIR, Fire Brigade Report, Untraced Report).
- **Insurer Tips**: Practical advice on what insurance surveyors and claim adjusters inspect for each document.
- **Interactive Checkboxes & Real-time Progress Bar**: Tracks documents as collected and computes remaining items.
- **Optional AI Incident Guidance**: Uses Google Gemini to provide tailored plain-English advice for an optional user-entered incident description.

### Feature 3: Check Document Readiness (`/check-documents`)
- **Readiness Matrix**: Toggle each document between **[ ✓ Available ]** and **[ ✗ Missing ]**.
- **Real-Time Completion Metrics**: Instant feedback showing total items, available count, missing count, and percentage.
- **Status Evaluation**: Generates clear summaries (e.g., *"Your checklist is partially complete. You have marked 4 of 8 documents as available."*).
- **Attention Alert List**: Automatically isolates and highlights missing documents with actionable tips.
- **Quick Actions**: "Mark All Available", "Reset Status", and direct session sync with Feature Two.

### Feature 4: Landing Dashboard (`/`)
- Exact recreation of the reference dashboard design.
- Warm, professional color palette: Primary Green (`#287D5A`), Light Green (`#E8F3ED`), and Soft Neutral Background (`#FAFAF8`).
- Clean typography (Inter) with subtle borders and shadows.
- Hero section featuring realistic insurance desk photography.
- Exactly three horizontal feature cards leading to the respective tool modules.

---

## 3. Technology Stack

- **Backend**: Python 3.12 / 3.13, Flask 3.1
- **PDF Text Extraction**: PyMuPDF (`pymupdf` 2.1)
- **AI Integration**: Official Google GenAI SDK (`google-genai` 1.0+) with `gemini-3.5-flash` (free tier eligible)
- **Knowledge Base**: Structured JSON (`data/document_requirements.json`)
- **Frontend**: Vanilla HTML5, CSS3 (Custom Design System), Vanilla JavaScript (No React, no frontend build step required)
- **Testing**: Python `unittest` test suite covering routes, file validations, calculations, and error flows

---

## 4. Project Directory Structure

```
policyassist/
├── app.py                      # Flask backend application & API routes (Google Gemini)
├── requirements.txt            # Python package dependencies
├── .env.example                # Template for environment configuration
├── .env                        # Active environment configuration (GEMINI_API_KEY)
├── .gitignore                  # Git ignore rules (excludes .env and uploads)
├── README.md                   # Complete project documentation
├── data/
│   ├── document_requirements.json  # Predefined claim documentation knowledge base
│   └── sample_policies/        # Built-in sample policies for instant evaluation
│       ├── Sample_Comprehensive_Motor_Policy.pdf
│       ├── Sample_Motorcycle_Policy.pdf
│       └── Sample_Scanned_NoText_Policy.pdf
├── static/
│   ├── css/
│   │   └── style.css           # Complete responsive stylesheet matching design
│   ├── images/
│   │   ├── insurance-hero.jpg  # Realistic insurance desk photograph for hero
│   │   └── hero-photo.jpg      # Cropped desk detail image
│   └── js/
│       ├── main.js             # Global UI helpers and alert banners
│       ├── policy.js           # Feature 1: PDF upload & AI question-answering
│       ├── documents.js        # Feature 2: Checklist generation & tracking
│       └── check_documents.js  # Feature 3: Readiness evaluation & missing items
├── templates/
│   ├── base.html               # Shared header, navigation, and footer
│   ├── index.html              # Homepage matching provided dashboard design
│   ├── policy.html             # Understand Your Policy page
│   ├── documents.html          # Claim Documents checklist page
│   ├── check_documents.html    # Check Document Readiness page
│   └── help.html               # User guide and FAQ page
├── tests/
│   └── test_policyassist.py    # Automated test suite (10 test cases)
└── uploads/                    # Temporary storage for uploaded policy PDFs
```

---

## 5. How the AI-Assisted Workflow Operates

Rather than relying on an opaque chatbot, PolicyAssist uses explicit, predictable function routing:

```
[User Action] ─────────────────────────┐
                                       │
  ├── 1. Uploads Policy & Asks Q's ────┼──> extract_policy_text() [PyMuPDF]
  │                                    │        │
  │                                    │        └──> answer_policy_question() [Google Gemini 3.5 Flash]
  │                                    │             (Strict Grounding & Page Citations)
  │                                    │
  ├── 2. Generates Claim Checklist ────┼──> get_claim_checklist() [JSON Knowledge Base]
  │                                    │        │
  │                                    │        └──> (Optional) explain_checklist_with_ai() [Gemini]
  │                                    │
  └── 3. Checks Missing Documents ─────┼──> evaluate_document_readiness() [Python Math & State]
                                                │
                                                └──> Computes % & Highlights Actionable Missing Items
```

### Deterministic vs. AI Separation:
- **Knowledge Base (Deterministic)**: Standard document requirements (e.g. Driver's License, RC, FIR) are loaded directly from `document_requirements.json`. This guarantees 100% reliability even if the Gemini API is offline or unconfigured.
- **Readiness Logic (Deterministic)**: Completion counts and missing item identification are evaluated mathematically by `evaluate_document_readiness()`.
- **Policy Understanding (AI-Assisted)**: Google Gemini (`gemini-3.5-flash`) is engaged exclusively to comprehend and synthesize the user's specific uploaded policy text. The prompt enforces zero hallucinations, explicit citations (e.g. `[Page 1]`), and an admission of ignorance if the document lacks the requested answer.

---

## 6. Installation & Setup

### Prerequisites
- Python 3.10+ installed on your computer.

### Step 1: Clone or Open Project Directory
```bash
cd C:\Users\devas\.gemini\antigravity\scratch\policyassist
```

### Step 2: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 3: Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Open `.env` in a text editor and add your Google Gemini API key:
```ini
GEMINI_API_KEY=your_actual_gemini_api_key_here
GEMINI_MODEL=gemini-3.5-flash
```
*(Get your free API key from Google AI Studio: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey))*

---

## 7. Running the Application

Start the Flask development server:
```bash
python app.py
```

Open your browser and navigate to:
```
http://127.0.0.1:5000
```

---

## 8. Running Automated Tests

Run the full automated test suite:
```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

All 10 test cases verify:
- Homepage rendering with exact branding and feature cards
- All page routes (`/policy`, `/documents`, `/check-documents`, `/help`)
- Validation against invalid file formats (`.txt`)
- Detection and error reporting for non-text / scanned PDFs
- Successful extraction of pages and words from text-based PDFs
- Built-in sample policy loading
- Graceful error messaging when `GEMINI_API_KEY` is absent
- Knowledge base checklist generation across all claim categories
- Document completion calculations and missing item classification
- Core text extraction unit logic

---

## 9. Current Limitations & Honest Disclaimers

To maintain transparency during technical interviews:
1. **Scanned PDFs / OCR**: The current implementation utilizes PyMuPDF for digital text extraction. Physical document photos or scanned PDFs without embedded text layers require an OCR pre-processing step (such as Tesseract or Google Cloud Vision), which is outside the current scope.
2. **Context Window**: For extremely large policy bundles (100+ pages), the application extracts the first 35,000 characters to stay within fast, responsive context bounds.
3. **No Legal or Underwriting Authority**: PolicyAssist provides document comprehension and organization assistance. It explicitly disclaims any authority to authenticate physical documents or guarantee claim approvals.

---

## 10. Future Improvements

- **Semantic Chunk Retrieval**: Implement text chunking and similarity search to query 200+ page corporate commercial policies.
- **Document OCR Integration**: Add client-side or server-side OCR to accept photos of paper insurance schedules.
- **Export & Email Pack**: One-click generation of a PDF or email summary detailing ready and missing documents to send directly to an insurance broker.
- **Multi-Vehicle Types**: Expand the knowledge base to support commercial fleets, marine cargo, and health insurance claims.
