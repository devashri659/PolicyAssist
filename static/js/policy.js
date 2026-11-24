/**
 * PolicyAssist - Policy Understanding Feature (Feature One)
 * Handles PDF uploads, text extraction feedback, and grounded AI question-answering.
 */

let currentDocId = null;
let currentDocName = "";

document.addEventListener("DOMContentLoaded", () => {
  const dropzone = document.getElementById("policyDropzone");
  const fileInput = document.getElementById("policyFileInput");
  const askForm = document.getElementById("askForm");
  const questionInput = document.getElementById("questionInput");
  const analyzePolicyBtn = document.getElementById("analyzePolicyBtn");

  // Drag and drop event listeners
  if (dropzone && fileInput) {
    dropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
      dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileUpload(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleFileUpload(e.target.files[0]);
      }
    });
  }

  // Question form submission
  if (askForm) {
    askForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const question = questionInput.value.trim();
      if (question) {
        submitQuestion(question);
      }
    });
  }

  // Analyze policy overview button
  if (analyzePolicyBtn) {
    analyzePolicyBtn.addEventListener("click", () => {
      submitQuestion("Please provide a concise overview of this policy: its primary coverage, notable limits or deductibles, and major exclusions.");
    });
  }
});

/**
 * Uploads a local PDF to /api/upload-policy
 */
async function handleFileUpload(file) {
  hideAlert("uploadAlert");

  if (!file.name.toLowerCase().endsWith(".pdf")) {
    showAlert("uploadAlert", "Invalid file type. Please upload a PDF document (.pdf).", "danger");
    return;
  }

  const formData = new FormData();
  formData.append("policy_file", file);

  const dropzoneText = document.querySelector(".dropzone-text");
  const originalText = dropzoneText.textContent;
  dropzoneText.textContent = `Uploading and parsing "${file.name}"...`;

  try {
    const res = await fetch("/api/upload-policy", {
      method: "POST",
      body: formData
    });

    const data = await res.json();

    if (res.ok && data.status === "success") {
      setDocumentLoaded(data.doc_id, data.filename, data.page_count, data.word_count);
      showAlert("uploadAlert", data.message, "success");
    } else {
      showAlert("uploadAlert", data.message || "Failed to process PDF.", "danger");
    }
  } catch (err) {
    showAlert("uploadAlert", `Upload error: ${err.message}`, "danger");
  } finally {
    dropzoneText.textContent = originalText;
  }
}

/**
 * Loads a built-in sample policy for testing
 */
async function loadSamplePolicy(sampleType) {
  hideAlert("uploadAlert");

  try {
    const res = await fetch("/api/load-sample-policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sample_name: sampleType })
    });

    const data = await res.json();

    if (res.ok && data.status === "success") {
      setDocumentLoaded(data.doc_id, data.filename, data.page_count, data.word_count);
      showAlert("uploadAlert", data.message, "success");
    } else {
      showAlert("uploadAlert", data.message || "Failed to load sample policy.", "danger");
    }
  } catch (err) {
    showAlert("uploadAlert", `Failed to load sample: ${err.message}`, "danger");
  }
}

/**
 * Updates UI state when a document is active
 */
function setDocumentLoaded(docId, filename, pages, words) {
  currentDocId = docId;
  currentDocName = filename;

  const docStatusCard = document.getElementById("docStatusCard");
  const docNameDisplay = document.getElementById("docNameDisplay");
  const docMetaDisplay = document.getElementById("docMetaDisplay");
  const askBtn = document.getElementById("askBtn");
  const analyzeBtn = document.getElementById("analyzePolicyBtn");

  if (docNameDisplay) docNameDisplay.textContent = filename;
  if (docMetaDisplay) docMetaDisplay.textContent = `${pages} page(s) • ~${words} words extracted`;
  if (docStatusCard) docStatusCard.style.display = "flex";

  if (askBtn) askBtn.disabled = false;
  if (analyzeBtn) analyzeBtn.disabled = false;
}

/**
 * Triggers a question from one of the suggested chips
 */
