/**
 * Popup Script
 * 
 * Handles the extension popup UI logic.
 */

// ============================================================================
// State
// ============================================================================

/** @type {Array<{id: string, title: string, username: string, url: (string|null), totpSecret?: string}>} */
let credentials = [];

let currentUrl = '';
let totpCodes = new Map(); // Store TOTP codes: entryId -> {code, timeRemaining}

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
const themeToggleBtn = mustGet('themeToggleBtn');
const themeIcon = mustGet('themeIcon');

// Modal elements
const addPasswordModal = mustGet('addPasswordModal');
const closeModalBtn = mustGet('closeModalBtn');
const addPasswordForm = mustGet('addPasswordForm');
const passwordTitle = mustGet('passwordTitle');
const passwordUsername = mustGet('passwordUsername');
const passwordPassword = mustGet('passwordPassword');
const passwordUrl = mustGet('passwordUrl');
const togglePasswordVisibility = mustGet('togglePasswordVisibility');
const cancelBtn = mustGet('cancelBtn');

// Generated password modal elements
const generatedPasswordModal = mustGet('generatedPasswordModal');
const closeGeneratedModalBtn = mustGet('closeGeneratedModalBtn');
const generatedPasswordValue = mustGet('generatedPasswordValue');
const copyGeneratedPassword = mustGet('copyGeneratedPassword');
const closeGeneratedBtn = mustGet('closeGeneratedBtn');
const useInFormBtn = mustGet('useInFormBtn');

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

        // TOTP code click handler
        const totpElement = item.querySelector('.totp-code');
        if (totpElement) {
            totpElement.addEventListener('click', (e) => {
                e.stopPropagation();
                const totpValue = totpElement.querySelector('.totp-code-value');
                if (totpValue && totpValue.textContent !== '---') {
                    navigator.clipboard.writeText(totpValue.textContent);
                    // Visual feedback
                    const originalText = totpValue.textContent;
                    totpValue.textContent = 'Copied!';
                    setTimeout(() => {
                        totpValue.textContent = originalText;
                    }, 1000);
                }
            });
            totpElement.style.cursor = 'pointer';
            totpElement.title = 'Click to copy TOTP code';
        }
    });
}

// Update TOTP codes
async function updateTOTPCodes() {
    for (const cred of credentials) {
        if (cred.totpSecret) {
            try {
                const response = await chrome.runtime.sendMessage({
                    type: 'getTOTP',
                    entryId: cred.id,
                });
                if (response && response.code) {
                    totpCodes.set(cred.id, { code: response.code, timeRemaining: response.timeRemaining || 0 });
                    const totpElement = document.querySelector(`[data-totp-id="${cred.id}"]`);
                    if (totpElement) {
                        const codeValue = totpElement.querySelector('.totp-code-value');
                        const timer = totpElement.querySelector('.totp-timer');
                        if (codeValue) codeValue.textContent = response.code;
                        if (timer) timer.textContent = `${response.timeRemaining || 0}s`;
                    }
                }
            } catch (error) {
                // Ignore errors
            }
        }
    }
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

// ============================================================================
// Modal Functions
// ============================================================================

function openAddPasswordModal() {
    // Auto-fill URL from current tab
    passwordUrl.value = currentUrl || '';
    
    // Try to extract title from URL
    if (currentUrl) {
        try {
            const urlObj = new URL(currentUrl);
            passwordTitle.value = urlObj.hostname.replace('www.', '');
        } catch {
            // Invalid URL, leave title empty
        }
    }
    
    // Ensure all inputs are enabled and editable
    passwordTitle.disabled = false;
    passwordUsername.disabled = false;
    passwordPassword.disabled = false;
    passwordUrl.disabled = false;
    passwordTitle.readOnly = false;
    passwordUsername.readOnly = false;
    passwordPassword.readOnly = false;
    passwordUrl.readOnly = false;
    
    addPasswordModal.style.display = 'flex';
    
    // Small delay to ensure modal is rendered before focusing
    setTimeout(() => {
        passwordTitle.focus();
        passwordTitle.select();
    }, 50);
}

function closeAddPasswordModal() {
    addPasswordModal.style.display = 'none';
    addPasswordForm.reset();
    
    // Reset password visibility
    isPasswordVisible = false;
    passwordPassword.type = 'password';
    const eyeIcon = mustGet('eyeIcon');
    eyeIcon.innerHTML = `
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
    `;
}

function openGeneratedPasswordModal(password) {
    generatedPasswordValue.value = password;
    generatedPasswordModal.style.display = 'flex';
}

function closeGeneratedPasswordModal() {
    generatedPasswordModal.style.display = 'none';
    generatedPasswordValue.value = '';
}

// ============================================================================
// Password Generation
// ============================================================================

function generatePassword(length = 20) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    for (let i = 0; i < length; i++) {
        password += chars[array[i] % chars.length];
    }
    return password;
}

