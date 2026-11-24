/**
 * PolicyAssist - Check Documents Feature (Feature Three)
 * Compares collected documents against requirements, calculates readiness metrics,
 * and surfaces missing items needing user attention.
 */

let checkClaimType = "accident_collision";
let markedStatus = {}; // { docId: 'available' | 'missing' }
let currentDocuments = [];

document.addEventListener("DOMContentLoaded", () => {
  const selectElem = document.getElementById("checkClaimTypeSelect");
  const markAllBtn = document.getElementById("markAllAvailableBtn");
  const resetBtn = document.getElementById("resetCheckBtn");

  // Read URL param if available
  const urlParams = new URLSearchParams(window.location.search);
  const typeParam = urlParams.get("type");
  if (typeParam && ["accident_collision", "vehicle_theft", "vehicle_damage"].includes(typeParam)) {
    checkClaimType = typeParam;
    if (selectElem) selectElem.value = typeParam;
  }

  // Restore marked state from sessionStorage if matching claim type
  const savedType = sessionStorage.getItem("policyassist_claim_type");
  const savedState = sessionStorage.getItem("policyassist_marked_docs");

  if (savedType === checkClaimType && savedState) {
    try {
      markedStatus = JSON.parse(savedState);
    } catch (e) {
      markedStatus = {};
    }
  }

  // Load documents
  loadVerificationMatrix(checkClaimType);

  // Switch claim type
  if (selectElem) {
    selectElem.addEventListener("change", (e) => {
      checkClaimType = e.target.value;
      markedStatus = {}; // reset for new scenario
      loadVerificationMatrix(checkClaimType);
    });
  }

  // Mark all available button
  if (markAllBtn) {
    markAllBtn.addEventListener("click", () => {
      currentDocuments.forEach(doc => {
        markedStatus[doc.id] = "available";
      });
      renderMatrixRows();
      evaluateReadiness();
    });
  }

  // Reset status button
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      currentDocuments.forEach(doc => {
        markedStatus[doc.id] = "missing";
      });
      renderMatrixRows();
      evaluateReadiness();
    });
  }
});

/**
 * Loads knowledge base documents for selected scenario
 */
async function loadVerificationMatrix(claimType) {
  try {
    const res = await fetch("/api/generate-checklist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim_type: claimType })
    });

    const data = await res.json();

    if (res.ok && data.status === "success") {
      currentDocuments = data.documents || [];

      // Initialize default 'missing' status for any unmarked document
      currentDocuments.forEach(doc => {
        if (!markedStatus[doc.id]) {
          markedStatus[doc.id] = "missing";
        }
      });

      renderMatrixRows();
      evaluateReadiness();
    }
  } catch (err) {
    console.error("Failed to load verification matrix:", err);
  }
}

/**
 * Renders the comparison rows with Available / Missing toggle buttons
 */
function renderMatrixRows() {
  const container = document.getElementById("compareList");
  if (!container) return;

  container.innerHTML = "";

  currentDocuments.forEach(doc => {
    const status = markedStatus[doc.id] || "missing";
    const isAvail = status === "available";

    const row = document.createElement("div");
    row.className = `compare-row ${isAvail ? "status-available" : "status-missing"}`;
    row.id = `row_${doc.id}`;

    const badgeLabel = doc.category === "standard" ? "Standard" : "Conditional";
    const badgeClass = doc.category === "standard" ? "badge-standard" : "badge-conditional";

    row.innerHTML = `
      <div class="compare-info">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span class="compare-name">${doc.name}</span>
          <span class="doc-badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <p class="compare-desc">${doc.description}</p>
      </div>

      <div class="toggle-group">
        <button type="button" class="toggle-btn btn-available ${isAvail ? 'active' : ''}" 
                onclick="setDocumentStatus('${doc.id}', 'available')">
          <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>
          Available
        </button>
        <button type="button" class="toggle-btn btn-missing ${!isAvail ? 'active' : ''}" 
                onclick="setDocumentStatus('${doc.id}', 'missing')">
          <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          Missing
        </button>
      </div>
    `;

    container.appendChild(row);
  });
}

