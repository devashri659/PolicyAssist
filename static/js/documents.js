/**
 * PolicyAssist - Claim Documents Feature (Feature Two)
 * Generates claim-specific checklists from the JSON knowledge base with optional AI tips.
 */

let activeClaimType = "accident_collision";
let activeDocuments = [];
let collectedDocIds = new Set();

document.addEventListener("DOMContentLoaded", () => {
  const claimForm = document.getElementById("claimForm");
  const claimTypeSelect = document.getElementById("claimTypeSelect");
  const checkDocsLink = document.getElementById("goToCheckDocumentsLink");

  // Read URL param if available (e.g., ?type=vehicle_theft)
  const urlParams = new URLSearchParams(window.location.search);
  const typeParam = urlParams.get("type");
  if (typeParam && ["accident_collision", "vehicle_theft", "vehicle_damage"].includes(typeParam)) {
    activeClaimType = typeParam;
    if (claimTypeSelect) claimTypeSelect.value = typeParam;
  }

  // Restore saved collection state from sessionStorage if available
  const savedClaimType = sessionStorage.getItem("policyassist_claim_type");
  const savedMarked = sessionStorage.getItem("policyassist_marked_docs");
  if (savedClaimType === activeClaimType && savedMarked) {
    try {
      const parsed = JSON.parse(savedMarked);
      for (const [docId, status] of Object.entries(parsed)) {
        if (status === "available") {
          collectedDocIds.add(docId);
        }
      }
    } catch (e) {
      console.error("Error parsing saved state:", e);
    }
  }

  // Initial load
  loadChecklist(activeClaimType);

  // Form submission
  if (claimForm) {
    claimForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const selectedType = claimTypeSelect.value;
      const desc = document.getElementById("incidentDesc").value.trim();
      activeClaimType = selectedType;
      loadChecklist(selectedType, desc);
    });
  }

  // Dropdown change
  if (claimTypeSelect) {
    claimTypeSelect.addEventListener("change", (e) => {
      activeClaimType = e.target.value;
      collectedDocIds.clear(); // Reset for new type
      loadChecklist(activeClaimType);
    });
  }

  // Update check docs link
  if (checkDocsLink) {
    checkDocsLink.href = `/check-documents?type=${activeClaimType}`;
  }
});

/**
 * Fetches checklist data from /api/generate-checklist
 */
async function loadChecklist(claimType, description = "") {
  const loadingIndicator = document.getElementById("checklistLoading");
  const documentsList = document.getElementById("documentsList");
  const guidanceTitle = document.getElementById("guidanceTitle");
  const guidanceMessage = document.getElementById("guidanceMessage");
  const claimTitleHeader = document.getElementById("claimTitleHeader");
  const aiSummaryBox = document.getElementById("aiSummaryBox");
  const aiSummaryText = document.getElementById("aiSummaryText");
  const checkDocsLink = document.getElementById("goToCheckDocumentsLink");

  if (loadingIndicator) loadingIndicator.style.display = "block";
  if (documentsList) documentsList.innerHTML = "";
  if (aiSummaryBox) aiSummaryBox.style.display = "none";
  if (checkDocsLink) checkDocsLink.href = `/check-documents?type=${claimType}`;

  try {
    const res = await fetch("/api/generate-checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_type: claimType,
        description: description
      })
    });

    const data = await res.json();

    if (res.ok && data.status === "success") {
      activeDocuments = data.documents || [];

      // Update Header & Guidance Box
      if (claimTitleHeader) claimTitleHeader.textContent = `${data.name} Checklist`;
      if (guidanceTitle) guidanceTitle.textContent = `${data.name} Important Guidance`;
      if (guidanceMessage) guidanceMessage.textContent = data.guidance || data.short_desc;

      // Update AI Summary if present
      if (data.ai_summary && aiSummaryBox && aiSummaryText) {
        aiSummaryText.textContent = data.ai_summary;
        aiSummaryBox.style.display = "block";
      }

      // Render items
      renderDocumentItems();
      updateProgressUI();
      persistState();
    } else {
      documentsList.innerHTML = `
        <div class="alert alert-danger">
          Failed to load checklist: ${data.message || "Unknown error"}
        </div>
      `;
    }
  } catch (err) {
    if (documentsList) {
      documentsList.innerHTML = `
        <div class="alert alert-danger">
          Connection error: ${err.message}
        </div>
      `;
    }
  } finally {
    if (loadingIndicator) loadingIndicator.style.display = "none";
  }
}

/**
 * Renders the document items into the checklist container
 */
function renderDocumentItems() {
  const container = document.getElementById("documentsList");
  if (!container) return;

  container.innerHTML = "";

  activeDocuments.forEach((doc) => {
    const isCollected = collectedDocIds.has(doc.id);
    const badgeClass = doc.category === "standard" ? "badge-standard" : "badge-conditional";
    const badgeLabel = doc.category === "standard" ? "Standard Required" : "Conditional / Event-Specific";

    const card = document.createElement("div");
    card.className = `doc-item-card ${isCollected ? "collected" : ""}`;
    card.id = `card_${doc.id}`;

    card.innerHTML = `
      <div class="doc-checkbox-wrapper">
        <div class="custom-checkbox" onclick="toggleDocumentCollection('${doc.id}')" title="Click to mark as collected">
          <svg viewBox="0 0 24 24">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
      </div>
      <div class="doc-content">
        <div class="doc-title-row">
          <span class="doc-name">${doc.name}</span>
          <span class="doc-badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <p class="doc-description">${doc.description}</p>
        <div class="doc-tip-box">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span><strong>Insurer Tip:</strong> ${doc.tip}</span>
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

/**
 * Toggles a document's collected status
 */
function toggleDocumentCollection(docId) {
  if (collectedDocIds.has(docId)) {
    collectedDocIds.delete(docId);
  } else {
    collectedDocIds.add(docId);
  }

  const card = document.getElementById(`card_${docId}`);
  if (card) {
    if (collectedDocIds.has(docId)) {
      card.classList.add("collected");
    } else {
      card.classList.remove("collected");
    }
  }

  updateProgressUI();
  persistState();
}

/**
 * Updates the progress bar and counter
 */
function updateProgressUI() {
  const total = activeDocuments.length;
  const collected = collectedDocIds.size;
  const percentage = total > 0 ? Math.round((collected / total) * 100) : 0;
  const remaining = Math.max(0, total - collected);

  const fill = document.getElementById("progressBarFill");
  const stats = document.getElementById("progressStats");
  const remainingText = document.getElementById("remainingCountText");

  if (fill) fill.style.width = `${percentage}%`;
  if (stats) stats.textContent = `${collected} of ${total} collected (${percentage}%)`;
  if (remainingText) {
    remainingText.textContent = remaining === 0 
      ? "All items collected!" 
      : `${remaining} item${remaining !== 1 ? 's' : ''} remaining`;
  }
}

/**
 * Stores status in sessionStorage for seamless handover to Feature Three
 */
function persistState() {
  const stateObj = {};
  activeDocuments.forEach(doc => {
    stateObj[doc.id] = collectedDocIds.has(doc.id) ? "available" : "missing";
  });

  sessionStorage.setItem("policyassist_claim_type", activeClaimType);
  sessionStorage.setItem("policyassist_marked_docs", JSON.stringify(stateObj));
}
