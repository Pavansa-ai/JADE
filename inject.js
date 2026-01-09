// This script gets injected into page context to intercept JavaScript APIs
(function() {
    if (window.__JADE_INJECTED__) {
        return; // Already injected
    }
    window.__JADE_INJECTED__ = true;
    
    // Store original APIs
    const originalAPIs = {
        fetch: window.fetch,
        XMLHttpRequest: window.XMLHttpRequest,
        localStorage: window.localStorage,
        sessionStorage: window.sessionStorage,
        cookieStore: window.cookieStore,
        navigator: {
            geolocation: window.navigator.geolocation,
            mediaDevices: window.navigator.mediaDevices,
            clipboard: window.navigator.clipboard,
            sendBeacon: window.navigator.sendBeacon
        },
        document: {
            cookie: Object.getOwnPropertyDescriptor(Document.prototype, 'cookie'),
            execCommand: document.execCommand
        },
        Notification: window.Notification,
        RTCPeerConnection: window.RTCPeerConnection
    };
    
    // Message bridge to content script
    function sendToContentScript(message) {
        window.postMessage({
            type: 'JADE_MESSAGE',
            payload: message
        }, '*');
    }
    
    // Request permission for an API call
    async function requestPermission(apiName, details) {
        return new Promise((resolve) => {
            const requestId = Math.random().toString(36).substr(2, 9);
            
            // Send request to content script
            sendToContentScript({
                type: 'API_PERMISSION_REQUEST',
                requestId,
                apiName,
                details,
                timestamp: Date.now()
            });
            
            // Listen for response
            const responseHandler = (event) => {
                if (event.data.type === 'JADE_RESPONSE' && 
                    event.data.payload.requestId === requestId) {
                    window.removeEventListener('message', responseHandler);
                    resolve(event.data.payload.allowed);
                }
            };
            
            window.addEventListener('message', responseHandler);
            
            // Timeout after 2 seconds
            setTimeout(() => {
                window.removeEventListener('message', responseHandler);
                resolve(false);
            }, 2000);
        });
    }
    
    // API Interceptors
    // 1. Fetch API
    window.fetch = async function(...args) {
        const [resource, options] = args;
        const url = typeof resource === 'string' ? resource : resource.url;
        
        const allowed = await requestPermission('fetch', {
            url,
            method: options?.method || 'GET',
            type: 'network'
        });
        
        if (!allowed) {
            throw new Error('JADE: Network request blocked by policy');
        }
        
        return originalAPIs.fetch.apply(this, args);
    };
    
    // 2. XMLHttpRequest
    const OriginalXHR = originalAPIs.XMLHttpRequest;
    window.XMLHttpRequest = class JADEXMLHttpRequest extends OriginalXHR {
        open(method, url, async = true, user, password) {
            this._jadeMethod = method;
            this._jadeUrl = url;
            super.open(method, url, async, user, password);
        }
        
        send(body) {
            (async () => {
                const allowed = await requestPermission('XMLHttpRequest', {
                    url: this._jadeUrl,
                    method: this._jadeMethod,
                    type: 'network'
                });
                
                if (!allowed) {
                    this.dispatchEvent(new Event('error'));
                    return;
                }
                
                super.send(body);
            })();
        }
    };
    
    // 3. LocalStorage
    const localStorageHandler = {
        get(target, prop) {
            if (prop === 'setItem' || prop === 'getItem' || prop === 'removeItem' || prop === 'clear') {
                return async function(...args) {
                    const allowed = await requestPermission('localStorage', {
                        operation: prop,
                        key: args[0],
                        type: 'storage'
                    });
                    
                    if (!allowed) {
                        return null;
                    }
                    
                    return target[prop].apply(target, args);
                };
            }
            return target[prop];
        }
    };
    
    window.localStorage = new Proxy(originalAPIs.localStorage, localStorageHandler);
    window.sessionStorage = new Proxy(originalAPIs.sessionStorage, localStorageHandler);
    
    // 4. Cookies
    if (originalAPIs.document.cookie) {
        Object.defineProperty(document, 'cookie', {
            get() {
                return originalAPIs.document.cookie.get.call(this);
            },
            async set(value) {
                const allowed = await requestPermission('cookies', {
                    operation: 'set',
                    value,
                    type: 'storage'
                });
                
                if (allowed) {
                    return originalAPIs.document.cookie.set.call(this, value);
                }
                return false;
            }
        });
    }
    
    // 5. Geolocation
    if (originalAPIs.navigator.geolocation) {
        const geoHandler = {
            get(target, prop) {
                if (prop === 'getCurrentPosition' || prop === 'watchPosition') {
                    return async function(...args) {
                        const allowed = await requestPermission('geolocation', {
                            operation: prop,
                            type: 'sensor'
                        });
                        
                        if (!allowed) {
                            const error = new Error('JADE: Geolocation permission denied');
                            error.code = 1;
                            args[1] && args[1](error);
                            return;
                        }
                        
                        return target[prop].apply(target, args);
                    };
                }
                return target[prop];
            }
        };
        
        window.navigator.geolocation = new Proxy(originalAPIs.navigator.geolocation, geoHandler);
    }
    
    // 6. Media Devices (Camera/Microphone)
    if (originalAPIs.navigator.mediaDevices) {
        const mediaHandler = {
            get(target, prop) {
                if (prop === 'getUserMedia') {
                    return async function(constraints) {
                        const allowed = await requestPermission('mediaDevices', {
                            operation: 'getUserMedia',
                            constraints,
                            type: 'sensor'
                        });
                        
                        if (!allowed) {
                            throw new Error('JADE: Media device permission denied');
                        }
                        
                        return target[prop].apply(target, [constraints]);
                    };
                }
                return target[prop];
            }
        };
        
        window.navigator.mediaDevices = new Proxy(originalAPIs.navigator.mediaDevices, mediaHandler);
    }
    
    console.log('JADE: JavaScript API interceptor injected');
})();

// Add at the end of your existing inject.js file:

// Listen for initialization message
window.addEventListener('message', (event) => {
    if (event.data.type === 'JADE_INIT') {
        console.log('JADE: Received policy from content script');
        
        // Store policy for quick access
        window.__JADE_POLICY = event.data.policy;
        window.__JADE_DOMAIN = event.data.domain;
        
        // Send acknowledgment
        window.postMessage({
            type: 'JADE_ACK',
            payload: { initialized: true }
        }, '*');
    }
});

// Export for testing
if (typeof module !== 'undefined') {
    module.exports = { 
        originalAPIs: window.originalAPIs,
        requestPermission: window.requestPermission 
    };
}