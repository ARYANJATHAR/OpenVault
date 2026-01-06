import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateQRCodeSVG } from './qrcode';

// Mobile Sync Panel Component
const MobileSyncPanel: React.FC<{ onEntriesRefresh: () => void }> = ({ onEntriesRefresh }) => {
    const [syncInfo, setSyncInfo] = useState<{ ip: string; port: number; deviceId: string; deviceName: string } | null>(null);
    const [allIPs, setAllIPs] = useState<string[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const [connectedCount, setConnectedCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncCount, setLastSyncCount] = useState<number | null>(null);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        loadSyncInfo();
        const interval = setInterval(loadSyncInfo, 3000); // Refresh every 3 seconds
        
        // Listen for sync completion
        const handleSyncComplete = (data: { count: number; imported?: number; updated?: number; skipped?: number }) => {
            setLastSyncCount(data.count);
            setIsSyncing(false);
            
            // Clear timeout
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
                syncTimeoutRef.current = null;
            }
            
            onEntriesRefresh(); // Refresh entries list
            
            // Show success message
            if (data.count > 0) {
                const details = [];
                if (data.imported) details.push(`${data.imported} new`);
                if (data.updated) details.push(`${data.updated} updated`);
                if (data.skipped) details.push(`${data.skipped} skipped`);
                console.log(`Sync complete: ${details.join(', ')}`);
            }
        };
        
        window.vaultAPI?.on('mobile-sync-complete', handleSyncComplete);
        
        return () => {
            clearInterval(interval);
            window.vaultAPI?.off('mobile-sync-complete', handleSyncComplete);
        };
    }, [onEntriesRefresh]);

    const loadSyncInfo = async () => {
        try {
            const info = await window.vaultAPI?.mobileSync.getInfo();
            const ips = await window.vaultAPI?.mobileSync.getLocalIPs();
            const running = await window.vaultAPI?.mobileSync.isRunning();
            const connected = await window.vaultAPI?.mobileSync.getConnectedCount();
            
            setSyncInfo(info);
            setAllIPs(ips || []);
            setIsRunning(running || false);
            setConnectedCount(connected || 0);
        } catch (error) {
            console.error('Failed to load sync info:', error);
        }
    };

    // Generate QR code data - use compact format for reliable scanning
    const qrData = useMemo(() => {
        if (!syncInfo) return '';
        // Use simple IP:PORT format for maximum compatibility
        return `${syncInfo.ip}:${syncInfo.port}`;
    }, [syncInfo]);

    // Generate QR code SVG
    const qrCodeSVG = useMemo(() => {
        if (!qrData) return '';
        try {
            return generateQRCodeSVG(qrData, 184);
        } catch (error) {
            console.error('Failed to generate QR code:', error);
            return '';
        }
    }, [qrData]);

    return (
        <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
            <header className="content-header" style={{ marginBottom: '24px' }}>
                <h2>Mobile Sync</h2>
                <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '8px',
                    fontSize: '12px',
                    color: isRunning ? '#2ecc71' : '#e74c3c'
                }}>
                    <div style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: isRunning ? '#2ecc71' : '#e74c3c',
                    }} />
                    {isRunning ? 'Server Running' : 'Server Stopped'}
                </div>
            </header>

            {/* Connection Status */}
            <div style={{ 
                background: 'var(--bg-surface)', 
                border: '1px solid var(--border)', 
                borderRadius: '8px', 
                padding: '20px', 
                marginBottom: '20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1 }}>
                    <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '12px',
                        background: connectedCount > 0 ? 'rgba(46, 204, 113, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={connectedCount > 0 ? '#2ecc71' : 'var(--text-muted)'} strokeWidth="1.5">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                            <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2" />
                        </svg>
                    </div>
                    <div>
                        <div style={{ fontSize: '16px', fontWeight: '500' }}>
                            {connectedCount} Device{connectedCount !== 1 ? 's' : ''} Connected
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                            {connectedCount > 0 ? 'Sync active' : 'No mobile devices connected'}
                            {lastSyncCount !== null && ` • Last sync: ${lastSyncCount} password${lastSyncCount !== 1 ? 's' : ''}`}
                        </div>
                    </div>
                </div>
                {connectedCount > 0 && (
                    <button
                        className="add-button"
                        onClick={async () => {
                            if (isSyncing) return; // Prevent double-click
                            
                            // Clear any existing timeout
                            if (syncTimeoutRef.current) {
                                clearTimeout(syncTimeoutRef.current);
                                syncTimeoutRef.current = null;
                            }
                            
                            setIsSyncing(true);
                            setLastSyncCount(null); // Clear previous count
                            
                            try {
                                const result = await window.vaultAPI?.mobileSync.requestSync();
                                if (!result?.success) {
                                    alert(result?.error || 'Failed to request sync');
                                    setIsSyncing(false);
                                    return;
                                }
                                
                                // Set timeout as fallback in case event doesn't fire
                                syncTimeoutRef.current = setTimeout(() => {
                                    console.warn('Sync timeout - resetting state');
                                    setIsSyncing(false);
                                    syncTimeoutRef.current = null;
                                }, 30000); // 30 second timeout
                            } catch (error) {
                                console.error('Sync request error:', error);
                                alert('Failed to request sync');
                                setIsSyncing(false);
                                if (syncTimeoutRef.current) {
                                    clearTimeout(syncTimeoutRef.current);
                                    syncTimeoutRef.current = null;
                                }
                            }
                        }}
                        disabled={isSyncing}
                        style={{ 
                            minWidth: '120px',
                            opacity: isSyncing ? 0.6 : 1,
                            cursor: isSyncing ? 'not-allowed' : 'pointer',
                            pointerEvents: isSyncing ? 'none' : 'auto'
                        }}
                    >
                        {isSyncing ? (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: 'spin 1s linear infinite' }}>
                                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                                </svg>
                                Syncing...
                            </>
                        ) : (
                            <>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                                </svg>
                                Refresh from Mobile
                            </>
                        )}
                    </button>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                {/* QR Code Section */}
                <div style={{ 
                    background: 'var(--bg-surface)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px', 
                    padding: '24px',
                    textAlign: 'center'
                }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '16px' }}>
                        Scan QR Code
                    </h3>
                    
                    {/* QR Code Display */}
                    <div style={{
                        width: '200px',
                        height: '200px',
                        margin: '0 auto 16px',
                        background: '#fff',
                        borderRadius: '8px',
                        padding: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}>
                        {qrCodeSVG ? (
                            <div dangerouslySetInnerHTML={{ __html: qrCodeSVG }} />
                        ) : (
                            <div style={{ color: '#666', fontSize: '12px' }}>Loading...</div>
                        )}
                    </div>
                    
                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Open Vault app on your phone and scan this code
                    </p>
                </div>

                {/* Manual Connection Section */}
                <div style={{ 
                    background: 'var(--bg-surface)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px', 
                    padding: '24px'
                }}>
                    <h3 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '16px' }}>
                        Manual Connection
                    </h3>
                    
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                            IP Address{allIPs.length > 1 ? 'es' : ''}
                        </div>
                        {allIPs.map((ip, index) => (
                            <div 
                                key={index}
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'space-between',
                                    padding: '10px 12px',
                                    background: 'var(--bg-base)',
                                    borderRadius: '6px',
                                    marginBottom: '8px',
                                    fontFamily: 'monospace',
                                    fontSize: '14px'
                                }}
                            >
                                <span>{ip}</span>
                                <button 
                                    className="copy-pill"
                                    onClick={() => navigator.clipboard.writeText(ip)}
                                    style={{ fontSize: '11px', padding: '4px 10px' }}
                                >
                                    Copy
                                </button>
                            </div>
                        ))}
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                            Port
                        </div>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: 'var(--bg-base)',
                            borderRadius: '6px',
                            fontFamily: 'monospace',
                            fontSize: '14px'
                        }}>
                            <span>{syncInfo?.port || '51820'}</span>
                            <button 
                                className="copy-pill"
                                onClick={() => navigator.clipboard.writeText(String(syncInfo?.port || '51820'))}
                                style={{ fontSize: '11px', padding: '4px 10px' }}
                            >
                                Copy
                            </button>
                        </div>
                    </div>

                    <div style={{ 
                        padding: '12px', 
                        background: 'rgba(46, 204, 113, 0.1)', 
                        borderRadius: '6px',
                        fontSize: '12px',
                        color: 'var(--text-secondary)'
                    }}>
                        <strong style={{ color: 'var(--accent)' }}>📱 Instructions:</strong>
                        <ol style={{ margin: '8px 0 0 16px', padding: 0 }}>
                            <li>Open Vault on your phone</li>
                            <li>Go to Sync tab</li>
                            <li>Enter IP address and port</li>
                            <li>Tap Connect</li>
                        </ol>
                    </div>
                </div>
            </div>

            {/* Info Section */}
            <div style={{ 
                marginTop: '20px',
                padding: '16px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '12px',
                color: 'var(--text-muted)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                    </svg>
                    <strong>Note:</strong>
                </div>
                <p style={{ margin: 0 }}>
                    Both devices must be on the same Wi-Fi network. No internet connection is required - 
                    all data stays on your local network. Your passwords are encrypted during transfer.
                </p>
            </div>

            {/* Hotspot Mode Section */}
            <div style={{ 
                marginTop: '16px',
                padding: '16px',
                background: 'linear-gradient(135deg, rgba(46, 204, 113, 0.1) 0%, rgba(52, 152, 219, 0.1) 100%)',
                border: '1px solid rgba(46, 204, 113, 0.3)',
                borderRadius: '8px',
                fontSize: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" strokeWidth="1.5">
                        <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                        <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                        <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                        <circle cx="12" cy="20" r="1" fill="#2ecc71" />
                    </svg>
                    <strong style={{ color: 'var(--text-primary)' }}>📱 No Router? Use Hotspot Mode!</strong>
                </div>
                <p style={{ margin: '0 0 12px 0', color: 'var(--text-secondary)' }}>
                    If both devices aren't on the same Wi-Fi, you can create a direct connection:
                </p>
                <ol style={{ margin: '0', paddingLeft: '20px', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                    <li><strong>On your phone:</strong> Enable "Mobile Hotspot" in settings</li>
                    <li><strong>On this computer:</strong> Connect to your phone's hotspot Wi-Fi</li>
                    <li>Wait for connection, then use the IP addresses shown above</li>
                    <li>The first IP that starts with <code style={{ background: 'rgba(0,0,0,0.2)', padding: '2px 6px', borderRadius: '4px' }}>192.168.43.x</code> usually works for hotspots</li>
                </ol>
                <div style={{ 
                    marginTop: '12px', 
                    padding: '8px 12px', 
                    background: 'rgba(0,0,0,0.2)', 
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f39c12" strokeWidth="2">
                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                        <line x1="12" y1="9" x2="12" y2="13" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                        Mobile data will be used for internet while hotspot is active on your phone
                    </span>
                </div>
            </div>
        </div>
    );
};

// Security Dashboard Component
const SecurityDashboard: React.FC<{ audit: any; entries: Entry[]; onRefresh: () => void }> = ({ audit, entries, onRefresh }) => {
    if (!audit) {
        return (
            <div style={{ padding: '40px', textAlign: 'center' }}>
                <p>Loading security audit...</p>
            </div>
        );
    }

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'critical': return '#e74c3c';
            case 'high': return '#f39c12';
            case 'medium': return '#f1c40f';
            case 'low': return '#3498db';
            default: return '#95a5a6';
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return '#2ecc71';
        if (score >= 60) return '#3498db';
        if (score >= 40) return '#f1c40f';
        if (score >= 20) return '#f39c12';
        return '#e74c3c';
    };

    return (
        <div style={{ padding: '24px', height: '100%', overflowY: 'auto' }}>
            <header className="content-header" style={{ marginBottom: '24px' }}>
                <h2>Security Dashboard</h2>
                <button className="add-button" onClick={onRefresh}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                    </svg>
                    Refresh
                </button>
            </header>

            {/* Security Score */}
            <div style={{ 
                background: 'var(--bg-surface)', 
                border: '1px solid var(--border)', 
                borderRadius: '8px', 
                padding: '24px', 
                marginBottom: '24px' 
            }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                    <h3 style={{ fontSize: '18px', fontWeight: '400' }}>Security Score</h3>
                    <div style={{ 
                        fontSize: '32px', 
                        fontWeight: '300', 
                        color: getScoreColor(audit.securityScore) 
                    }}>
                        {audit.securityScore}/100
                    </div>
                </div>
                <div style={{ 
                    height: '8px', 
                    background: 'var(--bg-base)', 
                    borderRadius: '4px', 
                    overflow: 'hidden' 
                }}>
                    <div style={{ 
                        height: '100%', 
                        width: `${audit.securityScore}%`, 
                        background: getScoreColor(audit.securityScore),
                        transition: 'all 0.3s ease'
                    }} />
                </div>
            </div>

            {/* Issue Summary */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(4, 1fr)', 
                gap: '16px', 
                marginBottom: '24px' 
            }}>
                <div style={{ 
                    background: 'var(--bg-surface)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px', 
                    padding: '16px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '24px', fontWeight: '300', color: '#e74c3c' }}>
                        {audit.critical}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Critical
                    </div>
                </div>
                <div style={{ 
                    background: 'var(--bg-surface)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px', 
                    padding: '16px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '24px', fontWeight: '300', color: '#f39c12' }}>
                        {audit.high}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        High
                    </div>
                </div>
                <div style={{ 
                    background: 'var(--bg-surface)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px', 
                    padding: '16px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '24px', fontWeight: '300', color: '#f1c40f' }}>
                        {audit.medium}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Medium
                    </div>
                </div>
                <div style={{ 
                    background: 'var(--bg-surface)', 
                    border: '1px solid var(--border)', 
                    borderRadius: '8px', 
                    padding: '16px',
                    textAlign: 'center'
                }}>
                    <div style={{ fontSize: '24px', fontWeight: '300', color: '#3498db' }}>
                        {audit.low}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Low
                    </div>
                </div>
            </div>

            {/* Issues List */}
            {audit.issues.length > 0 ? (
                <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '400', marginBottom: '16px' }}>
                        Security Issues ({audit.totalIssues})
                    </h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {audit.issues.map((issue: any, index: number) => (
                            <div 
                                key={index}
                                style={{ 
                                    background: 'var(--bg-surface)', 
                                    border: '1px solid var(--border)', 
                                    borderRadius: '8px', 
                                    padding: '16px',
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '12px'
                                }}
                            >
                                <div style={{ 
                                    width: '8px', 
                                    height: '8px', 
                                    borderRadius: '50%', 
                                    background: getSeverityColor(issue.severity),
                                    marginTop: '6px',
                                    flexShrink: 0
                                }} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ 
                                        fontSize: '14px', 
                                        fontWeight: '500', 
                                        marginBottom: '4px',
                                        textTransform: 'capitalize'
                                    }}>
                                        {issue.type} - {issue.entryTitle}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                                        {issue.message}
                                    </div>
                                    {issue.recommendation && (
                                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            💡 {issue.recommendation}
                                        </div>
                                    )}
                                </div>
                                <span style={{ 
                                    fontSize: '10px', 
                                    padding: '4px 8px', 
                                    borderRadius: '4px',
                                    background: getSeverityColor(issue.severity) + '20',
                                    color: getSeverityColor(issue.severity),
                                    textTransform: 'uppercase',
                                    fontWeight: '500'
                                }}>
                                    {issue.severity}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div style={{ 
                    textAlign: 'center', 
                    padding: '40px', 
                    color: 'var(--text-secondary)' 
                }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: '0 auto 16px', opacity: 0.5 }}>
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <h3 style={{ fontSize: '18px', fontWeight: '400', marginBottom: '8px' }}>All Clear!</h3>
                    <p style={{ fontSize: '14px' }}>No security issues found</p>
                </div>
            )}
        </div>
    );
};

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
                toggleFavorite: (id: string) => Promise<{ success: boolean; isFavorite: boolean }>;
                getFavorites: () => Promise<Entry[]>;
            };
            password: {
                generate: (options?: { length?: number; uppercase?: boolean; lowercase?: boolean; numbers?: boolean; symbols?: boolean }) => Promise<string>;
                checkStrength: (password: string) => Promise<{ score: number; level: string; feedback: string[] }>;
            };
            totp: {
                generate: (secret: string) => Promise<{ success: boolean; code?: string; error?: string }>;
                getTimeRemaining: () => Promise<number>;
                validate: (secret: string) => Promise<boolean>;
            };
            security: {
                audit: () => Promise<{ totalIssues: number; critical: number; high: number; medium: number; low: number; issues: any[]; securityScore: number }>;
            };
            mobileSync: {
                getInfo: () => Promise<{ ip: string; port: number; deviceId: string; deviceName: string }>;
                getLocalIPs: () => Promise<string[]>;
                isRunning: () => Promise<boolean>;
                getConnectedCount: () => Promise<number>;
            };
            app: {
                getVersion: () => Promise<string>;
                getPlatform: () => Promise<string>;
            };
            theme: {
                get: () => Promise<'light' | 'dark'>;
                set: (theme: 'light' | 'dark') => Promise<{ success: boolean }>;
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
    isFavorite: boolean;
}

type View = 'unlock' | 'create' | 'vault' | 'settings' | 'mobilesync';

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
    const [showFavorites, setShowFavorites] = useState(false);
    const [theme, setTheme] = useState<'light' | 'dark'>('dark');
    const [currentView, setCurrentView] = useState<'vault' | 'security' | 'mobilesync'>('vault');
    const [totpCodes, setTotpCodes] = useState<Map<string, { code: string; timeRemaining: number }>>(new Map());
    const [passwordStrength, setPasswordStrength] = useState<{ score: number; level: string; feedback: string[] } | null>(null);
    const [securityAudit, setSecurityAudit] = useState<any>(null);
    const [showPassword, setShowPassword] = useState(false);
    const [showEditPassword, setShowEditPassword] = useState(false);

    const [isEditing, setIsEditing] = useState(false);
    const [editDraft, setEditDraft] = useState({
        title: '',
        username: '',
        password: '',
        url: '',
        notes: '',
        totpSecret: ''
    });

    // Form state for new entry
    const [newEntry, setNewEntry] = useState({
        title: '',
        username: '',
        password: '',
        url: '',
        notes: '',
        totpSecret: ''
    });

    useEffect(() => {
        checkVaultStatus();
        
        // Load theme
        window.vaultAPI?.theme.get().then((savedTheme) => {
            setTheme(savedTheme);
            document.documentElement.setAttribute('data-theme', savedTheme);
        });

        // Listen for theme changes
        const handleThemeChange = (newTheme: 'light' | 'dark') => {
            setTheme(newTheme);
            document.documentElement.setAttribute('data-theme', newTheme);
        };
        window.vaultAPI?.on('theme-changed', handleThemeChange);

        window.vaultAPI?.on('quick-search', () => {
            document.getElementById('search-input')?.focus();
        });
        
        return () => {
            window.vaultAPI?.off('quick-search', () => { });
            window.vaultAPI?.off('theme-changed', handleThemeChange);
        };
    }, []);

    // TOTP timer - update codes every second
    useEffect(() => {
        const updateTOTPCodes = async () => {
            const entriesWithTOTP = entries.filter(e => e.totpSecret && e.totpSecret.trim().length > 0);
            if (entriesWithTOTP.length === 0) {
                setTotpCodes(new Map());
                return;
            }

            const newCodes = new Map<string, { code: string; timeRemaining: number }>();
            
            for (const entry of entriesWithTOTP) {
                if (entry.totpSecret && entry.totpSecret.trim().length > 0) {
                    try {
                        const result = await window.vaultAPI?.totp.generate(entry.totpSecret);
                        if (result?.success && result.code) {
                            const timeRemaining = await window.vaultAPI?.totp.getTimeRemaining();
                            newCodes.set(entry.id, { code: result.code, timeRemaining: timeRemaining || 0 });
                        } else {
                            console.error('TOTP generation failed:', result?.error);
                        }
                    } catch (error) {
                        console.error('TOTP error for entry', entry.id, error);
                    }
                }
            }
            
            setTotpCodes(newCodes);
        };

        updateTOTPCodes();
        const interval = setInterval(updateTOTPCodes, 1000);
        return () => clearInterval(interval);
    }, [entries]);

    // Password strength checker
    useEffect(() => {
        const checkStrength = async () => {
            const passwordToCheck = isEditing ? editDraft.password : (isAddModalOpen ? newEntry.password : '');
            if (passwordToCheck) {
                const strength = await window.vaultAPI?.password.checkStrength(passwordToCheck);
                setPasswordStrength(strength || null);
            } else {
                setPasswordStrength(null);
            }
        };

        checkStrength();
    }, [editDraft.password, newEntry.password, isEditing, isAddModalOpen]);

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
            notes: entry.notes || '',
            totpSecret: entry.totpSecret || ''
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
            totpSecret: newEntry.totpSecret.length > 0 ? newEntry.totpSecret : undefined,
            folderId: null,
            lastUsedAt: null
        });
        await loadEntries();
        setIsAddModalOpen(false);
        setNewEntry({ title: '', username: '', password: '', url: '', notes: '', totpSecret: '' });
    };

    const handleCopy = async (text: string) => {
        await navigator.clipboard.writeText(text);
    };

    const handleToggleFavorite = async (id: string) => {
        const result = await window.vaultAPI?.entries.toggleFavorite(id);
        if (result?.success) {
            await loadEntries();
            if (selectedEntry?.id === id) {
                const refreshed = await window.vaultAPI?.entries.get(id);
                setSelectedEntry(refreshed || null);
            }
        }
    };

    const filteredEntries = entries.filter(e => {
        const matchesSearch = e.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            e.username.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFavorite = !showFavorites || e.isFavorite;
        return matchesSearch && matchesFavorite;
    });

    const favoriteCount = entries.filter(e => e.isFavorite).length;

    const handleThemeToggle = async () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        await window.vaultAPI?.theme.set(newTheme);
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    const loadSecurityAudit = async () => {
        const audit = await window.vaultAPI?.security.audit();
        setSecurityAudit(audit);
    };

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
                    <button 
                        className={`nav-item ${!showFavorites && currentView === 'vault' ? 'active' : ''}`}
                        onClick={() => {
                            setShowFavorites(false);
                            setCurrentView('vault');
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        </svg>
                        All Passwords
                        <span className="count">{entries.length}</span>
                    </button>
                    <button 
                        className={`nav-item ${showFavorites ? 'active' : ''}`}
                        onClick={() => {
                            setShowFavorites(true);
                            setCurrentView('vault');
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                        </svg>
                        Favorites
                        {favoriteCount > 0 && <span className="count">{favoriteCount}</span>}
                    </button>
                    <button 
                        className={`nav-item ${currentView === 'security' ? 'active' : ''}`}
                        onClick={() => {
                            setCurrentView('security');
                            setShowFavorites(false);
                            loadSecurityAudit();
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        </svg>
                        Security
                        {securityAudit && securityAudit.totalIssues > 0 && (
                            <span className="count" style={{ color: securityAudit.critical > 0 ? '#e74c3c' : securityAudit.high > 0 ? '#f39c12' : '#3498db' }}>
                                {securityAudit.totalIssues}
                            </span>
                        )}
                    </button>
                    <button 
                        className={`nav-item ${currentView === 'mobilesync' ? 'active' : ''}`}
                        onClick={() => {
                            setCurrentView('mobilesync');
                            setShowFavorites(false);
                        }}
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
                            <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2" />
                        </svg>
                        Mobile Sync
                    </button>
                </nav>
                <div className="sidebar-footer">
                    <button 
                        className="icon-button theme-toggle" 
                        onClick={handleThemeToggle}
                        title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        {theme === 'dark' ? (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="5" />
                                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                            </svg>
                        ) : (
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                            </svg>
                        )}
                    </button>
                    <button className="icon-button" onClick={() => (window as any).vaultAPI.vault.lock().then(() => setView('unlock'))}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                        </svg>
                    </button>
                </div>
            </aside>

            <main className="main-content">
                {currentView === 'security' ? (
                    <SecurityDashboard audit={securityAudit} entries={entries} onRefresh={loadSecurityAudit} />
                ) : currentView === 'mobilesync' ? (
                    <MobileSyncPanel onEntriesRefresh={loadEntries} />
                ) : (
                    <>
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
                                    <div className="entry-name" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {entry.title}
                                        {entry.isFavorite && (
                                            <svg 
                                                width="14" 
                                                height="14" 
                                                viewBox="0 0 24 24" 
                                                fill="#fbbf24" 
                                                stroke="#fbbf24" 
                                                strokeWidth="2"
                                                style={{ flexShrink: 0 }}
                                            >
                                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                            </svg>
                                        )}
                                    </div>
                                    <div className="entry-subtext">{entry.username}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                    </>
                )}
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
                                    <button 
                                        className="detail-btn" 
                                        onClick={() => handleToggleFavorite(selectedEntry.id)}
                                        style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '6px',
                                            color: selectedEntry.isFavorite ? '#fbbf24' : 'inherit'
                                        }}
                                        title={selectedEntry.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                    >
                                        <svg 
                                            width="16" 
                                            height="16" 
                                            viewBox="0 0 24 24" 
                                            fill={selectedEntry.isFavorite ? 'currentColor' : 'none'} 
                                            stroke="currentColor" 
                                            strokeWidth="2"
                                        >
                                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                        </svg>
                                        {selectedEntry.isFavorite ? 'Favorited' : 'Favorite'}
                                    </button>
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
                            {selectedEntry.totpSecret && selectedEntry.totpSecret.trim().length > 0 && (
                                <div className="info-field">
                                    <div className="info-label">2FA Code</div>
                                    <div className="info-value-wrapper" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                                        {totpCodes.get(selectedEntry.id) ? (
                                            <>
                                                <span className="info-value" style={{ 
                                                    fontFamily: 'monospace', 
                                                    fontSize: '20px', 
                                                    fontWeight: '600',
                                                    letterSpacing: '4px',
                                                    color: 'var(--accent)'
                                                }}>
                                                    {totpCodes.get(selectedEntry.id)?.code}
                                                </span>
                                                <div style={{ 
                                                    fontSize: '11px', 
                                                    color: 'var(--text-muted)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    <div style={{
                                                        width: '8px',
                                                        height: '8px',
                                                        borderRadius: '50%',
                                                        background: totpCodes.get(selectedEntry.id)?.timeRemaining && totpCodes.get(selectedEntry.id)!.timeRemaining < 5 ? '#e74c3c' : '#2ecc71',
                                                        animation: totpCodes.get(selectedEntry.id)?.timeRemaining && totpCodes.get(selectedEntry.id)!.timeRemaining < 5 ? 'pulse 1s infinite' : 'none'
                                                    }} />
                                                    {totpCodes.get(selectedEntry.id)?.timeRemaining}s
                                                </div>
                                                <button className="copy-pill" onClick={() => handleCopy(totpCodes.get(selectedEntry.id)?.code || '')}>Copy</button>
                                            </>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%' }}>
                                                <span className="info-value" style={{ color: 'var(--text-muted)' }}>Generating...</span>
                                                <button 
                                                    className="copy-pill" 
                                                    onClick={async () => {
                                                        try {
                                                            const result = await window.vaultAPI?.totp.generate(selectedEntry.totpSecret);
                                                            if (result?.success) {
                                                                alert(`Test code: ${result.code}\n\nIf this works, the secret is valid!`);
                                                            } else {
                                                                alert(`Error: ${result?.error || 'Unknown error'}\n\nPlease check your TOTP secret format.`);
                                                            }
                                                        } catch (error) {
                                                            alert(`Error: ${(error as Error).message}`);
                                                        }
                                                    }}
                                                    style={{ fontSize: '11px', padding: '4px 8px' }}
                                                >
                                                    Test Secret
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
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
                                <div className="password-input-wrapper">
                                    <input
                                        type={showEditPassword ? "text" : "password"}
                                        value={editDraft.password}
                                        onChange={e => setEditDraft({ ...editDraft, password: e.target.value })}
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle-btn"
                                        onClick={() => setShowEditPassword(!showEditPassword)}
                                        title={showEditPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showEditPassword ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                                {passwordStrength && (
                                    <div style={{ marginTop: '8px' }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '8px',
                                            marginBottom: '4px'
                                        }}>
                                            <div style={{ 
                                                flex: 1, 
                                                height: '4px', 
                                                background: 'var(--bg-base)', 
                                                borderRadius: '2px',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{ 
                                                    height: '100%', 
                                                    width: `${passwordStrength.score}%`,
                                                    background: passwordStrength.level === 'very-weak' ? '#e74c3c' :
                                                                passwordStrength.level === 'weak' ? '#f39c12' :
                                                                passwordStrength.level === 'fair' ? '#f1c40f' :
                                                                passwordStrength.level === 'good' ? '#3498db' : '#2ecc71',
                                                    transition: 'all 0.3s ease'
                                                }} />
                                            </div>
                                            <span style={{ 
                                                fontSize: '11px', 
                                                color: passwordStrength.level === 'very-weak' ? '#e74c3c' :
                                                        passwordStrength.level === 'weak' ? '#f39c12' :
                                                        passwordStrength.level === 'fair' ? '#f1c40f' :
                                                        passwordStrength.level === 'good' ? '#3498db' : '#2ecc71',
                                                textTransform: 'capitalize',
                                                fontWeight: '500'
                                            }}>
                                                {passwordStrength.level.replace('-', ' ')}
                                            </span>
                                        </div>
                                        {passwordStrength.feedback.length > 0 && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                {passwordStrength.feedback[0]}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label>2FA Secret (optional)</label>
                                <input
                                    type="text"
                                    placeholder="Enter TOTP secret (e.g., JBSWY3DPEHPK3PXP) or otpauth:// URL"
                                    value={editDraft.totpSecret}
                                    onChange={e => setEditDraft({ ...editDraft, totpSecret: e.target.value })}
                                />
                                {editDraft.totpSecret && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {editDraft.totpSecret.length > 0 ? '✓ Secret entered' : ''}
                                        {editDraft.totpSecret.startsWith('otpauth://') && (
                                            <div style={{ marginTop: '2px', fontStyle: 'italic' }}>
                                                otpauth:// URL detected
                                            </div>
                                        )}
                                    </div>
                                )}
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
                                <div className="password-input-wrapper">
                                    <input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Password"
                                        value={newEntry.password}
                                        onChange={e => setNewEntry({ ...newEntry, password: e.target.value })}
                                        required
                                    />
                                    <button
                                        type="button"
                                        className="password-toggle-btn"
                                        onClick={() => setShowPassword(!showPassword)}
                                        title={showPassword ? 'Hide password' : 'Show password'}
                                    >
                                        {showPassword ? (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                                                <line x1="1" y1="1" x2="23" y2="23" />
                                            </svg>
                                        ) : (
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                <circle cx="12" cy="12" r="3" />
                                            </svg>
                                        )}
                                    </button>
                                </div>
                                {passwordStrength && (
                                    <div style={{ marginTop: '8px' }}>
                                        <div style={{ 
                                            display: 'flex', 
                                            alignItems: 'center', 
                                            gap: '8px',
                                            marginBottom: '4px'
                                        }}>
                                            <div style={{ 
                                                flex: 1, 
                                                height: '4px', 
                                                background: 'var(--bg-base)', 
                                                borderRadius: '2px',
                                                overflow: 'hidden'
                                            }}>
                                                <div style={{ 
                                                    height: '100%', 
                                                    width: `${passwordStrength.score}%`,
                                                    background: passwordStrength.level === 'very-weak' ? '#e74c3c' :
                                                                passwordStrength.level === 'weak' ? '#f39c12' :
                                                                passwordStrength.level === 'fair' ? '#f1c40f' :
                                                                passwordStrength.level === 'good' ? '#3498db' : '#2ecc71',
                                                    transition: 'all 0.3s ease'
                                                }} />
                                            </div>
                                            <span style={{ 
                                                fontSize: '11px', 
                                                color: passwordStrength.level === 'very-weak' ? '#e74c3c' :
                                                        passwordStrength.level === 'weak' ? '#f39c12' :
                                                        passwordStrength.level === 'fair' ? '#f1c40f' :
                                                        passwordStrength.level === 'good' ? '#3498db' : '#2ecc71',
                                                textTransform: 'capitalize',
                                                fontWeight: '500'
                                            }}>
                                                {passwordStrength.level.replace('-', ' ')}
                                            </span>
                                        </div>
                                        {passwordStrength.feedback.length > 0 && (
                                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                                {passwordStrength.feedback[0]}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                            <div className="form-group">
                                <label>2FA Secret (optional)</label>
                                <input
                                    type="text"
                                    placeholder="Enter TOTP secret (e.g., JBSWY3DPEHPK3PXP) or otpauth:// URL"
                                    value={newEntry.totpSecret}
                                    onChange={e => setNewEntry({ ...newEntry, totpSecret: e.target.value })}
                                />
                                {newEntry.totpSecret && (
                                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                        {newEntry.totpSecret.length > 0 ? '✓ Secret entered' : ''}
                                        {newEntry.totpSecret.startsWith('otpauth://') && (
                                            <div style={{ marginTop: '2px', fontStyle: 'italic' }}>
                                                otpauth:// URL detected
                                            </div>
                                        )}
                                    </div>
                                )}
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
