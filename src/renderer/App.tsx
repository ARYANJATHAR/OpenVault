import React, { useState, useEffect } from 'react';

// Types for the Vault API exposed via preload
declare global {
    interface Window {
        vaultAPI: {
            vault: {
                create: (options: { path: string; password: string }) => Promise<{ success: boolean; error?: string }>;
                open: (options: { path: string; password: string }) => Promise<{ success: boolean; error?: string }>;
                lock: () => Promise<{ success: boolean }>;
                isUnlocked: () => Promise<boolean>;
            };
            entries: {
                getAll: () => Promise<Entry[]>;
                get: (id: string) => Promise<Entry | null>;
                add: (entry: Omit<Entry, 'id' | 'createdAt' | 'modifiedAt' | 'syncVersion'>) => Promise<string>;
                update: (id: string, updates: Partial<Entry>) => Promise<{ success: boolean }>;
                delete: (id: string) => Promise<{ success: boolean }>;
                findByUrl: (url: string) => Promise<Entry[]>;
                recordUsed: (id: string) => Promise<{ success: boolean }>;
            };
            password: {
                generate: (options?: { length?: number; uppercase?: boolean; lowercase?: boolean; numbers?: boolean; symbols?: boolean }) => Promise<string>;
            };
            app: {
                getVersion: () => Promise<string>;
                getPlatform: () => Promise<string>;
            };
            on: (channel: string, callback: (...args: any[]) => void) => void;
            off: (channel: string, callback: (...args: any[]) => void) => void;
        };
    }
}

interface Entry {
    id: string;
    title: string;
    username: string;
    password: string;
    url: string | null;
    notes: string | null;
    totpSecret: string | null;
    folderId: string | null;
    createdAt: number;
    modifiedAt: number;
    lastUsedAt: number | null;
    syncVersion: number;
}

type View = 'unlock' | 'create' | 'vault' | 'settings';

