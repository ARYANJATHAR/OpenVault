/**
 * Sync Screen
 * Connect to desktop app and sync passwords
 */

import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Alert,
    ActivityIndicator,
    Modal,
    Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { useTheme } from '../src/context/ThemeContext';
import { useVault } from '../src/context/VaultContext';
import { syncService, SyncStatus } from '../src/services/syncService';
import { vaultService } from '../src/services/vaultService';
import { typography } from '../src/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SCAN_AREA_SIZE = SCREEN_WIDTH * 0.7;

export default function SyncScreen() {
    const { colors } = useTheme();
    const { importEntries } = useVault();

    const [ipAddress, setIpAddress] = useState('');
    const [port, setPort] = useState('51821');
    const [status, setStatus] = useState<SyncStatus>('disconnected');
    const [desktopName, setDesktopName] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncCount, setLastSyncCount] = useState<number | null>(null);
    
    // QR Scanner state
    const [showScanner, setShowScanner] = useState(false);
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);

    useEffect(() => {
        // Listen to sync service events
        const handleStatusChange = (newStatus: SyncStatus) => {
            setStatus(newStatus);
        };

        const handleWelcome = (info: { deviceId: string; deviceName: string }) => {
            setDesktopName(info.deviceName);
        };

        const handleDisconnected = () => {
            setDesktopName(null);
        };

        const handleError = () => {
            Alert.alert('Connection Error', 'Failed to connect to desktop. Make sure both devices are on the same network.');
        };

        const handleSyncRequest = async () => {
            // Desktop is requesting entries from mobile
            // Check unlock status directly from vault service
            console.log('Processing sync request from desktop...');
            try {
                // Fetch fresh entries directly from vault service (not React state)
                // This will throw if vault is locked
                const allEntries = await vaultService.getAllEntries();
                console.log(`Fetched ${allEntries.length} entries from vault`);
                
                // Convert mobile entries to sync format
                const syncEntries = allEntries.map(e => ({
                    id: e.id,
                    title: e.title,
                    username: e.username,
                    password: e.password,
                    url: e.url,
                    notes: e.notes,
                    totpSecret: e.totpSecret,
                    folderId: e.folderId,
                    isFavorite: e.isFavorite,
                    createdAt: e.createdAt,
                    modifiedAt: e.modifiedAt,
                }));
                
                syncService.sendSyncResponse(syncEntries);
                console.log(`Sent ${syncEntries.length} entries to desktop`);
            } catch (error) {
                // Vault is locked or error occurred
                console.error('Failed to fetch entries for sync:', error);
                syncService.sendSyncResponse([]);
            }
        };

        // Register handler with sync service (so it works even if component unmounts)
        syncService.setSyncRequestHandler(handleSyncRequest);

        syncService.on('status-changed', handleStatusChange);
        syncService.on('welcome', handleWelcome);
        syncService.on('disconnected', handleDisconnected);
        syncService.on('error', handleError);
        syncService.on('sync-request-received', handleSyncRequest);

        // Update initial status
        setStatus(syncService.getStatus());
        const info = syncService.getDesktopInfo();
        if (info) {
            setDesktopName(info.deviceName);
        }

        return () => {
            syncService.off('status-changed', handleStatusChange);
            syncService.off('welcome', handleWelcome);
            syncService.off('disconnected', handleDisconnected);
            syncService.off('error', handleError);
            syncService.off('sync-request-received', handleSyncRequest);
            // Don't clear the handler - keep it active even when component unmounts
        };
    }, []); // Empty deps - handler fetches fresh data from vault service

    const handleOpenScanner = async () => {
        if (!permission?.granted) {
            const result = await requestPermission();
            if (!result.granted) {
                Alert.alert(
                    'Camera Permission Required',
                    'Please allow camera access to scan QR codes.',
                    [{ text: 'OK' }]
                );
                return;
            }
        }
        setScanned(false);
        setShowScanner(true);
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        if (scanned) return;
        setScanned(true);
        
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        
        // Parse QR code data
        const connectionInfo = syncService.constructor.prototype.constructor.parseQRCode 
            ? syncService.constructor.prototype.constructor.parseQRCode(data)
            : parseQRData(data);
        
        if (connectionInfo) {
            setIpAddress(connectionInfo.ip);
            setPort(String(connectionInfo.port));
            setShowScanner(false);
            
            // Auto-connect after scanning
            setTimeout(() => {
                handleConnectWithInfo(connectionInfo.ip, connectionInfo.port);
            }, 500);
        } else {
            Alert.alert('Invalid QR Code', 'This QR code does not contain valid connection information.');
            setScanned(false);
        }
    };

    // Parse QR code data
    const parseQRData = (data: string): { ip: string; port: number } | null => {
        try {
            const info = JSON.parse(data);
            if (info.ip && info.port) {
                return { ip: info.ip, port: info.port };
            }
            return null;
        } catch {
            // Try IP:PORT format
            const match = data.match(/^(\d+\.\d+\.\d+\.\d+):(\d+)$/);
            if (match) {
                return { ip: match[1], port: parseInt(match[2]) };
            }
            return null;
        }
    };

    const handleConnectWithInfo = async (ip: string, portNum: number) => {
        const success = await syncService.connect(ip, portNum);
        if (success) {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else {
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
    };

    const handleConnect = async () => {
        if (!ipAddress.trim()) {
            Alert.alert('Error', 'Please enter the IP address');
            return;
        }

        const portNum = parseInt(port) || 51821;
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        await handleConnectWithInfo(ipAddress.trim(), portNum);
    };

    const handleDisconnect = async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        syncService.disconnect();
    };

    const handleSync = async () => {
        if (!syncService.isConnected()) {
            Alert.alert('Not Connected', 'Please connect to desktop first');
            return;
        }

        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsSyncing(true);

        try {
            const entries = await syncService.requestSync();
            
            if (entries && entries.length > 0) {
                await importEntries(entries);
                setLastSyncCount(entries.length);
                await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Sync Complete', `Synced ${entries.length} password${entries.length !== 1 ? 's' : ''} from desktop`);
            } else if (entries && entries.length === 0) {
                setLastSyncCount(0);
                Alert.alert('Sync Complete', 'No passwords to sync');
            } else {
                Alert.alert('Sync Failed', 'Desktop vault may be locked. Unlock it and try again.');
            }
        } catch (error) {
            Alert.alert('Sync Error', 'Failed to sync with desktop');
        } finally {
            setIsSyncing(false);
        }
    };

    const getStatusColor = () => {
        switch (status) {
            case 'connected': return colors.success;
            case 'connecting': return colors.warning;
            case 'syncing': return colors.info;
            case 'error': return colors.error;
            default: return colors.textMuted;
        }
    };

    const getStatusText = () => {
        switch (status) {
            case 'connected': return `Connected to ${desktopName || 'Desktop'}`;
            case 'connecting': return 'Connecting...';
            case 'syncing': return 'Syncing...';
            case 'error': return 'Connection failed';
            default: return 'Not connected';
        }
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bgBase }]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
                <TouchableOpacity 
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
                    Desktop Sync
                </Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
                {/* Status Card */}
                <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
                    <View style={styles.statusRow}>
                        <View style={[styles.statusDot, { backgroundColor: getStatusColor() }]} />
                        <Text style={[styles.statusText, { color: colors.textPrimary }]}>
                            {getStatusText()}
                        </Text>
                    </View>
                    
                    {status === 'connected' && (
                        <View style={styles.connectedInfo}>
                            <Ionicons name="desktop-outline" size={20} color={colors.accent} />
                            <Text style={[styles.connectedName, { color: colors.textSecondary }]}>
                                {desktopName || 'Desktop Vault'}
                            </Text>
                        </View>
                    )}
                </View>

                {/* Connection Form */}
                {status !== 'connected' && (
                    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                            Connect to Desktop
                        </Text>
                        <Text style={[styles.cardDescription, { color: colors.textMuted }]}>
                            Scan QR code or enter IP address manually
                        </Text>

                        {/* QR Code Scanner Button */}
                        <TouchableOpacity
                            style={[styles.scanButton, { backgroundColor: colors.bgBase, borderColor: colors.accent }]}
                            onPress={handleOpenScanner}
                        >
                            <View style={[styles.scanIconContainer, { backgroundColor: colors.accentGlow }]}>
                                <Ionicons name="qr-code" size={28} color={colors.accent} />
                            </View>
                            <View style={styles.scanTextContainer}>
                                <Text style={[styles.scanButtonTitle, { color: colors.textPrimary }]}>
                                    Scan QR Code
                                </Text>
                                <Text style={[styles.scanButtonSubtitle, { color: colors.textMuted }]}>
                                    Quick & easy connection
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                        </TouchableOpacity>

                        {/* Divider */}
                        <View style={styles.dividerContainer}>
                            <View style={[styles.divider, { backgroundColor: colors.border }]} />
                            <Text style={[styles.dividerText, { color: colors.textMuted }]}>or enter manually</Text>
                            <View style={[styles.divider, { backgroundColor: colors.border }]} />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>IP Address</Text>
                            <TextInput
                                style={[styles.input, { 
                                    backgroundColor: colors.bgBase, 
                                    borderColor: colors.border,
                                    color: colors.textPrimary 
                                }]}
                                placeholder="192.168.1.100"
                                placeholderTextColor={colors.textMuted}
                                value={ipAddress}
                                onChangeText={setIpAddress}
                                keyboardType="numeric"
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={[styles.label, { color: colors.textSecondary }]}>Port</Text>
                            <TextInput
                                style={[styles.input, { 
                                    backgroundColor: colors.bgBase, 
                                    borderColor: colors.border,
                                    color: colors.textPrimary 
                                }]}
                                placeholder="51821"
                                placeholderTextColor={colors.textMuted}
                                value={port}
                                onChangeText={setPort}
                                keyboardType="numeric"
                            />
                        </View>

                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: colors.accent }]}
                            onPress={handleConnect}
                            disabled={status === 'connecting'}
                        >
                            {status === 'connecting' ? (
                                <ActivityIndicator color={colors.bgBase} size="small" />
                            ) : (
                                <>
                                    <Ionicons name="link" size={18} color={colors.bgBase} />
                                    <Text style={[styles.buttonText, { color: colors.bgBase }]}>
                                        Connect
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>
                    </View>
                )}

                {/* Sync Actions */}
                {status === 'connected' && (
                    <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
                        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                            Sync Passwords
                        </Text>
                        <Text style={[styles.cardDescription, { color: colors.textMuted }]}>
                            Download your passwords from the desktop vault
                        </Text>

                        {lastSyncCount !== null && (
                            <View style={[styles.syncInfo, { backgroundColor: colors.bgBase }]}>
                                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                                <Text style={[styles.syncInfoText, { color: colors.textSecondary }]}>
                                    Last sync: {lastSyncCount} password{lastSyncCount !== 1 ? 's' : ''}
                                </Text>
                            </View>
                        )}

                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: colors.accent }]}
                            onPress={handleSync}
                            disabled={isSyncing}
                        >
                            {isSyncing ? (
                                <ActivityIndicator color={colors.bgBase} size="small" />
                            ) : (
                                <>
                                    <Ionicons name="sync" size={18} color={colors.bgBase} />
                                    <Text style={[styles.buttonText, { color: colors.bgBase }]}>
                                        Sync Now
                                    </Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.buttonOutline, { borderColor: colors.border }]}
                            onPress={handleDisconnect}
                        >
                            <Ionicons name="close" size={18} color={colors.textSecondary} />
                            <Text style={[styles.buttonOutlineText, { color: colors.textSecondary }]}>
                                Disconnect
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Instructions */}
                <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
                        How to Connect
                    </Text>
                    
                    <View style={styles.instructionItem}>
                        <View style={[styles.instructionNumber, { backgroundColor: colors.accentGlow }]}>
                            <Text style={[styles.instructionNumberText, { color: colors.accent }]}>1</Text>
                        </View>
                        <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
                            Open Vault on your desktop computer
                        </Text>
                    </View>

                    <View style={styles.instructionItem}>
                        <View style={[styles.instructionNumber, { backgroundColor: colors.accentGlow }]}>
                            <Text style={[styles.instructionNumberText, { color: colors.accent }]}>2</Text>
                        </View>
                        <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
                            Go to "Mobile Sync" in the sidebar
                        </Text>
                    </View>

                    <View style={styles.instructionItem}>
                        <View style={[styles.instructionNumber, { backgroundColor: colors.accentGlow }]}>
                            <Text style={[styles.instructionNumberText, { color: colors.accent }]}>3</Text>
                        </View>
                        <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
                            Scan the QR code or enter IP manually
                        </Text>
                    </View>

                    <View style={styles.instructionItem}>
                        <View style={[styles.instructionNumber, { backgroundColor: colors.accentGlow }]}>
                            <Text style={[styles.instructionNumberText, { color: colors.accent }]}>4</Text>
                        </View>
                        <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
                            Make sure both devices are on the same Wi-Fi
                        </Text>
                    </View>
                </View>

                {/* Note */}
                <View style={[styles.noteCard, { backgroundColor: colors.accentGlow }]}>
                    <Ionicons name="information-circle" size={20} color={colors.accent} />
                    <Text style={[styles.noteText, { color: colors.textSecondary }]}>
                        No internet required! Sync happens directly between your devices over the local network.
                    </Text>
                </View>

                {/* Hotspot Mode */}
                <View style={[styles.card, { backgroundColor: colors.bgSurface, borderColor: colors.border }]}>
                    <View style={styles.hotspotHeader}>
                        <Ionicons name="wifi" size={20} color={colors.success} />
                        <Text style={[styles.cardTitle, { color: colors.textPrimary, marginBottom: 0, marginLeft: 8 }]}>
                            No Router? Use Hotspot!
                        </Text>
                    </View>
                    <Text style={[styles.cardDescription, { color: colors.textMuted, marginTop: 8 }]}>
                        Create a direct connection without Wi-Fi router:
                    </Text>
                    
                    <View style={styles.instructionItem}>
                        <View style={[styles.instructionNumber, { backgroundColor: colors.accentGlow }]}>
                            <Text style={[styles.instructionNumberText, { color: colors.accent }]}>1</Text>
                        </View>
                        <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
                            Enable "Mobile Hotspot" on this phone
                        </Text>
                    </View>

                    <View style={styles.instructionItem}>
                        <View style={[styles.instructionNumber, { backgroundColor: colors.accentGlow }]}>
                            <Text style={[styles.instructionNumberText, { color: colors.accent }]}>2</Text>
                        </View>
                        <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
                            Connect your computer to phone's hotspot
                        </Text>
                    </View>

                    <View style={styles.instructionItem}>
                        <View style={[styles.instructionNumber, { backgroundColor: colors.accentGlow }]}>
                            <Text style={[styles.instructionNumberText, { color: colors.accent }]}>3</Text>
                        </View>
                        <Text style={[styles.instructionText, { color: colors.textSecondary }]}>
                            Scan QR code or enter IP (usually 192.168.43.x)
                        </Text>
                    </View>

                    <View style={[styles.warningBox, { backgroundColor: colors.bgBase }]}>
                        <Ionicons name="warning" size={16} color={colors.warning} />
                        <Text style={[styles.warningText, { color: colors.textMuted }]}>
                            Mobile data is used for internet while hotspot is active
                        </Text>
                    </View>
                </View>
            </ScrollView>

            {/* QR Scanner Modal */}
            <Modal
                visible={showScanner}
                animationType="slide"
                presentationStyle="fullScreen"
                onRequestClose={() => setShowScanner(false)}
            >
                <View style={[styles.scannerContainer, { backgroundColor: '#000' }]}>
                    {/* Scanner Header */}
                    <SafeAreaView style={styles.scannerHeader}>
                        <TouchableOpacity
                            style={styles.scannerCloseButton}
                            onPress={() => setShowScanner(false)}
                        >
                            <Ionicons name="close" size={28} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.scannerTitle}>Scan QR Code</Text>
                        <View style={{ width: 44 }} />
                    </SafeAreaView>

                    {/* Camera View */}
                    <View style={styles.cameraContainer}>
                        <CameraView
                            style={StyleSheet.absoluteFillObject}
                            facing="back"
                            barcodeScannerSettings={{
                                barcodeTypes: ['qr'],
                            }}
                            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                        />
                        
                        {/* Overlay */}
                        <View style={styles.scannerOverlay}>
                            {/* Top overlay */}
                            <View style={styles.overlayTop} />
                            
                            {/* Middle row */}
                            <View style={styles.overlayMiddle}>
                                <View style={styles.overlaySide} />
                                
                                {/* Scan Area */}
                                <View style={styles.scanArea}>
                                    {/* Corner indicators */}
                                    <View style={[styles.corner, styles.cornerTL]} />
                                    <View style={[styles.corner, styles.cornerTR]} />
                                    <View style={[styles.corner, styles.cornerBL]} />
                                    <View style={[styles.corner, styles.cornerBR]} />
                                </View>
                                
                                <View style={styles.overlaySide} />
                            </View>
                            
                            {/* Bottom overlay */}
                            <View style={styles.overlayBottom}>
                                <Text style={styles.scannerHint}>
                                    Point your camera at the QR code{'\n'}shown on your desktop
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>
            </Modal>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: typography.fontSize.lg,
        fontWeight: '500',
    },
    content: {
        flex: 1,
    },
    contentContainer: {
        padding: 16,
        gap: 16,
    },
    card: {
        borderRadius: 12,
        borderWidth: 1,
        padding: 20,
    },
    cardTitle: {
        fontSize: typography.fontSize.lg,
        fontWeight: '500',
        marginBottom: 8,
    },
    cardDescription: {
        fontSize: typography.fontSize.sm,
        marginBottom: 20,
    },
    statusRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    statusDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    statusText: {
        fontSize: typography.fontSize.base,
        fontWeight: '500',
    },
    connectedInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.1)',
    },
    connectedName: {
        fontSize: typography.fontSize.sm,
    },
    scanButton: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        borderWidth: 2,
        borderStyle: 'dashed',
        marginBottom: 20,
    },
    scanIconContainer: {
        width: 52,
        height: 52,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scanTextContainer: {
        flex: 1,
        marginLeft: 14,
    },
    scanButtonTitle: {
        fontSize: typography.fontSize.base,
        fontWeight: '600',
    },
    scanButtonSubtitle: {
        fontSize: typography.fontSize.sm,
        marginTop: 2,
    },
    dividerContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 20,
    },
    divider: {
        flex: 1,
        height: 1,
    },
    dividerText: {
        paddingHorizontal: 12,
        fontSize: typography.fontSize.xs,
    },
    inputGroup: {
        marginBottom: 16,
    },
    label: {
        fontSize: typography.fontSize.sm,
        marginBottom: 8,
    },
    input: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 14,
        paddingVertical: 12,
        fontSize: typography.fontSize.base,
    },
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 8,
        marginTop: 8,
    },
    buttonText: {
        fontSize: typography.fontSize.base,
        fontWeight: '600',
    },
    buttonOutline: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 8,
        borderWidth: 1,
        marginTop: 12,
    },
    buttonOutlineText: {
        fontSize: typography.fontSize.base,
        fontWeight: '500',
    },
    syncInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
    },
    syncInfoText: {
        fontSize: typography.fontSize.sm,
    },
    instructionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    instructionNumber: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    instructionNumberText: {
        fontSize: typography.fontSize.sm,
        fontWeight: '600',
    },
    instructionText: {
        flex: 1,
        fontSize: typography.fontSize.sm,
    },
    noteCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 12,
        padding: 16,
        borderRadius: 12,
    },
    noteText: {
        flex: 1,
        fontSize: typography.fontSize.sm,
        lineHeight: 20,
    },
    // Scanner styles
    scannerContainer: {
        flex: 1,
    },
    scannerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    scannerCloseButton: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scannerTitle: {
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
    },
    cameraContainer: {
        flex: 1,
    },
    scannerOverlay: {
        ...StyleSheet.absoluteFillObject,
    },
    overlayTop: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    overlayMiddle: {
        flexDirection: 'row',
        height: SCAN_AREA_SIZE,
    },
    overlaySide: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
    },
    scanArea: {
        width: SCAN_AREA_SIZE,
        height: SCAN_AREA_SIZE,
    },
    overlayBottom: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        alignItems: 'center',
        paddingTop: 30,
    },
    scannerHint: {
        color: '#fff',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
    },
    corner: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderColor: '#2ecc71',
    },
    cornerTL: {
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderTopLeftRadius: 4,
    },
    cornerTR: {
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderTopRightRadius: 4,
    },
    cornerBL: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderBottomLeftRadius: 4,
    },
    cornerBR: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderBottomRightRadius: 4,
    },
    hotspotHeader: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    warningBox: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        padding: 12,
        borderRadius: 8,
        marginTop: 12,
    },
    warningText: {
        flex: 1,
        fontSize: typography.fontSize.xs,
    },
});
