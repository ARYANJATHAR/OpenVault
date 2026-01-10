/**
 * Expo Config Plugin for Network Security
 * 
 * This plugin creates a custom network security configuration that allows
 * cleartext (non-HTTPS) traffic to local network IP addresses.
 * 
 * This is REQUIRED for production builds to allow WebSocket connections
 * to local IP addresses (e.g., 192.168.x.x for LAN sync with hotspot).
 * 
 * Without this, Android 9+ will block non-HTTPS connections in production.
 */

const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { join } = require('path');

/**
 * Network security config XML that allows cleartext to all addresses.
 * This is necessary for syncing with the desktop app over local network.
 * 
 * In a real-world scenario with internet access, you would want to be more
 * restrictive and only allow cleartext to specific local IP ranges.
 * However, since we cannot predict IP addresses (hotspot creates random IPs),
 * we need to allow cleartext to all addresses.
 */
const NETWORK_SECURITY_CONFIG = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <!-- 
        Allow cleartext traffic for local network sync.
        This is required for WebSocket connections to local IP addresses.
        
        The Vault app only syncs over local networks (LAN/Hotspot),
        so this does not expose any internet traffic to cleartext.
    -->
    <base-config cleartextTrafficPermitted="true">
        <trust-anchors>
            <certificates src="system"/>
        </trust-anchors>
    </base-config>
</network-security-config>
`;

/**
 * Plugin to write the network security config file
 */
const withNetworkSecurityFile = (config) => {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const projectRoot = config.modRequest.projectRoot;
            const resXmlDir = join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'xml');

            // Create the xml directory if it doesn't exist
            if (!existsSync(resXmlDir)) {
                mkdirSync(resXmlDir, { recursive: true });
            }

            // Write the network security config file
            const configFilePath = join(resXmlDir, 'network_security_config.xml');
            writeFileSync(configFilePath, NETWORK_SECURITY_CONFIG, 'utf-8');

            console.log('[withNetworkSecurityConfig] Created network_security_config.xml');

            return config;
        },
    ]);
};

/**
 * Plugin to reference the network security config in AndroidManifest.xml
 */
const withNetworkSecurityManifest = (config) => {
    return withAndroidManifest(config, async (config) => {
        const manifest = config.modResults;

        // Find the application element
        const application = manifest.manifest.application?.[0];
        if (application) {
            // Add the networkSecurityConfig attribute
            application.$['android:networkSecurityConfig'] = '@xml/network_security_config';
            console.log('[withNetworkSecurityConfig] Added networkSecurityConfig to AndroidManifest.xml');
        }

        return config;
    });
};

/**
 * Main plugin that combines both steps
 */
function withNetworkSecurityConfig(config) {
    // First, add the manifest reference
    config = withNetworkSecurityManifest(config);
    // Then, write the file
    config = withNetworkSecurityFile(config);
    return config;
}

module.exports = withNetworkSecurityConfig;
