"use strict";
/**
 * Content Script
 *
 * Injects into web pages to detect login forms and handle autofill.
 * Communicates with background script for credential retrieval.
 */
/**
 * Find login forms on the page
 */
function detectLoginForms(options) {
    const forms = [];
    const includeAlreadyDetected = options?.includeAlreadyDetected === true;
    // Find all password fields
    const passwordFields = document.querySelectorAll(includeAlreadyDetected
        ? 'input[type="password"]'
        : 'input[type="password"]:not([data-vault-detected])');
    passwordFields.forEach((passwordField) => {
        if (!includeAlreadyDetected) {
            passwordField.setAttribute('data-vault-detected', 'true');
        }
        // Find associated username field
        const form = passwordField.closest('form');
        let usernameField = null;
        // Look for username field in same form
        if (form) {
            usernameField = form.querySelector('input[type="email"], input[type="text"][name*="user"], ' +
                'input[type="text"][name*="email"], input[type="text"][name*="login"], ' +
                'input[type="text"][autocomplete="username"], input[autocomplete="email"]');
        }
        // If no form, look for nearby username field
        if (!usernameField) {
            const parent = passwordField.parentElement?.parentElement || document.body;
            usernameField = parent.querySelector('input[type="email"], input[type="text"]');
        }
        forms.push({
            form,
            usernameField,
            passwordField,
        });
    });
    return forms;
}
// ============================================================================
// Autofill UI
// ============================================================================
let autofillPopup = null;
/**
 * Create autofill popup near a form field
 */
