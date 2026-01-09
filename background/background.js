// Policy Manager for JADE Extension
class PolicyManager {
    constructor() {
        this.defaultPolicy = {
            allowNetwork: false,
            allowStorage: false,
            allowDOM: false,
            allowCookies: false,
            allowGeolocation: false,
            allowCamera: false,
            allowMicrophone: false,
            allowNotifications: false,
            allowClipboard: false,
            allowWebRTC: false,
            riskScore: 0,
            lastUpdated: Date.now(),
            whitelisted: false
        };

        // Initialize default policies for common domains
        this.commonPolicies = {
            'localhost': { ...this.defaultPolicy, allowDOM: true, allowStorage: true, riskScore: 10 },
            '127.0.0.1': { ...this.defaultPolicy, allowDOM: true, allowStorage: true, riskScore: 10 },
            'google.com': { ...this.defaultPolicy, allowNetwork: true, allowDOM: true, allowStorage: true, riskScore: 30 },
            'github.com': { ...this.defaultPolicy, allowNetwork: true, allowDOM: true, allowStorage: true, riskScore: 20 }
        };

        this.logs = [];
        this.MAX_LOGS = 1000;
    }

    // Extract domain from URL
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch (e) {
            return url;
        }
    }

    // Get policy for domain
    async getPolicyForDomain(domain) {
        const key = `policy_${domain}`;
        const result = await chrome.storage.local.get([key]);
        
        if (result[key]) {
            return result[key];
        }
        
        // Check common policies
        if (this.commonPolicies[domain]) {
            return this.commonPolicies[domain];
        }
        
        // Return default restrictive policy
        return { ...this.defaultPolicy, domain };
    }

    // Save policy for domain
    async savePolicyForDomain(domain, policy) {
        const key = `policy_${domain}`;
        policy.lastUpdated = Date.now();
        policy.domain = domain;
        
        await chrome.storage.local.set({ [key]: policy });
        
        // Notify all tabs about policy change
        const tabs = await chrome.tabs.query({});
        tabs.forEach(tab => {
            if (tab.url && this.extractDomain(tab.url) === domain) {
                chrome.tabs.sendMessage(tab.id, {
                    type: 'POLICY_UPDATED',
                    policy: policy
                }).catch(() => {}); // Ignore errors if content script not ready
            }
        });
        
        return policy;
    }

    // Reset to default policy
    async resetDomainPolicy(domain) {
        const defaultPolicy = { ...this.defaultPolicy, domain };
        return await this.savePolicyForDomain(domain, defaultPolicy);
    }

    // Log an event
    async logEvent(event) {
        event.timestamp = Date.now();
        event.id = Math.random().toString(36).substr(2, 9);
        
        this.logs.unshift(event);
        
        // Keep only last MAX_LOGS events
        if (this.logs.length > this.MAX_LOGS) {
            this.logs.length = this.MAX_LOGS;
        }
        
        // Save to storage
        await chrome.storage.local.set({ logs: this.logs.slice(0, 100) });
        
        return event;
    }

    // Get logs
    async getLogs(limit = 50) {
        const result = await chrome.storage.local.get(['logs']);
        return (result.logs || []).slice(0, limit);
    }

    // Calculate risk score for domain
    calculateRiskScore(domain, logs) {
        const domainLogs = logs.filter(log => log.domain === domain);
        let score = 50; // Default medium risk
        
        const blockedCount = domainLogs.filter(log => log.action === 'blocked').length;
        const allowedCount = domainLogs.filter(log => log.action === 'allowed').length;
        const totalActions = blockedCount + allowedCount;
        
        if (totalActions > 0) {
            const blockRatio = blockedCount / totalActions;
            score = Math.min(100, Math.max(0, 50 + (blockRatio * 50)));
        }
        
        return Math.round(score);
    }

    // Get all domains with policies
    async getAllDomains() {
        const allData = await chrome.storage.local.get(null);
        const domains = [];
        
        for (const [key, value] of Object.entries(allData)) {
            if (key.startsWith('policy_')) {
                const domain = key.replace('policy_', '');
                domains.push({
                    domain,
                    policy: value,
                    riskScore: this.calculateRiskScore(domain, this.logs)
                });
            }
        }
        
        return domains.sort((a, b) => a.domain.localeCompare(b.domain));
    }
}

// Initialize Policy Manager
const policyManager = new PolicyManager();

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    (async () => {
        try {
            switch (request.type) {
                case 'GET_POLICY':
                    const domain = policyManager.extractDomain(request.domain || sender.tab?.url);
                    const policy = await policyManager.getPolicyForDomain(domain);
                    sendResponse({ success: true, policy, domain });
                    break;
                    
                case 'SAVE_POLICY':
                    const saveDomain = policyManager.extractDomain(request.domain);
                    const savedPolicy = await policyManager.savePolicyForDomain(saveDomain, request.policy);
                    sendResponse({ success: true, policy: savedPolicy });
                    break;
                    
                case 'LOG_EVENT':
                    const loggedEvent = await policyManager.logEvent(request.event);
                    sendResponse({ success: true, event: loggedEvent });
                    break;
                    
                case 'GET_LOGS':
                    const logs = await policyManager.getLogs(request.limit);
                    sendResponse({ success: true, logs });
                    break;
                    
                case 'GET_ALL_DOMAINS':
                    const domains = await policyManager.getAllDomains();
                    sendResponse({ success: true, domains });
                    break;
                    
                case 'RESET_POLICY':
                    const resetDomain = policyManager.extractDomain(request.domain);
                    const resetPolicy = await policyManager.resetDomainPolicy(resetDomain);
                    sendResponse({ success: true, policy: resetPolicy });
                    break;
                    
                default:
                    sendResponse({ success: false, error: 'Unknown request type' });
            }
        } catch (error) {
            console.error('Background error:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();
    
    return true; // Keep message channel open for async response
});

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
    console.log('JADE Extension installed');
    
    // Set up default storage
    chrome.storage.local.set({
        extensionEnabled: true,
        defaultPolicy: policyManager.defaultPolicy,
        installationTime: Date.now()
    });
});

// Tab update listener to inject content scripts
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.url && tab.url.startsWith('http')) {
        // Notify content script about tab update
        chrome.tabs.sendMessage(tabId, {
            type: 'TAB_UPDATED',
            url: tab.url
        }).catch(() => {}); // Ignore errors if content script not ready
    }
});

// Export for testing
if (typeof module !== 'undefined') {
    module.exports = { PolicyManager };
}