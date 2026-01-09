// Content Script - Runs in page context to enforce policies
class PolicyEnforcer {
    constructor() {
        this.currentDomain = null;
        this.currentPolicy = null;
        this.isEnabled = true;
        this.logQueue = [];
        this.messageQueue = [];
        
        this.init();
    }
    
    async init() {
        // Extract current domain
        this.currentDomain = this.extractDomain(window.location.href);
        
        // Get policy for this domain
        await this.loadPolicy();
        
        // Listen for messages from background
        chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));
        
        // Listen for messages from injected script
        window.addEventListener('message', this.handleWindowMessage.bind(this));
        
        // Inject API interceptor script
        this.injectInterceptor();
        
        console.log(`JADE: Policy enforcer initialized for ${this.currentDomain}`);
    }
    
    extractDomain(url) {
        try {
            const urlObj = new URL(url);
            return urlObj.hostname.replace('www.', '');
        } catch (e) {
            return url;
        }
    }
    
    async loadPolicy() {
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'GET_POLICY',
                domain: this.currentDomain
            });
            
            if (response.success) {
                this.currentPolicy = response.policy;
                console.log(`JADE: Loaded policy for ${this.currentDomain}`, this.currentPolicy);
                
                // Apply Content Security Policy based on policy
                this.applyCSP();
            }
        } catch (error) {
            console.error('JADE: Failed to load policy:', error);
        }
    }
    
    applyCSP() {
        if (!this.currentPolicy || !this.currentPolicy.allowNetwork) {
            // Apply restrictive CSP
            const cspMeta = document.createElement('meta');
            cspMeta.httpEquiv = 'Content-Security-Policy';
            cspMeta.content = "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self';";
            
            if (document.head) {
                document.head.appendChild(cspMeta);
            } else {
                document.addEventListener('DOMContentLoaded', () => {
                    document.head.appendChild(cspMeta);
                });
            }
        }
    }
    
    injectInterceptor() {
        // Inject the interceptor script
        const script = document.createElement('script');
        script.src = chrome.runtime.getURL('inject.js');
        script.onload = () => {
            script.remove();
            // Notify injected script about current policy
            window.postMessage({
                type: 'JADE_INIT',
                policy: this.currentPolicy,
                domain: this.currentDomain
            }, '*');
        };
        
        (document.head || document.documentElement).appendChild(script);
    }
    
    async checkPermission(apiName, details) {
        if (!this.isEnabled || !this.currentPolicy) {
            return false;
        }
        
        // Map API names to policy properties
        const apiPolicyMap = {
            'fetch': 'allowNetwork',
            'XMLHttpRequest': 'allowNetwork',
            'localStorage': 'allowStorage',
            'sessionStorage': 'allowStorage',
            'cookies': 'allowCookies',
            'geolocation': 'allowGeolocation',
            'mediaDevices': 'allowCamera',
            'clipboard': 'allowClipboard',
            'Notification': 'allowNotifications',
            'RTCPeerConnection': 'allowWebRTC'
        };
        
        const policyProperty = apiPolicyMap[apiName];
        
        if (!policyProperty) {
            // Unknown API - default to deny
            await this.logEvent({
                domain: this.currentDomain,
                action: 'blocked',
                api: apiName,
                reason: 'Unknown API',
                details: details,
                timestamp: Date.now()
            });
            return false;
        }
        
        const isAllowed = this.currentPolicy[policyProperty] || this.currentPolicy.whitelisted;
        
        if (isAllowed) {
            await this.logEvent({
                domain: this.currentDomain,
                action: 'allowed',
                api: apiName,
                details: details,
                timestamp: Date.now()
            });
            return true;
        } else {
            await this.logEvent({
                domain: this.currentDomain,
                action: 'blocked',
                api: apiName,
                reason: `Policy violation: ${policyProperty} is disabled`,
                details: details,
                timestamp: Date.now(),
                userMessage: this.generateUserMessage(apiName, details)
            });
            return false;
        }
    }
    
    generateUserMessage(apiName, details) {
        const messages = {
            'fetch': `Blocked network request to ${details.url}`,
            'XMLHttpRequest': `Blocked AJAX request to ${details.url}`,
            'localStorage': `Blocked local storage access for key: ${details.key}`,
            'cookies': `Blocked cookie access`,
            'geolocation': `Blocked location access attempt`,
            'mediaDevices': `Blocked camera/microphone access`,
            'clipboard': `Blocked clipboard access`,
            'Notification': `Blocked notification request`
        };
        
        return messages[apiName] || `Blocked ${apiName} access`;
    }
    
    async logEvent(event) {
        try {
            // Add additional context
            event.domain = this.currentDomain;
            event.policy = this.currentPolicy;
            event.url = window.location.href;
            
            // Send to background
            await chrome.runtime.sendMessage({
                type: 'LOG_EVENT',
                event: event
            });
            
            // Show notification for important blocks
            if (event.action === 'blocked' && this.shouldNotify(event)) {
                this.showNotification(event);
            }
        } catch (error) {
            console.error('JADE: Failed to log event:', error);
        }
    }
    
    shouldNotify(event) {
        // Only notify for sensitive APIs
        const sensitiveAPIs = ['geolocation', 'mediaDevices', 'clipboard', 'cookies'];
        return sensitiveAPIs.includes(event.api);
    }
    
    showNotification(event) {
        // Create a subtle notification
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 10px;
            right: 10px;
            background: #ff4444;
            color: white;
            padding: 10px 15px;
            border-radius: 5px;
            z-index: 999999;
            font-family: Arial, sans-serif;
            font-size: 12px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            max-width: 300px;
            animation: fadeIn 0.3s;
        `;
        
        notification.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 5px;">JADE Security Alert</div>
            <div>${event.userMessage || 'Blocked suspicious activity'}</div>
            <div style="font-size: 10px; margin-top: 5px; opacity: 0.8;">
                Click the JADE extension for details
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.animation = 'fadeOut 0.3s';
                setTimeout(() => notification.remove(), 300);
            }
        }, 5000);
        
        // Add CSS animations
        const style = document.createElement('style');
        style.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    handleMessage(request, sender, sendResponse) {
        switch (request.type) {
            case 'POLICY_UPDATED':
                this.currentPolicy = request.policy;
                console.log('JADE: Policy updated');
                break;
                
            case 'TAB_UPDATED':
                // Reload policy if domain changed
                const newDomain = this.extractDomain(request.url);
                if (newDomain !== this.currentDomain) {
                    this.currentDomain = newDomain;
                    this.loadPolicy();
                }
                break;
        }
        sendResponse({ received: true });
        return true;
    }
    
    handleWindowMessage(event) {
        if (event.data.type === 'JADE_MESSAGE') {
            const message = event.data.payload;
            
            switch (message.type) {
                case 'API_PERMISSION_REQUEST':
                    this.handlePermissionRequest(message);
                    break;
            }
        }
    }
    
    async handlePermissionRequest(request) {
        const allowed = await this.checkPermission(request.apiName, request.details);
        
        // Send response back to injected script
        window.postMessage({
            type: 'JADE_RESPONSE',
            payload: {
                requestId: request.requestId,
                allowed: allowed,
                timestamp: Date.now()
            }
        }, '*');
    }
    
    // DOM Mutation Observer for detecting UI changes
    setupDOMObserver() {
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check for suspicious DOM changes
                    this.analyzeDOMChanges(mutation);
                }
            });
        });
        
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: false,
            characterData: false
        });
        
        return observer;
    }
    
    analyzeDOMChanges(mutation) {
        // Analyze added nodes for suspicious patterns
        mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
                // Check for invisible tracking pixels
                if (node.tagName === 'IMG' && 
                    (node.style.display === 'none' || 
                     node.style.visibility === 'hidden' ||
                     node.style.opacity === '0' ||
                     node.style.width === '0px' ||
                     node.style.height === '0px')) {
                    
                    this.logEvent({
                        domain: this.currentDomain,
                        action: 'detected',
                        api: 'DOM',
                        reason: 'Potential tracking pixel detected',
                        details: {
                            element: 'IMG',
                            src: node.src,
                            styles: {
                                display: node.style.display,
                                visibility: node.style.visibility,
                                opacity: node.style.opacity,
                                width: node.style.width,
                                height: node.style.height
                            }
                        },
                        timestamp: Date.now()
                    });
                }
                
                // Check for hidden iframes
                if (node.tagName === 'IFRAME' && 
                    (node.style.display === 'none' || 
                     node.style.visibility === 'hidden')) {
                    
                    this.logEvent({
                        domain: this.currentDomain,
                        action: 'detected',
                        api: 'DOM',
                        reason: 'Hidden iframe detected',
                        details: {
                            element: 'IFRAME',
                            src: node.src,
                            styles: {
                                display: node.style.display,
                                visibility: node.style.visibility
                            }
                        },
                        timestamp: Date.now()
                    });
                }
            }
        });
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.JADE_ENFORCER = new PolicyEnforcer();
    });
} else {
    window.JADE_ENFORCER = new PolicyEnforcer();
}

// Export for testing
if (typeof module !== 'undefined') {
    module.exports = { PolicyEnforcer };
}