function askPresetQuestion(question) {
  const input = document.getElementById("questionInput");
  if (input) {
    input.value = question;
  }
  submitQuestion(question);
}

/**
 * Submits question to /api/ask-policy
 */
async function submitQuestion(question) {
  if (!currentDocId) {
    showAlert("uploadAlert", "Please upload a policy PDF or click a demo policy above before asking questions.", "danger");
    return;
  }

  const qaLoading = document.getElementById("qaLoading");
  const answerCard = document.getElementById("answerCard");
  const displayedQuestion = document.getElementById("displayedQuestion");
  const displayedAnswer = document.getElementById("displayedAnswer");
  const askBtn = document.getElementById("askBtn");

  if (qaLoading) qaLoading.style.display = "block";
  if (answerCard) answerCard.style.display = "none";
  if (askBtn) askBtn.disabled = true;

  try {
    const res = await fetch("/api/ask-policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        doc_id: currentDocId,
        question: question
      })
    });

    const data = await res.json();

    if (res.ok && data.status === "success") {
      if (displayedQuestion) displayedQuestion.textContent = `Q: ${question}`;
      if (displayedAnswer) displayedAnswer.innerHTML = formatMarkdownAnswer(data.answer);
      if (answerCard) answerCard.style.display = "block";

      addQuestionToHistory(question, data.answer);
    } else {
      if (displayedQuestion) displayedQuestion.textContent = `Q: ${question}`;
      const errorMsg = data.message || "An error occurred while answering your question.";
      if (displayedAnswer) {
        displayedAnswer.innerHTML = `
          <div class="alert alert-danger" style="margin: 0;">
            <strong>Unable to answer:</strong> ${errorMsg}
          </div>
        `;
      }
      if (answerCard) answerCard.style.display = "block";
    }
  } catch (err) {
    if (displayedQuestion) displayedQuestion.textContent = `Q: ${question}`;
    if (displayedAnswer) {
      displayedAnswer.innerHTML = `
        <div class="alert alert-danger" style="margin: 0;">
          <strong>Request failed:</strong> ${err.message}
        </div>
      `;
    }
    if (answerCard) answerCard.style.display = "block";
  } finally {
    if (qaLoading) qaLoading.style.display = "none";
    if (askBtn) askBtn.disabled = false;
  }
}

/**
 * Formats AI-generated policy answers:
 * - Safely escapes HTML to prevent XSS / script injection
 * - Strips unwanted *** / --- dividers and duplicate disclaimers
 * - Parses Markdown headings, bulleted lists, numbered lists, and bold text
 * - Styles page references [Page X] as subtle citations
 * - Ensures clean vertical spacing between sections and list items
 */
