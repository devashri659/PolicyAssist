# PolicyAssist – Insurance Policy & Document Assistant

PolicyAssist is a web application that helps users understand car insurance policies and organize the documents needed for a claim. Users can upload a policy PDF, ask questions about its contents, view claim document checklists, and check which documents may still be missing.

## Features

- **Policy Q&A:** Extracts text from uploaded policy PDFs and uses the Gemini API to answer questions based on the document.
- **Claim Checklists:** Provides document checklists for accident, theft/total loss, and non-collision damage claims.
- **Document Readiness:** Tracks available and missing documents and displays a completion summary.
- **Sample Policies:** Includes sample PDFs for trying the application.

## Technology Stack

- Python and Flask
- Google Gemini API
- PyMuPDF for PDF text extraction
- HTML, CSS, and JavaScript
- JSON for claim document requirements

## Setup

1. Clone or download this repository and open its folder in a terminal.
2. Install the dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Create a `.env` file using `.env.example` as a template and add your Gemini API key:

   ```env
   GEMINI_API_KEY=your_api_key_here
   GEMINI_MODEL=your_configured_model_name
   ```

4. Start the application:

   ```bash
   python app.py
   ```

5. Open `http://127.0.0.1:5000` in your browser.

## Run Tests

If the test suite is included, run it with:

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

## Limitations

The application extracts embedded text from PDFs; scanned documents without a text layer are not supported by the current extraction workflow. AI responses are intended to help users understand policy wording and should be checked against the official policy and insurer requirements.

## Future Improvements

Possible enhancements include OCR for scanned documents and exporting a summary of available and missing claim documents.