const App: React.FC = () => {
    const [view, setView] = useState<View>('unlock');
    const [entries, setEntries] = useState<Entry[]>([]);
    const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [editDraft, setEditDraft] = useState({
        title: '',
        username: '',
        password: '',
        url: '',
        notes: ''
    });

    // Form state for new entry
    const [newEntry, setNewEntry] = useState({
        title: '',
        username: '',
        password: '',
        url: '',
        notes: ''
    });

    useEffect(() => {
        checkVaultStatus();
        window.vaultAPI?.on('quick-search', () => {
            document.getElementById('search-input')?.focus();
        });
        return () => window.vaultAPI?.off('quick-search', () => { });
    }, []);

    const checkVaultStatus = async () => {
        try {
            const unlocked = await window.vaultAPI?.vault.isUnlocked();
            if (unlocked) {
                await loadEntries();
                setView('vault');
            } else {
                try {
                    const result = await window.vaultAPI?.vault.open({ path: 'vault.db', password: '' });
                    setView(result?.error?.includes('Invalid password') ? 'unlock' : 'create');
                } catch {
                    setView('create');
                }
            }
        } catch (err) {
            setView('create');
        }
        setIsLoading(false);
    };

    const loadEntries = async () => {
        const allEntries = await window.vaultAPI?.entries.getAll();
        setEntries(allEntries || []);
    };

    const beginEdit = (entry: Entry) => {
        setIsEditing(true);
        setEditDraft({
            title: entry.title,
            username: entry.username,
            password: entry.password,
            url: entry.url || '',
            notes: entry.notes || ''
        });
    };

    const cancelEdit = () => {
        setIsEditing(false);
    };

    const saveEdit = async () => {
        if (!selectedEntry) return;

        const url = editDraft.url.trim();
        const notes = editDraft.notes.trim();

        await window.vaultAPI?.entries.update(selectedEntry.id, {
            title: editDraft.title,
            username: editDraft.username,
            password: editDraft.password,
            url: url.length > 0 ? url : null,
            notes: notes.length > 0 ? notes : null,
        });

        await loadEntries();
        const refreshed = await window.vaultAPI?.entries.get(selectedEntry.id);
        setSelectedEntry(refreshed || null);
        setIsEditing(false);
    };

    const deleteSelected = async () => {
        if (!selectedEntry) return;

        const ok = window.confirm(`Delete "${selectedEntry.title}"?`);
        if (!ok) return;

        await window.vaultAPI?.entries.delete(selectedEntry.id);
        await loadEntries();
        setSelectedEntry(null);
        setIsEditing(false);
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (password.length < 8) return setError('Minimum 8 characters');
        if (password !== confirmPassword) return setError('Passwords mismatch');
        setIsLoading(true);
        const result = await window.vaultAPI?.vault.create({ path: 'vault.db', password });
        if (result?.success) {
            await loadEntries();
            setView('vault');
        } else setError(result?.error || 'Failed to create');
        setIsLoading(false);
    };

    const handleUnlock = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        const result = await window.vaultAPI?.vault.open({ path: 'vault.db', password });
        if (result?.success) {
            await loadEntries();
            setView('vault');
            setPassword('');
        } else setError(result?.error || 'Invalid Master Password');
        setIsLoading(false);
    };

    const handleAddItem = async (e: React.FormEvent) => {
        e.preventDefault();
        const url = newEntry.url.trim();
        await window.vaultAPI?.entries.add({
            ...newEntry,
            url: url.length > 0 ? url : undefined,
            totpSecret: null,
            folderId: null,
            lastUsedAt: null
        });
        await loadEntries();
        setIsAddModalOpen(false);
        setNewEntry({ title: '', username: '', password: '', url: '', notes: '' });
    };

    const handleCopy = async (text: string) => {
        await navigator.clipboard.writeText(text);
    };

    const filteredEntries = entries.filter(e =>
        e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        e.username.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (isLoading) return <div className="app loading-screen"><div className="spinner" /></div>;

    if (view === 'create' || view === 'unlock') {
        const isCreate = view === 'create';
        return (
            <div className="unlock-screen">
                <div className="unlock-box">
                    <div className="vault-logo">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    </div>
                    <h1>{isCreate ? 'Create Your Vault' : 'Welcome'}</h1>
                    <p className="entry-subtext" style={{ marginBottom: '32px' }}>
                        {isCreate ? 'Set a master password' : 'Enter master password to unlock'}
                    </p>
                    <form onSubmit={isCreate ? handleCreate : handleUnlock}>
                        <div className="form-group">
                            <input
                                type="password"
                                placeholder="Master Key"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                autoFocus
                            />
                        </div>
                        {isCreate && (
                            <div className="form-group">
                                <input
                                    type="password"
                                    placeholder="Confirm Key"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                />
                            </div>
                        )}
                        {error && <p className="error-message" style={{ color: 'var(--error)', fontSize: '12px', marginBottom: '16px' }}>{error}</p>}
                        <button type="submit" className="primary-button">
                            {isCreate ? 'Initialize' : 'Unlock Access'}
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="app">
            <aside className="sidebar">
                <div className="sidebar-header">
                    <div className="brand">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                        <span>Vault</span>
                    </div>
                </div>
                <div className="search-container">
                    <div className="search-input-wrapper">
                        <input
                            id="search-input"
                            type="text"
                            placeholder="Find entry..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>
                <nav className="sidebar-nav">
                    <button className="nav-item active">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        </svg>
                        All Passwords
                        <span className="count">{entries.length}</span>
                    </button>
                    <button className="nav-item">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                        Favorites
                    </button>
                </nav>
                <div className="sidebar-footer">
                    <button className="icon-button" onClick={() => (window as any).vaultAPI.vault.lock().then(() => setView('unlock'))}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    </button>
                    <button className="icon-button">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="12" cy="12" r="3" />
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                        </svg>
                    </button>
                </div>
            </aside>

            <main className="main-content">
                <header className="content-header">
                    <h2>Explorer</h2>
                    <button className="add-button" onClick={() => setIsAddModalOpen(true)}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        New Entry
                    </button>
                </header>

                <div className="entry-list">
                    <div className="entry-grid">
                        {filteredEntries.map(entry => (
                            <div
                                key={entry.id}
                                className={`entry-card ${selectedEntry?.id === entry.id ? 'selected' : ''}`}
                                onClick={() => {
                                    setSelectedEntry(entry);
                                    setIsEditing(false);
                                }}
                            >
                                <div className="entry-avatar">{entry.title.charAt(0).toUpperCase()}</div>
                                <div className="entry-meta">
                                    <div className="entry-name">{entry.title}</div>
                                    <div className="entry-subtext">{entry.username}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            {selectedEntry && (
                <aside className="detail-panel">
                    <div className="detail-header-large">
                        <div className="detail-header-row">
                            <div className="detail-avatar-large">{selectedEntry.title.charAt(0).toUpperCase()}</div>
                            <button
                                className="detail-close"
                                aria-label="Close"
                                onClick={() => {
                                    setSelectedEntry(null);
                                    setIsEditing(false);
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        <h2 className="detail-title">{selectedEntry.title}</h2>
                        <p className="entry-subtext">{selectedEntry.url || 'Personal'}</p>

                        <div className="detail-actions">
                            {!isEditing ? (
                                <>
                                    <button className="detail-btn" onClick={() => beginEdit(selectedEntry)}>Edit</button>
                                    <button className="detail-btn danger" onClick={deleteSelected}>Delete</button>
                                </>
                            ) : (
                                <>
                                    <button className="detail-btn" onClick={saveEdit}>Save</button>
                                    <button className="detail-btn" onClick={cancelEdit}>Cancel</button>
                                </>
                            )}
                        </div>
                    </div>

                    {!isEditing ? (
                        <div className="info-section">
                            <div className="info-field">
                                <div className="info-label">Username</div>
                                <div className="info-value-wrapper">
                                    <span className="info-value">{selectedEntry.username}</span>
                                    <button className="copy-pill" onClick={() => handleCopy(selectedEntry.username)}>Copy</button>
                                </div>
                            </div>
                            <div className="info-field">
                                <div className="info-label">Password</div>
                                <div className="info-value-wrapper">
                                    <span className="info-value">••••••••</span>
                                    <button className="copy-pill" onClick={() => handleCopy(selectedEntry.password)}>Copy</button>
                                </div>
                            </div>
                            {selectedEntry.url && (
                                <div className="info-field">
                                    <div className="info-label">Website</div>
                                    <div className="info-value">{selectedEntry.url}</div>
                                </div>
                            )}
                            {selectedEntry.notes && (
                                <div className="info-field">
                                    <div className="info-label">Notes</div>
                                    <div className="info-value">{selectedEntry.notes}</div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="info-section">
                            <div className="form-group" style={{ marginTop: 8 }}>
                                <label>Service</label>
                                <input
                                    value={editDraft.title}
                                    onChange={e => setEditDraft({ ...editDraft, title: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Website (optional)</label>
                                <input
                                    value={editDraft.url}
                                    onChange={e => setEditDraft({ ...editDraft, url: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Identifier</label>
                                <input
                                    value={editDraft.username}
                                    onChange={e => setEditDraft({ ...editDraft, username: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Secret</label>
                                <input
                                    type="password"
                                    value={editDraft.password}
                                    onChange={e => setEditDraft({ ...editDraft, password: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Notes (optional)</label>
                                <input
                                    value={editDraft.notes}
                                    onChange={e => setEditDraft({ ...editDraft, notes: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                </aside>
            )}

            {isAddModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2 style={{ marginBottom: '24px' }}>New Access</h2>
                        </div>
                        <form onSubmit={handleAddItem}>
                            <div className="form-group">
                                <label>Service</label>
                                <input
                                    placeholder="Title"
                                    value={newEntry.title}
                                    onChange={e => setNewEntry({ ...newEntry, title: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Website (optional)</label>
                                <input
                                    placeholder="https://example.com"
                                    value={newEntry.url}
                                    onChange={e => setNewEntry({ ...newEntry, url: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Identifier</label>
                                <input
                                    placeholder="Username / Email"
                                    value={newEntry.username}
                                    onChange={e => setNewEntry({ ...newEntry, username: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Secret</label>
                                <input
                                    type="password"
                                    placeholder="Password"
                                    value={newEntry.password}
                                    onChange={e => setNewEntry({ ...newEntry, password: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-actions" style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                                <button type="button" className="btn-ghost" onClick={() => setIsAddModalOpen(false)}>Back</button>
                                <button type="submit" className="btn-primary">Save Now</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