/**
 * Updates a document's status and recalculates
 */
function setDocumentStatus(docId, newStatus) {
  markedStatus[docId] = newStatus;

  // Update UI row appearance immediately
  const row = document.getElementById(`row_${docId}`);
  if (row) {
    if (newStatus === "available") {
      row.className = "compare-row status-available";
      const availBtn = row.querySelector(".btn-available");
      const missBtn = row.querySelector(".btn-missing");
      if (availBtn) availBtn.classList.add("active");
      if (missBtn) missBtn.classList.remove("active");
    } else {
      row.className = "compare-row status-missing";
      const availBtn = row.querySelector(".btn-available");
      const missBtn = row.querySelector(".btn-missing");
      if (availBtn) availBtn.classList.remove("active");
      if (missBtn) missBtn.classList.add("active");
    }
  }

  evaluateReadiness();
}

/**
 * Calls /api/check-documents to evaluate completion & missing items
 */
async function evaluateReadiness() {
  try {
    const res = await fetch("/api/check-documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        claim_type: checkClaimType,
        marked_documents: markedStatus
      })
    });

    const data = await res.json();

    if (res.ok && data.status === "success") {
      updateSummaryUI(data);

      // Persist to session storage
      sessionStorage.setItem("policyassist_claim_type", checkClaimType);
      sessionStorage.setItem("policyassist_marked_docs", JSON.stringify(markedStatus));
    }
  } catch (err) {
    console.error("Evaluation error:", err);
  }
}

/**
 * Updates the summary metrics, headline, and missing items callout
 */
function updateSummaryUI(data) {
  const headlineElem = document.getElementById("readinessHeadline");
  const subtextElem = document.getElementById("readinessSubtext");
  const scenarioElem = document.getElementById("claimScenarioName");
  const statusBadge = document.getElementById("readinessStatusBadge");

  const statAvail = document.getElementById("statAvailable");
  const statMiss = document.getElementById("statMissing");
  const statPct = document.getElementById("statPercent");

  const attentionCard = document.getElementById("missingAttentionCard");
  const attentionCount = document.getElementById("missingAttentionCount");
  const attentionList = document.getElementById("missingAttentionList");

  if (scenarioElem) scenarioElem.textContent = data.claim_type_name;
  if (headlineElem) headlineElem.textContent = data.headline;

  if (statAvail) statAvail.textContent = data.available_count;
  if (statMiss) statMiss.textContent = data.missing_count;
  if (statPct) statPct.textContent = `${data.percentage}%`;

  // Status Badge and Subtext
  if (statusBadge) {
    if (data.status_category === "complete") {
      statusBadge.textContent = "Ready to Submit";
      statusBadge.className = "doc-badge badge-standard";
      if (subtextElem) subtextElem.textContent = "All required documents are marked available. You have compiled a complete claim file!";
    } else if (data.status_category === "partial") {
      statusBadge.textContent = "Partially Complete";
      statusBadge.className = "doc-badge badge-conditional";
      if (subtextElem) subtextElem.textContent = `${data.missing_count} document(s) still need attention before you submit your claim to the insurer.`;
    } else {
      statusBadge.textContent = "Action Required";
      statusBadge.className = "doc-badge badge-conditional";
      if (subtextElem) subtextElem.textContent = "Please review your documents and mark which ones you currently possess.";
    }
  }

  // Attention Callout for Missing Items
  if (attentionCard && attentionList && attentionCount) {
    if (data.missing_items && data.missing_items.length > 0) {
      attentionCount.textContent = data.missing_items.length;
      attentionList.innerHTML = "";

      data.missing_items.forEach(item => {
        const li = document.createElement("li");
        li.innerHTML = `<strong>${item.name}</strong> (${item.issuer}) — ${item.tip}`;
        attentionList.appendChild(li);
      });

      attentionCard.style.display = "block";
    } else {
      attentionCard.style.display = "none";
    }
  }
}
