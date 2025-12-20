/**
 * Popup Script
 * 
 * Handles the extension popup UI logic.
 */

// ============================================================================
// State
// ============================================================================

/** @type {Array<{id: string, title: string, username: string, url: (string|null)}>} */
let credentials = [];

let currentUrl = '';

// ============================================================================
// DOM Elements
// ============================================================================

function mustGet(id) {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element: ${id}`);
    return el;
}

const loadingState = mustGet('loadingState');
const lockedState = mustGet('lockedState');
const emptyState = mustGet('emptyState');
const credentialList = mustGet('credentialList');
const searchInput = /** @type {HTMLInputElement} */ (mustGet('searchInput'));
const lockBtn = mustGet('lockBtn');
const openAppBtn = mustGet('openAppBtn');
const addBtn = mustGet('addBtn');
const generateBtn = mustGet('generateBtn');

// ============================================================================
// UI Helpers
// ============================================================================

function showState(state) {
    loadingState.style.display = state === 'loading' ? 'flex' : 'none';
    lockedState.style.display = state === 'locked' ? 'flex' : 'none';
    emptyState.style.display = state === 'empty' ? 'flex' : 'none';
    credentialList.style.display = state === 'list' ? 'block' : 'none';
}

function getFaviconUrl(url) {
    if (!url) return '';
    try {
        const urlObj = new URL(url);
        return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
    } catch {
        return '';
    }
}

function getInitial(title) {
    return title.charAt(0).toUpperCase();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'success') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// ============================================================================
// Credential Rendering
// ============================================================================

function renderCredentials(items) {
    if (items.length === 0) {
        showState('empty');
        return;
    }

    showState('list');

    credentialList.innerHTML = items.map(cred => `
    <div class="credential-item" data-id="${cred.id}">
      <div class="credential-icon">
        ${cred.url
            ? `<img src="${getFaviconUrl(cred.url)}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">`
            : ''}
        <span style="display: ${cred.url ? 'none' : 'flex'}">${getInitial(cred.title)}</span>
      </div>
      <div class="credential-info">
        <div class="credential-title">${escapeHtml(cred.title)}</div>
        <div class="credential-username">${escapeHtml(cred.username)}</div>
      </div>
      <div class="credential-actions">
        <button class="action-btn copy-user-btn" title="Copy Username">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="8" r="4"/>
            <path d="M20 21a8 8 0 1 0-16 0"/>
          </svg>
        </button>
        <button class="action-btn copy-pass-btn" title="Copy Password">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

    // Attach event listeners
    credentialList.querySelectorAll('.credential-item').forEach(item => {
        const id = item.getAttribute('data-id');
        if (!id) return;

        item.addEventListener('click', (e) => {
            const target = /** @type {HTMLElement} */ (e.target);
            if (target.closest('.action-btn')) return;
            fillCredential(id);
        });

        item.querySelector('.copy-user-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            copyUsername(id);
        });

        item.querySelector('.copy-pass-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            copyPassword(id);
        });
    });
}

// ============================================================================
// Actions
// ============================================================================

async function fillCredential(id) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'fillCredentials',
            entryId: id,
        });

        if (response?.username) {
            // Send to content script
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.id) {
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'fill',
                    username: response.username,
                    password: response.password,
                });
            }

            // Close popup
            window.close();
        }
    } catch (error) {
        showToast('Failed to autofill', 'error');
    }
}

async function copyUsername(id) {
    const cred = credentials.find(c => c.id === id);
    if (cred) {
        await navigator.clipboard.writeText(cred.username);
        showToast('Username copied');
    }
}

async function copyPassword(id) {
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'fillCredentials',
            entryId: id,
        });

        if (response?.password) {
            await navigator.clipboard.writeText(response.password);
            showToast('Password copied');

            // Clear clipboard after 30 seconds
            setTimeout(async () => {
                const current = await navigator.clipboard.readText();
                if (current === response.password) {
                    await navigator.clipboard.writeText('');
                }
            }, 30000);
        }
    } catch (error) {
        showToast('Failed to copy password', 'error');
    }
}

async function openVaultApp() {
    await chrome.runtime.sendMessage({ type: 'openVaultApp' });
}

// ============================================================================
// Search
// ============================================================================

function filterCredentials(query) {
    if (!query) {
        renderCredentials(credentials);
        return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = credentials.filter(cred =>
        cred.title.toLowerCase().includes(lowerQuery) ||
        cred.username.toLowerCase().includes(lowerQuery) ||
        (cred.url && cred.url.toLowerCase().includes(lowerQuery))
    );

    renderCredentials(filtered);
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
    showState('loading');

    try {
        // Get current tab URL
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentUrl = tab?.url || '';

        // Check if vault is unlocked
        const isUnlocked = await chrome.runtime.sendMessage({ type: 'isUnlocked' });

        if (!isUnlocked) {
            showState('locked');
            return;
        }

        // Get credentials for current site
        credentials = await chrome.runtime.sendMessage({
            type: 'getCredentials',
            url: currentUrl,
        }) || [];

        renderCredentials(credentials);
    } catch (error) {
        console.error('Init error:', error);
        showState('locked');
    }
}

// ============================================================================
// Event Listeners
// ============================================================================

searchInput.addEventListener('input', () => {
    filterCredentials(searchInput.value);
});

lockBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'lockVault' });
    showState('locked');
});

openAppBtn.addEventListener('click', openVaultApp);

addBtn.addEventListener('click', () => {
    // Open add page or show modal
    openVaultApp();
});

generateBtn.addEventListener('click', async () => {
    // Generate and copy password
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    const array = new Uint32Array(20);
    crypto.getRandomValues(array);
    for (let i = 0; i < 20; i++) {
        password += chars[array[i] % chars.length];
    }

    await navigator.clipboard.writeText(password);
    showToast('Password generated & copied');
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        window.close();
    }

    // Focus search on any letter key
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && document.activeElement !== searchInput) {
        searchInput.focus();
    }
});

// Initialize
init();
