/**
 * PolicyAssist - Main Application JavaScript
 * Global utilities and shared helpers
 */

// Show alert banner inside a container
function showAlert(containerId, message, type = 'danger') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const alertClass = type === 'success' ? 'alert-success' : (type === 'info' ? 'alert-info' : 'alert-danger');
  const icon = type === 'success' 
    ? '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>'
    : '<svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';

  container.className = `alert ${alertClass}`;
  container.innerHTML = `
    <div style="flex-shrink: 0;">${icon}</div>
    <div style="flex: 1;">${message}</div>
  `;
  container.style.display = 'flex';
}

function hideAlert(containerId) {
  const container = document.getElementById(containerId);
  if (container) {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Smooth scroll for homepage Get Started button if #features exists
  const getStartedBtn = document.getElementById('getStartedBtn');
  const featuresSection = document.getElementById('features');
  if (getStartedBtn && featuresSection && window.location.pathname === '/') {
    getStartedBtn.addEventListener('click', (e) => {
      // Let it navigate directly to /policy as required, or smooth scroll
      // The button in index.html already links to /policy
    });
  }
});