function createAutofillPopup(anchorElement, credentials) {
    removeAutofillPopup();
    if (credentials.length === 0)
        return;
    const rect = anchorElement.getBoundingClientRect();
    // Get theme from storage (async, but we'll use default initially)
    chrome.storage.local.get(['vaultTheme'], (result) => {
        const theme = result.vaultTheme || 'dark';
        createPopupWithTheme(theme, rect, credentials);
    });
}
function createPopupWithTheme(theme, rect, credentials) {
    autofillPopup = document.createElement('div');
    autofillPopup.className = 'vault-autofill-popup';
    autofillPopup.setAttribute('data-theme', theme);
    autofillPopup.style.cssText = `
    position: fixed;
    top: ${rect.bottom + window.scrollY + 4}px;
    left: ${rect.left + window.scrollX}px;
    z-index: 2147483647;
    background: ${theme === 'light' ? '#ffffff' : '#141414'};
    border: 1px solid ${theme === 'light' ? '#e0e0e0' : '#262626'};
    border-radius: 8px;
    box-shadow: 0 4px 20px ${theme === 'light' ? 'rgba(0, 0, 0, 0.15)' : 'rgba(0, 0, 0, 0.4)'};
    min-width: 280px;
    max-width: 400px;
    overflow: hidden;
    font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  `;
    // Header
    const header = document.createElement('div');
    header.className = 'vault-autofill-header';
    header.style.cssText = `
    padding: 12px 16px;
    background: ${theme === 'light' ? '#f8f9fa' : '#141414'};
    color: #2ecc71;
    font-size: 13px;
    font-weight: 300;
    display: flex;
    align-items: center;
    gap: 8px;
    border-bottom: 1px solid ${theme === 'light' ? '#e0e0e0' : '#262626'};
  `;
    header.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
      <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
    Vault
  `;
    autofillPopup.appendChild(header);
    // Credential list
    const list = document.createElement('div');
    list.style.cssText = 'max-height: 300px; overflow-y: auto;';
    credentials.forEach((cred, index) => {
        const item = document.createElement('div');
        item.className = 'vault-credential-item';
        item.style.cssText = `
      padding: 12px 16px;
      cursor: pointer;
      border-bottom: 1px solid ${theme === 'light' ? '#f0f0f0' : '#262626'};
      transition: background 0.15s ease;
    `;
        item.innerHTML = `
      <div style="font-size: 14px; color: ${theme === 'light' ? '#1a1a2e' : '#fff'}; font-weight: 500; margin-bottom: 2px;">
        ${escapeHtml(cred.title)}
      </div>
      <div style="font-size: 12px; color: ${theme === 'light' ? '#666' : '#8888aa'};">
        ${escapeHtml(cred.username)}
      </div>
    `;
        item.addEventListener('mouseenter', () => {
            item.style.background = theme === 'light' ? '#f5f5f5' : '#1e1e1e';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = 'transparent';
        });
        item.addEventListener('click', () => {
            fillCredentials(cred.id);
            removeAutofillPopup();
        });
        list.appendChild(item);
    });
    autofillPopup.appendChild(header);
    autofillPopup.appendChild(list);
    document.body.appendChild(autofillPopup);
    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', handleClickOutside);
    }, 100);
}
function handleClickOutside(event) {
    if (autofillPopup && !autofillPopup.contains(event.target)) {
        removeAutofillPopup();
    }
}
function removeAutofillPopup() {
    if (autofillPopup) {
        autofillPopup.remove();
        autofillPopup = null;
        document.removeEventListener('click', handleClickOutside);
    }
}
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
// ============================================================================
// Autofill Logic
// ============================================================================
let currentForms = [];
/**
 * Fill credentials into the detected form
 */
async function fillCredentials(entryId) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'fillCredentials',
            entryId,
        });
        if (response?.username && response?.password) {
            currentForms.forEach(({ usernameField, passwordField }) => {
                if (usernameField) {
                    usernameField.value = response.username;
                    usernameField.dispatchEvent(new Event('input', { bubbles: true }));
                    usernameField.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (passwordField) {
                    passwordField.value = response.password;
                    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordField.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }
    }
    catch (error) {
        console.error('Failed to fill credentials:', error);
    }
}
/**
 * Request credentials for current page
 */
async function requestCredentials() {
    try {
        const credentials = await chrome.runtime.sendMessage({
            type: 'getCredentials',
            url: window.location.href,
        });
        if (credentials && credentials.length > 0 && currentForms.length > 0) {
            const targetField = currentForms[0].usernameField || currentForms[0].passwordField;
            if (targetField) {
                createAutofillPopup(targetField, credentials);
            }
        }
    }
    catch (error) {
        console.error('Failed to get credentials:', error);
    }
}
// ============================================================================
// Vault Icon Injection
// ============================================================================
/**
 * Add vault icon to input fields
 */
function injectVaultIcons() {
    currentForms.forEach(({ usernameField, passwordField }) => {
        [usernameField, passwordField].forEach((field) => {
            if (!field || field.hasAttribute('data-vault-icon'))
                return;
            field.setAttribute('data-vault-icon', 'true');
            // Create icon container
            const iconContainer = document.createElement('div');
            iconContainer.className = 'vault-icon-container';
            iconContainer.style.cssText = `
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        width: 24px;
        height: 24px;
        cursor: pointer;
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: background 0.15s ease;
      `;
            iconContainer.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#667eea" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
        </svg>
      `;
            iconContainer.addEventListener('mouseenter', () => {
                iconContainer.style.background = 'rgba(102, 126, 234, 0.1)';
            });
            iconContainer.addEventListener('mouseleave', () => {
                iconContainer.style.background = 'transparent';
            });
            iconContainer.addEventListener('click', (e) => {
                e.stopPropagation();
                requestCredentials();
            });
            // Position the icon
            const wrapper = document.createElement('div');
            wrapper.style.cssText = 'position: relative; display: inline-block;';
            // Adjust field padding
            const computedStyle = window.getComputedStyle(field);
            const currentPaddingRight = parseInt(computedStyle.paddingRight) || 0;
            field.style.paddingRight = `${currentPaddingRight + 32}px`;
            field.parentNode?.insertBefore(wrapper, field);
            wrapper.appendChild(field);
            wrapper.appendChild(iconContainer);
        });
    });
}
// ============================================================================
// Message Listener
// ============================================================================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'triggerAutofill') {
        currentForms = detectLoginForms({ includeAlreadyDetected: true });
        if (currentForms.length > 0) {
            requestCredentials();
        }
    }
    if (message.type === 'fill') {
        const username = message.username;
        const password = message.password;
        if (typeof username === 'string' && typeof password === 'string') {
            currentForms = detectLoginForms({ includeAlreadyDetected: true });
            currentForms.forEach(({ usernameField, passwordField }) => {
                if (usernameField) {
                    usernameField.value = username;
                    usernameField.dispatchEvent(new Event('input', { bubbles: true }));
                    usernameField.dispatchEvent(new Event('change', { bubbles: true }));
                }
                if (passwordField) {
                    passwordField.value = password;
                    passwordField.dispatchEvent(new Event('input', { bubbles: true }));
                    passwordField.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }
    }
    return true;
});
// ============================================================================
// Initialization
// ============================================================================
function init() {
    // Detect forms on page load
    currentForms = detectLoginForms();
    if (currentForms.length > 0) {
        injectVaultIcons();
    }
    // Watch for dynamic forms
    const observer = new MutationObserver(() => {
        const newForms = detectLoginForms();
        if (newForms.length > currentForms.length) {
            currentForms = newForms;
            injectVaultIcons();
        }
    });
    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}
// Run when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
}
else {
    init();
}
