class OptionsManager {
    constructor() {
        this.currentPage = 1;
        this.logsPerPage = 20;
        this.currentTab = 'policy';
        this.isInitialized = false;
        
        this.init();
    }
    
    async init() {
        // Setup tab switching
        this.setupTabs();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadPolicies();
        await this.loadLogs();
        await this.loadSettings();
        
        this.isInitialized = true;
        console.log('Options page initialized');
    }
    
    setupTabs() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        const tabContents = document.querySelectorAll('.tab-content');
        
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabId = btn.dataset.tab;
                this.switchTab(tabId);
            });
        });
    }
    
    switchTab(tabId) {
        // Update active tab button
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        
        // Show active tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabId}-tab`);
        });
        
        this.currentTab = tabId;
        
        // Load data for the tab
        switch(tabId) {
            case 'policy':
                this.loadPolicies();
                break;
            case 'logs':
                this.loadLogs();
                break;
            case 'export':
                // Nothing special to load
                break;
        }
    }
    
    setupEventListeners() {
        // Policy tab
        document.getElementById('addPolicyBtn').addEventListener('click', () => this.openPolicyEditor());
        document.getElementById('domainSearch').addEventListener('input', (e) => this.filterPolicies(e.target.value));
        
        // Logs tab
        document.getElementById('logFilter').addEventListener('change', () => this.loadLogs());
        document.getElementById('logSearch').addEventListener('input', (e) => this.filterLogs(e.target.value));
        document.getElementById('clearLogsBtn').addEventListener('click', () => this.clearLogs());
        document.getElementById('exportLogsBtn').addEventListener('click', () => this.exportLogs());
        document.getElementById('prevPageBtn').addEventListener('click', () => this.prevPage());
        document.getElementById('nextPageBtn').addEventListener('click', () => this.nextPage());
        
        // Settings tab
        document.getElementById('saveSettingsBtn').addEventListener('click', () => this.saveSettings());
        document.getElementById('resetSettingsBtn').addEventListener('click', () => this.resetSettings());
        
        // Export tab
        document.getElementById('exportPoliciesBtn').addEventListener('click', () => this.exportPolicies());
        document.getElementById('importPoliciesBtn').addEventListener('click', () => this.importPolicies());
        document.getElementById('resetAllBtn').addEventListener('click', () => this.resetAllData());
        document.getElementById('exportLogsCsvBtn').addEventListener('click', () => this.exportLogsCsv());
        
        // Footer buttons
        document.getElementById('backBtn').addEventListener('click', () => this.goBack());
        document.getElementById('refreshBtn').addEventListener('click', () => this.refresh());
        document.getElementById('helpBtn').addEventListener('click', () => this.showHelp());
        document.getElementById('aboutBtn').addEventListener('click', () => this.showAbout());
        
        // Modal
        document.querySelector('.modal-close').addEventListener('click', () => this.closeModal());
        document.getElementById('modalCancelBtn').addEventListener('click', () => this.closeModal());
        document.getElementById('modalSaveBtn').addEventListener('click', () => this.savePolicy());
        document.getElementById('modalDeleteBtn').addEventListener('click', () => this.deletePolicy());
        
        // Close modal on outside click
        document.getElementById('policyModal').addEventListener('click', (e) => {
            if (e.target.id === 'policyModal') {
                this.closeModal();
            }
        });
    }
    
    async loadPolicies() {
        try {
            const container = document.getElementById('policiesList');
            container.innerHTML = '<div class="loading">Loading policies...</div>';
            
            const response = await chrome.runtime.sendMessage({
                type: 'GET_ALL_DOMAINS'
            });
            
            if (response.success) {
                this.allPolicies = response.domains;
                this.displayPolicies(this.allPolicies);
            }
        } catch (error) {
            console.error('Failed to load policies:', error);
            document.getElementById('policiesList').innerHTML = 
                '<div class="error">Failed to load policies</div>';
        }
    }
    
    displayPolicies(policies) {
        const container = document.getElementById('policiesList');
        
        if (!policies || policies.length === 0) {
            container.innerHTML = '<div class="empty-state">No policies defined yet</div>';
            return;
        }
        
        container.innerHTML = policies.map(policy => {
            const enabledCount = Object.entries(policy.policy).filter(([key, value]) => 
                key.startsWith('allow') && value === true
            ).length;
            
            const totalCount = Object.keys(policy.policy).filter(key => 
                key.startsWith('allow')
            ).length;
            
            return `
                <div class="policy-item" data-domain="${policy.domain}">
                    <div class="policy-info">
                        <div class="policy-domain">${policy.domain}</div>
                        <div class="policy-summary">
                            <span title="Permissions enabled">✅ ${enabledCount}/${totalCount} enabled</span>
                            <span title="Risk score">⚠️ Risk: ${policy.riskScore}/100</span>
                            <span title="Last updated">📅 ${this.formatDate(policy.policy.lastUpdated)}</span>
                            ${policy.policy.whitelisted ? '<span class="whitelist-badge">⭐ Whitelisted</span>' : ''}
                        </div>
                    </div>
                    <div class="policy-actions">
                        <button class="edit-btn" onclick="window.optionsManager.editPolicy('${policy.domain}')">Edit</button>
                        <button class="delete-btn" onclick="window.optionsManager.deletePolicyPrompt('${policy.domain}')">Delete</button>
                    </div>
                </div>
            `;
        }).join('');
    }
    
    filterPolicies(searchTerm) {
        if (!searchTerm) {
            this.displayPolicies(this.allPolicies);
            return;
        }
        
        const filtered = this.allPolicies.filter(policy => 
            policy.domain.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        this.displayPolicies(filtered);
    }
    
    openPolicyEditor(domain = '') {
        const modal = document.getElementById('policyModal');
        const isEditMode = !!domain;
        
        document.getElementById('modalTitle').textContent = 
            isEditMode ? 'Edit Policy' : 'Add New Policy';
        document.getElementById('modalDomain').value = domain;
        document.getElementById('modalDomain').readOnly = isEditMode;
        
        // Load policy if editing
        if (isEditMode) {
            const policy = this.allPolicies.find(p => p.domain === domain)?.policy;
            this.populatePolicyForm(policy);
        } else {
            this.populatePolicyForm(null);
        }
        
        // Show/hide delete button
        document.getElementById('modalDeleteBtn').style.display = 
            isEditMode ? 'block' : 'none';
        
        modal.classList.add('active');
    }
    
    populatePolicyForm(policy) {
        const container = document.querySelector('.modal-policy-grid');
        
        const policyOptions = [
            { id: 'allowNetwork', label: 'Network Requests', desc: 'Fetch, XHR, WebSocket' },
            { id: 'allowStorage', label: 'Local Storage', desc: 'localStorage, sessionStorage' },
            { id: 'allowCookies', label: 'Cookies', desc: 'Cookie access' },
            { id: 'allowDOM', label: 'DOM Changes', desc: 'DOM manipulation' },
            { id: 'allowGeolocation', label: 'Geolocation', desc: 'Location access' },
            { id: 'allowCamera', label: 'Camera', desc: 'Camera access' },
            { id: 'allowMicrophone', label: 'Microphone', desc: 'Microphone access' },
            { id: 'allowNotifications', label: 'Notifications', desc: 'Browser notifications' },
            { id: 'allowClipboard', label: 'Clipboard', desc: 'Clipboard access' },
            { id: 'allowWebRTC', label: 'WebRTC', desc: 'Real-time communication' }
        ];
        
        container.innerHTML = policyOptions.map(option => {
            const isChecked = policy ? policy[option.id] : false;
            return `
                <div class="modal-policy-item">
                    <input type="checkbox" id="modal_${option.id}" ${isChecked ? 'checked' : ''}>
                    <label for="modal_${option.id}">
                        ${option.label}
                        <br><small>${option.desc}</small>
                    </label>
                </div>
            `;
        }).join('');
    }
    
    closeModal() {
        document.getElementById('policyModal').classList.remove('active');
    }
    
    async savePolicy() {
        const domain = document.getElementById('modalDomain').value.trim();
        
        if (!domain) {
            alert('Please enter a domain');
            return;
        }
        
        try {
            // Collect policy from form
            const policy = {
                allowNetwork: document.getElementById('modal_allowNetwork')?.checked || false,
                allowStorage: document.getElementById('modal_allowStorage')?.checked || false,
                allowCookies: document.getElementById('modal_allowCookies')?.checked || false,
                allowDOM: document.getElementById('modal_allowDOM')?.checked || false,
                allowGeolocation: document.getElementById('modal_allowGeolocation')?.checked || false,
                allowCamera: document.getElementById('modal_allowCamera')?.checked || false,
                allowMicrophone: document.getElementById('modal_allowMicrophone')?.checked || false,
                allowNotifications: document.getElementById('modal_allowNotifications')?.checked || false,
                allowClipboard: document.getElementById('modal_allowClipboard')?.checked || false,
                allowWebRTC: document.getElementById('modal_allowWebRTC')?.checked || false,
                whitelisted: false,
                notes: document.getElementById('modalNotes').value
            };
            
            const response = await chrome.runtime.sendMessage({
                type: 'SAVE_POLICY',
                domain: domain,
                policy: policy
            });
            
            if (response.success) {
                this.closeModal();
                this.loadPolicies();
                this.showNotification('Policy saved successfully!', 'success');
            }
        } catch (error) {
            console.error('Failed to save policy:', error);
            this.showNotification('Failed to save policy', 'error');
        }
    }
    
    editPolicy(domain) {
        this.openPolicyEditor(domain);
    }
    
    deletePolicyPrompt(domain) {
        if (confirm(`Are you sure you want to delete policy for ${domain}?`)) {
            this.deletePolicy(domain);
        }
    }
    
    async deletePolicy(domain) {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'RESET_POLICY',
                domain: domain
            });
            
            if (response.success) {
                this.loadPolicies();
                this.showNotification('Policy deleted', 'success');
            }
        } catch (error) {
            console.error('Failed to delete policy:', error);
            this.showNotification('Failed to delete policy', 'error');
        }
    }
    
    async loadLogs() {
        try {
            const container = document.getElementById('logsList');
            container.innerHTML = '<div class="loading">Loading logs...</div>';
            
            const response = await chrome.runtime.sendMessage({
                type: 'GET_LOGS',
                limit: 1000
            });
            
            if (response.success) {
                this.allLogs = response.logs;
                this.filterAndDisplayLogs();
                this.updateLogStats();
            }
        } catch (error) {
            console.error('Failed to load logs:', error);
            container.innerHTML = '<div class="error">Failed to load logs</div>';
        }
    }
    
    filterAndDisplayLogs() {
        const filter = document.getElementById('logFilter').value;
        const search = document.getElementById('logSearch').value.toLowerCase();
        
        let filteredLogs = [...this.allLogs];
        
        // Apply filter
        if (filter !== 'all') {
            filteredLogs = filteredLogs.filter(log => log.action === filter);
        }
        
        // Apply search
        if (search) {
            filteredLogs = filteredLogs.filter(log => 
                log.domain?.toLowerCase().includes(search) ||
                log.api?.toLowerCase().includes(search) ||
                log.reason?.toLowerCase().includes(search) ||
                log.userMessage?.toLowerCase().includes(search)
            );
        }
        
        this.filteredLogs = filteredLogs;
        this.displayLogsPage(1);
    }
    
    displayLogsPage(page) {
        const startIndex = (page - 1) * this.logsPerPage;
        const endIndex = startIndex + this.logsPerPage;
        const pageLogs = this.filteredLogs.slice(startIndex, endIndex);
        
        const container = document.getElementById('logsList');
        
        if (pageLogs.length === 0) {
            container.innerHTML = '<div class="empty-state">No logs found</div>';
        } else {
            container.innerHTML = pageLogs.map(log => {
                const icon = log.action === 'blocked' ? '🛑' : 
                            log.action === 'allowed' ? '✅' : '👁️';
                
                return `
                    <div class="log-item ${log.action}">
                        <div class="log-header">
                            <span class="log-api">${icon} ${log.api}</span>
                            <span class="log-time">${this.formatTime(log.timestamp)}</span>
                        </div>
                        <div class="log-message">
                            <span class="log-domain">${log.domain}</span>
                            ${log.userMessage || log.reason || 'Event logged'}
                        </div>
                        ${log.details ? `
                            <div class="log-details">
                                ${JSON.stringify(log.details, null, 2)}
                            </div>
                        ` : ''}
                    </div>
                `;
            }).join('');
        }
        
        // Update pagination
        const totalPages = Math.ceil(this.filteredLogs.length / this.logsPerPage);
        document.getElementById('pageInfo').textContent = `Page ${page} of ${totalPages}`;
        document.getElementById('prevPageBtn').disabled = page <= 1;
        document.getElementById('nextPageBtn').disabled = page >= totalPages;
        
        this.currentPage = page;
    }
    
    filterLogs(search) {
        this.filterAndDisplayLogs();
    }
    
    updateLogStats() {
        const today = new Date().setHours(0, 0, 0, 0);
        const todayLogs = this.allLogs.filter(log => 
            new Date(log.timestamp) >= today
        );
        const blockedLogs = this.allLogs.filter(log => log.action === 'blocked');
        
        document.getElementById('totalLogs').textContent = this.allLogs.length;
        document.getElementById('todayLogs').textContent = todayLogs.length;
        document.getElementById('blockedLogs').textContent = blockedLogs.length;
    }
    
    prevPage() {
        if (this.currentPage > 1) {
            this.displayLogsPage(this.currentPage - 1);
        }
    }
    
    nextPage() {
        const totalPages = Math.ceil(this.filteredLogs.length / this.logsPerPage);
        if (this.currentPage < totalPages) {
            this.displayLogsPage(this.currentPage + 1);
        }
    }
    
    async clearLogs() {
        if (!confirm('Are you sure you want to clear all logs? This cannot be undone.')) {
            return;
        }
        
        try {
            await chrome.storage.local.set({ logs: [] });
            this.loadLogs();
            this.showNotification('Logs cleared', 'success');
        } catch (error) {
            console.error('Failed to clear logs:', error);
            this.showNotification('Failed to clear logs', 'error');
        }
    }
    
    async loadSettings() {
        try {
            const result = await chrome.storage.local.get([
                'securityLevel',
                'showBlockNotifications',
                'logAllowedEvents',
                'autoWhitelistCommonSites',
                'enableSilentSurveillanceDetection',
                'darkMode',
                'compactView',
                'showRiskScores',
                'autoApplyPolicies',
                'rememberLastState',
                'enableCSP',
                'blockThirdPartyByDefault'
            ]);
            
            // Set radio buttons
            const securityLevel = result.securityLevel || 'high';
            document.querySelector(`input[name="securityLevel"][value="${securityLevel}"]`).checked = true;
            
            // Set checkboxes
            const checkboxes = [
                'showBlockNotifications',
                'logAllowedEvents',
                'autoWhitelistCommonSites',
                'enableSilentSurveillanceDetection',
                'darkMode',
                'compactView',
                'showRiskScores',
                'autoApplyPolicies',
                'rememberLastState',
                'enableCSP',
                'blockThirdPartyByDefault'
            ];
            
            checkboxes.forEach(id => {
                const checkbox = document.getElementById(id);
                if (checkbox) {
                    checkbox.checked = result[id] !== false;
                }
            });
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }
    
    async saveSettings() {
        try {
            const settings = {
                securityLevel: document.querySelector('input[name="securityLevel"]:checked').value,
                showBlockNotifications: document.getElementById('showBlockNotifications').checked,
                logAllowedEvents: document.getElementById('logAllowedEvents').checked,
                autoWhitelistCommonSites: document.getElementById('autoWhitelistCommonSites').checked,
                enableSilentSurveillanceDetection: document.getElementById('enableSilentSurveillanceDetection').checked,
                darkMode: document.getElementById('darkMode').checked,
                compactView: document.getElementById('compactView').checked,
                showRiskScores: document.getElementById('showRiskScores').checked,
                autoApplyPolicies: document.getElementById('autoApplyPolicies').checked,
                rememberLastState: document.getElementById('rememberLastState').checked,
                enableCSP: document.getElementById('enableCSP').checked,
                blockThirdPartyByDefault: document.getElementById('blockThirdPartyByDefault').checked
            };
            
            await chrome.storage.local.set(settings);
            this.showNotification('Settings saved!', 'success');
            
            // Apply dark mode if enabled
            if (settings.darkMode) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        } catch (error) {
            console.error('Failed to save settings:', error);
            this.showNotification('Failed to save settings', 'error');
        }
    }
    
    async resetSettings() {
        if (!confirm('Reset all settings to default values?')) {
            return;
        }
        
        const defaultSettings = {
            securityLevel: 'high',
            showBlockNotifications: true,
            logAllowedEvents: false,
            autoWhitelistCommonSites: true,
            enableSilentSurveillanceDetection: true,
            darkMode: false,
            compactView: false,
            showRiskScores: true,
            autoApplyPolicies: true,
            rememberLastState: true,
            enableCSP: true,
            blockThirdPartyByDefault: true
        };
        
        try {
            await chrome.storage.local.set(defaultSettings);
            this.loadSettings();
            this.showNotification('Settings reset to defaults', 'success');
        } catch (error) {
            console.error('Failed to reset settings:', error);
            this.showNotification('Failed to reset settings', 'error');
        }
    }
    
    async exportPolicies() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_ALL_DOMAINS'
            });
            
            if (response.success) {
                const exportData = {
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    policies: response.domains
                };
                
                const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                    type: 'application/json'
                });
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `jade-policies-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.showNotification('Policies exported successfully', 'success');
            }
        } catch (error) {
            console.error('Failed to export policies:', error);
            this.showNotification('Failed to export policies', 'error');
        }
    }
    
    importPolicies() {
        const fileInput = document.getElementById('importFile');
        
        if (!fileInput.files.length) {
            alert('Please select a file to import');
            return;
        }
        
        const file = fileInput.files[0];
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (!data.policies || !Array.isArray(data.policies)) {
                    throw new Error('Invalid import file format');
                }
                
                if (!confirm(`Import ${data.policies.length} policies? This will overwrite existing ones.`)) {
                    return;
                }
                
                // Import each policy
                for (const policyData of data.policies) {
                    await chrome.runtime.sendMessage({
                        type: 'SAVE_POLICY',
                        domain: policyData.domain,
                        policy: policyData.policy
                    });
                }
                
                fileInput.value = '';
                this.loadPolicies();
                this.showNotification(`Imported ${data.policies.length} policies`, 'success');
            } catch (error) {
                console.error('Failed to import policies:', error);
                alert('Failed to import policies: ' + error.message);
            }
        };
        
        reader.readAsText(file);
    }
    
    async resetAllData() {
        if (!confirm('WARNING: This will delete ALL policies, logs, and settings. Are you absolutely sure?')) {
            return;
        }
        
        try {
            // Clear all storage
            await chrome.storage.local.clear();
            
            // Reset to defaults
            await chrome.storage.local.set({
                extensionEnabled: true,
                installationTime: Date.now()
            });
            
            this.loadPolicies();
            this.loadLogs();
            this.loadSettings();
            
            this.showNotification('All data has been reset', 'success');
        } catch (error) {
            console.error('Failed to reset data:', error);
            this.showNotification('Failed to reset data', 'error');
        }
    }
    
    async exportLogs() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_LOGS',
                limit: 10000
            });
            
            if (response.success) {
                const exportData = {
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    logs: response.logs
                };
                
                const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                    type: 'application/json'
                });
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `jade-logs-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.showNotification('Logs exported successfully', 'success');
            }
        } catch (error) {
            console.error('Failed to export logs:', error);
            this.showNotification('Failed to export logs', 'error');
        }
    }
    
    async exportLogsCsv() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_LOGS',
                limit: 10000
            });
            
            if (response.success) {
                const logs = response.logs;
                const headers = ['Timestamp', 'Domain', 'Action', 'API', 'Reason', 'Details'];
                
                const csvRows = [
                    headers.join(','),
                    ...logs.map(log => [
                        new Date(log.timestamp).toISOString(),
                        `"${log.domain || ''}"`,
                        log.action,
                        log.api,
                        `"${(log.reason || log.userMessage || '').replace(/"/g, '""')}"`,
                        `"${JSON.stringify(log.details || {}).replace(/"/g, '""')}"`
                    ].join(','))
                ];
                
                const csvString = csvRows.join('\n');
                const blob = new Blob([csvString], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `jade-logs-${new Date().toISOString().split('T')[0]}.csv`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                
                this.showNotification('Logs exported as CSV', 'success');
            }
        } catch (error) {
            console.error('Failed to export CSV:', error);
            this.showNotification('Failed to export CSV', 'error');
        }
    }
    
    goBack() {
        window.close();
    }
    
    refresh() {
        switch (this.currentTab) {
            case 'policy':
                this.loadPolicies();
                break;
            case 'logs':
                this.loadLogs();
                break;
            case 'settings':
                this.loadSettings();
                break;
        }
        this.showNotification('Refreshed', 'success');
    }
    
    showHelp() {
        alert(`JADE - JavaScript Advanced Domain Enforcer

📖 How to use:

1. Domain Policies:
   - Each website gets its own JavaScript policy
   - Toggle permissions for different APIs
   - Whitelist trusted sites

2. Security Levels:
   - High: Block all APIs by default
   - Medium: Block sensitive APIs only
   - Low: Allow most APIs

3. Monitoring:
   - View real-time security logs
   - See blocked API calls
   - Monitor risk scores

For more help, refer to the documentation.`);
    }
    
    showAbout() {
        alert(`JADE v1.0.0

🔒 JavaScript Advanced Domain Enforcer

A policy-driven browser extension that gives users fine-grained control over JavaScript capabilities on websites.

Features:
• Domain-based JavaScript policies
• Real-time API monitoring
• Risk scoring system
• Silent surveillance detection
• Export/import capabilities

Made with ❤️ for the hackathon project

Security | Privacy | Control`);
    }
    
    formatDate(timestamp) {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    }
    
    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffHours / 24);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: ${type === 'success' ? '#4caf50' : '#f44336'};
            color: white;
            padding: 12px 20px;
            border-radius: 6px;
            z-index: 10000;
            animation: slideIn 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        `;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
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
                @keyframes slideIn {
                    from { transform: translateX(100%); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
                @keyframes slideOut {
                    from { transform: translateX(0); opacity: 1; }
                    to { transform: translateX(100%); opacity: 0; }
                }
            `;
            document.head.appendChild(style);
        }
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.optionsManager = new OptionsManager();
});

// Export for testing
if (typeof module !== 'undefined') {
    module.exports = { OptionsManager };
}