// ============================================================================
// Event Listeners
// ============================================================================

addBtn.addEventListener('click', () => {
    openAddPasswordModal();
});

generateBtn.addEventListener('click', () => {
    const password = generatePassword(20);
    openGeneratedPasswordModal(password);
});

// Close modals
closeModalBtn.addEventListener('click', closeAddPasswordModal);
cancelBtn.addEventListener('click', closeAddPasswordModal);
closeGeneratedModalBtn.addEventListener('click', closeGeneratedPasswordModal);
closeGeneratedBtn.addEventListener('click', closeGeneratedPasswordModal);

// Close modal on background click
addPasswordModal.addEventListener('click', (e) => {
    if (e.target === addPasswordModal) {
        closeAddPasswordModal();
    }
});

// Prevent modal content clicks from closing the modal
const modalContent = addPasswordModal.querySelector('.modal-content');
if (modalContent) {
    modalContent.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

generatedPasswordModal.addEventListener('click', (e) => {
    if (e.target === generatedPasswordModal) {
        closeGeneratedPasswordModal();
    }
});

// Prevent generated modal content clicks from closing the modal
const generatedModalContent = generatedPasswordModal.querySelector('.modal-content');
if (generatedModalContent) {
    generatedModalContent.addEventListener('click', (e) => {
        e.stopPropagation();
    });
}

// Password visibility toggle
let isPasswordVisible = false;
togglePasswordVisibility.addEventListener('click', () => {
    isPasswordVisible = !isPasswordVisible;
    passwordPassword.type = isPasswordVisible ? 'text' : 'password';
    
    const eyeIcon = mustGet('eyeIcon');
    if (isPasswordVisible) {
        eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
        `;
    } else {
        eyeIcon.innerHTML = `
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
        `;
    }
});

// Copy generated password
copyGeneratedPassword.addEventListener('click', async () => {
    const password = generatedPasswordValue.value;
    if (password) {
        await navigator.clipboard.writeText(password);
        showToast('Password copied to clipboard');
        
        // Visual feedback
        const originalText = copyGeneratedPassword.innerHTML;
        copyGeneratedPassword.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"/>
            </svg>
        `;
        setTimeout(() => {
            copyGeneratedPassword.innerHTML = originalText;
        }, 1000);
    }
});

// Use generated password in add form
useInFormBtn.addEventListener('click', () => {
    const password = generatedPasswordValue.value;
    if (password) {
        closeGeneratedPasswordModal();
        openAddPasswordModal();
        passwordPassword.value = password;
        passwordPassword.type = 'text'; // Show it since it was generated
        isPasswordVisible = true;
        
        // Update eye icon
        const eyeIcon = mustGet('eyeIcon');
        eyeIcon.innerHTML = `
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
        `;
    }
});

// Form submission
addPasswordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const title = passwordTitle.value.trim();
    const username = passwordUsername.value.trim();
    const password = passwordPassword.value;
    const url = passwordUrl.value.trim();
    
    if (!title || !username || !password || !url) {
        showToast('Please fill in all fields', 'error');
        return;
    }
    
    // Validate URL
    try {
        new URL(url);
    } catch {
        showToast('Please enter a valid URL', 'error');
        return;
    }
    
    // Show loading state
    const saveBtn = mustGet('saveBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;
    
    try {
        const response = await chrome.runtime.sendMessage({
            type: 'saveCredentials',
            title,
            username,
            password,
            url,
        });
        
        // Response can be the ID string directly or an object with id
        const entryId = typeof response === 'string' ? response : (response?.id || response);
        
        if (entryId) {
            showToast('Password saved successfully!');
            closeAddPasswordModal();
            
            // Refresh credentials list
            credentials = await chrome.runtime.sendMessage({
                type: 'getCredentials',
                url: currentUrl,
            }) || [];
            renderCredentials(credentials);
        } else {
            showToast('Failed to save password', 'error');
        }
    } catch (error) {
        console.error('Failed to save password:', error);
        showToast('Failed to save password. Is the Vault app running?', 'error');
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        // Close modal if open, otherwise close popup
        if (addPasswordModal.style.display === 'flex') {
            closeAddPasswordModal();
            e.preventDefault();
            return;
        }
        if (generatedPasswordModal.style.display === 'flex') {
            closeGeneratedPasswordModal();
            e.preventDefault();
            return;
        }
        window.close();
    }

    // Check if user is typing in an input field (including modal inputs)
    const activeElement = document.activeElement;
    const isInputField = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.isContentEditable
    );
    
    // Check if any modal is open
    const isModalOpen = addPasswordModal.style.display === 'flex' || 
                       generatedPasswordModal.style.display === 'flex';

    // Only focus search on any letter key if:
    // 1. Not typing in an input field
    // 2. No modal is open
    // 3. Search input is not already focused
    if (e.key.length === 1 && 
        !e.ctrlKey && 
        !e.metaKey && 
        !isInputField && 
        !isModalOpen && 
        document.activeElement !== searchInput) {
        searchInput.focus();
    }
});