function formatMarkdownAnswer(text) {
  if (!text) return "";

  // 1. Strip unwanted standalone dividers (***, ---, ___) and artifacts
  let cleaned = text
    .replace(/^\s*([*\-_])\s*\1\s*\1[\s*\-_]*$/gm, "")
    .replace(/^[\s*\-_]+|[\s*\-_]+$/g, "");

  // 2. Remove duplicate trailing disclaimers (e.g. "*Disclaimer: PolicyAssist...", "Disclaimer:...")
  cleaned = cleaned.replace(
    /(?:\n|^)\s*(?:\*{1,2}|_{1,2})?\s*(?:disclaimer|notice|important\s+notice)\s*[:\-].*?(?:insurer|insurance company|guarantee|approval|underwriting|decisions).*$/is,
    ""
  );

  // 3. HTML Entity Escaping (Safely prevent HTML/JS injection)
  function escapeHTML(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // 4. Helper for formatting inline markdown: bold, italic, code, page citations
  function formatInline(inlineText) {
    let s = escapeHTML(inlineText);

    // Bold + Italic: ***text***
    s = s.replace(/\*\*\*(.*?)\*\*\*/g, "<strong><em>$1</em></strong>");

    // Bold: **text**
    s = s.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Italic: *text* or _text_ (when not part of a word)
    s = s.replace(/(^|[^\*])\*([^\*]+)\*([^\*]|$)/g, "$1<em>$2</em>$3");
    s = s.replace(/(^|[^_])_([^_]+)_([^_]|$)/g, "$1<em>$2</em>$3");

    // Inline code: `code`
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Page Citations: [Page 1], [Page 2, Section 3], [Pages 1-2]
    s = s.replace(/\[(Page[s]?\s*[^\]]+)\]/gi, '<span class="page-citation">[$1]</span>');

    return s;
  }

  // 5. Block-level parsing
  const rawLines = cleaned.split("\n");
  const htmlBlocks = [];

  let currentListType = null; // 'ul' or 'ol'
  let currentListItems = [];
  let currentParagraphLines = [];

  function flushParagraph() {
    if (currentParagraphLines.length > 0) {
      const pText = currentParagraphLines.join(" ").trim();
      if (pText) {
        htmlBlocks.push(`<p>${formatInline(pText)}</p>`);
      }
      currentParagraphLines = [];
    }
  }

  function flushList() {
    if (currentListType && currentListItems.length > 0) {
      const itemsHtml = currentListItems
        .map(item => `<li>${formatInline(item)}</li>`)
        .join("");
      htmlBlocks.push(`<${currentListType}>${itemsHtml}</${currentListType}>`);
      currentListType = null;
      currentListItems = [];
    }
  }

  for (let i = 0; i < rawLines.length; i++) {
    const rawLine = rawLines[i];
    const trimmed = rawLine.trim();

    // Skip empty lines or pure divider lines
    if (!trimmed || /^([*\-_])\s*\1\s*\1[\s*\-_]*$/.test(trimmed)) {
      flushParagraph();
      flushList();
      continue;
    }

    // Check for Headings: #, ##, ###, ####
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      const level = headingMatch[1].length <= 2 ? 3 : 4; // # or ## -> h3, ### or #### -> h4
      // Strip any bold markers inside heading text, e.g. "### **Section 1**" -> "Section 1"
      let hText = headingMatch[2].replace(/^\*\*(.*?)\*\*$/, "$1").trim();
      htmlBlocks.push(`<h${level} class="answer-heading">${formatInline(hText)}</h${level}>`);
      continue;
    }

    // Check for Bullet List Item: - or * followed by a space
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (currentListType && currentListType !== "ul") {
        flushList();
      }
      currentListType = "ul";
      currentListItems.push(bulletMatch[1]);
      continue;
    }

    // Check for Numbered List Item: 1. or 2) etc.
    const numberedMatch = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (numberedMatch) {
      flushParagraph();
      if (currentListType && currentListType !== "ol") {
        flushList();
      }
      currentListType = "ol";
      currentListItems.push(numberedMatch[1]);
      continue;
    }

    // Check for continuation of a list item or new paragraph
    if (currentListType && (rawLine.startsWith("    ") || rawLine.startsWith("\t"))) {
      if (currentListItems.length > 0) {
        currentListItems[currentListItems.length - 1] += " " + trimmed;
      }
      continue;
    }

    // Regular paragraph line
    flushList();
    currentParagraphLines.push(trimmed);
  }

  flushParagraph();
  flushList();

  return htmlBlocks.join("\n");
}

/**
 * Appends previous Q&A to session history accordion
 */
function addQuestionToHistory(question, answer) {
  const historyContainer = document.getElementById("qaHistory");
  const historyList = document.getElementById("historyList");
  if (!historyContainer || !historyList) return;

  historyContainer.style.display = "block";

  const item = document.createElement("div");
  item.style.backgroundColor = "#F8FAF9";
  item.style.border = "1px solid var(--border-color)";
  item.style.borderRadius = "var(--radius-sm)";
  item.style.padding = "12px 16px";

  item.innerHTML = `
    <div style="font-size: 13.5px; font-weight: 700; color: var(--text-main); margin-bottom: 4px;">
      ${question}
    </div>
    <div style="font-size: 13px; color: var(--text-secondary); max-height: 80px; overflow-y: auto;">
      ${formatMarkdownAnswer(answer)}
    </div>
  `;

  historyList.prepend(item);
}
