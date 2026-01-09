class PopupManager {
    constructor() {
        this.currentTab = null;
        this.currentDomain = null;
        this.currentPolicy = null;
        this.isInitialized = false;
        
        this.init();
    }
    
    async init() {
        // Get current tab
        await this.getCurrentTab();
        
        // Load current domain policy
        await this.loadCurrentPolicy();
        
        // Load recent blocks
        await this.loadRecentBlocks();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Update UI
        this.updateUI();
        
        this.isInitialized = true;
        console.log('Popup initialized for domain:', this.currentDomain);
    }
    
    async getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTab = tab;
            this.currentDomain = this.extractDomain(tab.url);
            return tab;
        } catch (error) {
            console.error('Failed to get current tab:', error);
            return null;
        }
    }
    
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch (e) {
            return 'unknown';
        }
    }
    
    async loadCurrentPolicy() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_POLICY',
                domain: this.currentDomain
            });
            
            if (response.success) {
                this.currentPolicy = response.policy;
                return this.currentPolicy;
            }
        } catch (error) {
            console.error('Failed to load policy:', error);
        }
        return null;
    }
    
    async loadRecentBlocks() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_LOGS',
                limit: 10
            });
            
            if (response.success) {
                this.recentBlocks = response.logs.filter(log => 
                    log.action === 'blocked' && log.domain === this.currentDomain
                ).slice(0, 5);
                return this.recentBlocks;
            }
        } catch (error) {
            console.error('Failed to load logs:', error);
        }
        return [];
    }
    
    setupEventListeners() {
        // Policy toggles
        const toggleIds = [
            'allowNetwork', 'allowStorage', 'allowCookies',
            'allowGeolocation', 'allowCamera', 'allowMicrophone',
            'allowDOM', 'allowNotifications', 'allowClipboard'
        ];
        
        toggleIds.forEach(id => {
            const toggle = document.getElementById(id);
            if (toggle) {
                toggle.addEventListener('change', () => this.onPolicyToggle(id));
            }
        });
        
        // Buttons
        document.getElementById('applyBtn').addEventListener('click', () => this.applyPolicy());
        document.getElementById('resetBtn').addEventListener('click', () => this.resetPolicy());
        document.getElementById('lockdownBtn').addEventListener('click', () => this.enableLockdown());
        document.getElementById('whitelistBtn').addEventListener('click', () => this.whitelistSite());
        document.getElementById('viewLogsBtn').addEventListener('click', () => this.openOptions('logs'));
        document.getElementById('optionsLink').addEventListener('click', (e) => {
            e.preventDefault();
            this.openOptions();
        });
        document.getElementById('settingsBtn').addEventListener('click', () => this.openOptions('settings'));
    }
    
    updateUI() {
        // Update domain info
        document.getElementById('currentDomain').textContent = this.currentDomain;
        document.getElementById('currentUrl').textContent = this.currentTab?.url || '...';
        
        // Update policy toggles
        if (this.currentPolicy) {
            const policyMap = {
                'allowNetwork': 'allowNetwork',
                'allowStorage': 'allowStorage',
                'allowCookies': 'allowCookies',
                'allowGeolocation': 'allowGeolocation',
                'allowCamera': 'allowCamera',
                'allowMicrophone': 'allowMicrophone',
                'allowDOM': 'allowDOM',
                'allowNotifications': 'allowNotifications',
                'allowClipboard': 'allowClipboard'
            };
            
            for (const [toggleId, policyKey] of Object.entries(policyMap)) {
                const toggle = document.getElementById(toggleId);
                if (toggle) {
                    toggle.checked = !!this.currentPolicy[policyKey];
                }
            }
            
            // Update risk score
            this.updateRiskScore();
        }
        
        // Update recent blocks
        this.updateRecentBlocks();
        
        // Update block count
        this.updateBlockCount();
    }
    
    async updateRiskScore() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_LOGS',
                limit: 100
            });
            
            if (response.success) {
                const logs = response.logs.filter(log => log.domain === this.currentDomain);
                const blockedCount = logs.filter(log => log.action === 'blocked').length;
                const allowedCount = logs.filter(log => log.action === 'allowed').length;
                const total = blockedCount + allowedCount;
                
                let riskScore = 50; // Default
                if (total > 0) {
                    riskScore = Math.round((blockedCount / total) * 100);
                }
                
                const riskElement = document.getElementById('riskScore');
                riskElement.textContent = riskScore;
                riskElement.className = 'risk-value';
                
                if (riskScore <= 30) {
                    riskElement.classList.add('low');
                } else if (riskScore <= 70) {
                    riskElement.classList.add('medium');
                } else {
                    riskElement.classList.add('high');
                }
            }
        } catch (error) {
            console.error('Failed to update risk score:', error);
        }
    }
    
    updateRecentBlocks() {
        const container = document.getElementById('recentBlocksList');
        
        if (!this.recentBlocks || this.recentBlocks.length === 0) {
            container.innerHTML = '<div class="empty-state">No blocks detected yet</div>';
            return;
        }
        
        container.innerHTML = this.recentBlocks.map(block => `
            <div class="block-item">
                <div class="block-api">${block.api}</div>
                <div class="block-reason">${block.userMessage || block.reason || 'Blocked by policy'}</div>
                <div class="block-time">${this.formatTime(block.timestamp)}</div>
            </div>
        `).join('');
    }
    
    async updateBlockCount() {
        try {
            const today = new Date().setHours(0, 0, 0, 0);
            const response = await chrome.runtime.sendMessage({
                type: 'GET_LOGS',
                limit: 1000
            });
            
            if (response.success) {
                const todayBlocks = response.logs.filter(log => 
                    log.action === 'blocked' && 
                    new Date(log.timestamp) >= today
                ).length;
                
                document.getElementById('blockCount').textContent = todayBlocks;
            }
        } catch (error) {
            console.error('Failed to update block count:', error);
        }
    }
    
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    }
    
    onPolicyToggle(toggleId) {
        console.log(`Policy toggle changed: ${toggleId}`);
        // Real-time visual feedback
        const toggle = document.getElementById(toggleId);
        toggle.parentElement.style.transform = 'scale(1.1)';
        setTimeout(() => {
            toggle.parentElement.style.transform = 'scale(1)';
        }, 200);
    }
    
    async applyPolicy() {
        try {
            // Get current toggle values
            const policy = {
                allowNetwork: document.getElementById('allowNetwork').checked,
                allowStorage: document.getElementById('allowStorage').checked,
                allowCookies: document.getElementById('allowCookies').checked,
                allowGeolocation: document.getElementById('allowGeolocation').checked,
                allowCamera: document.getElementById('allowCamera').checked,
                allowMicrophone: document.getElementById('allowMicrophone').checked,
                allowDOM: document.getElementById('allowDOM').checked,
                allowNotifications: document.getElementById('allowNotifications').checked,
                allowClipboard: document.getElementById('allowClipboard').checked,
                allowWebRTC: false, // Always off for security
                whitelisted: false
            };
            
            const response = await chrome.runtime.sendMessage({
                type: 'SAVE_POLICY',
                domain: this.currentDomain,
                policy: policy
            });
            
            if (response.success) {
                this.currentPolicy = response.policy;
                this.showNotification('Policy applied successfully!', 'success');
                
                // Notify content script
                if (this.currentTab?.id) {
                    chrome.tabs.sendMessage(this.currentTab.id, {
                        type: 'POLICY_UPDATED',
                        policy: this.currentPolicy
                    }).catch(() => {});
                }
            }
        } catch (error) {
            console.error('Failed to apply policy:', error);
            this.showNotification('Failed to apply policy', 'error');
        }
    }
    
    async resetPolicy() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'RESET_POLICY',
                domain: this.currentDomain
            });
            
            if (response.success) {
                this.currentPolicy = response.policy;
                this.updateUI();
                this.showNotification('Policy reset to default', 'success');
            }
        } catch (error) {
            console.error('Failed to reset policy:', error);
            this.showNotification('Failed to reset policy', 'error');
        }
    }
    
    async enableLockdown() {
        // Set all toggles to off
        const toggleIds = [
            'allowNetwork', 'allowStorage', 'allowCookies',
            'allowGeolocation', 'allowCamera', 'allowMicrophone',
            'allowDOM', 'allowNotifications', 'allowClipboard'
        ];
        
        toggleIds.forEach(id => {
            const toggle = document.getElementById(id);
            if (toggle) toggle.checked = false;
        });
        
        await this.applyPolicy();
        this.showNotification('🔒 Lockdown mode enabled', 'success');
    }
    
    async whitelistSite() {
        // Set all toggles to on (except high-risk ones)
        const policy = {
            allowNetwork: true,
            allowStorage: true,
            allowCookies: true,
            allowGeolocation: false, // Keep sensitive APIs off
            allowCamera: false,
            allowMicrophone: false,
            allowDOM: true,
            allowNotifications: false,
            allowClipboard: false,
            allowWebRTC: false,
            whitelisted: true
        };
        
        // Update UI
        Object.keys(policy).forEach(key => {
            const toggle = document.getElementById(key);
            if (toggle) toggle.checked = policy[key];
        });
        
        await this.applyPolicy();
        this.showNotification('✅ Site added to whitelist', 'success');
    }
    
    openOptions(section = '') {
        chrome.runtime.openOptionsPage(() => {
            if (chrome.runtime.lastError) {
                console.error('Failed to open options:', chrome.runtime.lastError);
            }
        });
    }
    
    showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            left: 50%;
            transform: translateX(-50%);
            background: ${type === 'success' ? '#4caf50' : '#f44336'};
            color: white;
            padding: 10px 20px;
            border-radius: 5px;
            z-index: 10000;
            animation: slideDown 0.3s ease;
        `;
        
        document.body.appendChild(notification);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.style.animation = 'slideUp 0.3s ease';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.remove();
                }
            }, 300);
        }, 3000);
        
        // Add animation styles
        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideDown {
                    from { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                    to { transform: translateX(-50%) translateY(0); opacity: 1; }
                }
                @keyframes slideUp {
                    from { transform: translateX(-50%) translateY(0); opacity: 1; }
                    to { transform: translateX(-50%) translateY(-100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.popupManager = new PopupManager();
});

// Export for testing
if (typeof module !== 'undefined') {
    module.exports = { PopupManager };
}