// Theme management
let currentTheme = 'dark';

function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
    if (theme === 'dark') {
        // Sun icon for light mode
        themeIcon.innerHTML = `
            <circle cx="12" cy="12" r="5"/>
            <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>
        `;
        themeToggleBtn.title = 'Switch to light mode';
    } else {
        // Moon icon for dark mode
        themeIcon.innerHTML = `
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        `;
        themeToggleBtn.title = 'Switch to dark mode';
    }
}

async function toggleTheme() {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // Try to sync with desktop app first
    try {
        const response = await chrome.runtime.sendMessage({ 
            type: 'setTheme', 
            theme: newTheme 
        });
        if (response?.success) {
            applyTheme(newTheme);
            chrome.storage.local.set({ vaultTheme: newTheme });
            return;
        }
    } catch (error) {
        // Desktop app not connected, just update locally
    }
    
    // Update locally if desktop app not available
    applyTheme(newTheme);
    chrome.storage.local.set({ vaultTheme: newTheme });
}

// Theme toggle button handler
themeToggleBtn.addEventListener('click', toggleTheme);

// Load theme on init
chrome.storage.local.get(['vaultTheme'], (result) => {
    const theme = result.vaultTheme || 'dark';
    applyTheme(theme);
});

// Listen for theme changes
chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'theme-changed') {
        applyTheme(message.theme);
    }
});

// Sync theme from desktop app on startup
chrome.runtime.sendMessage({ type: 'syncTheme' }).catch(() => {
    // Ignore if desktop app not connected
});

// Initialize
init();

// Update TOTP codes every second
setInterval(updateTOTPCodes, 1000);
// Initial update after a short delay to ensure credentials are loaded
setTimeout(updateTOTPCodes, 500);
