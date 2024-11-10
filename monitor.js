const { connect } = require('puppeteer-real-browser');

// Configuration flag
const RAPID_CLOUD_ONLY = true;

// NEW: Helper function to check for source value matches
function checkSourceValueMatch(content, sourceValue) {
    if (!content || !sourceValue) return false;
    
    // Check original value
    if (content.includes(sourceValue)) return true;
    
    // Check decoded value
    try {
        const decoded = decodeURIComponent(sourceValue);
        if (content.includes(decoded)) return true;
    } catch (e) {}
    
    // Check base64 encoded value
    try {
        const base64 = Buffer.from(sourceValue).toString('base64');
        if (content.includes(base64)) return true;
    } catch (e) {}
    
    return false;
}

// Helper function to check if request is rapid-cloud related
function isRapidCloudRelated(url, headers) {
    if (!RAPID_CLOUD_ONLY) return true;

    // Check URL
    if (url.includes('rapid-cloud.co')) return true;

    // Check referrer
    const referrer = headers.referer || headers.Referer || '';
    if (referrer.includes('rapid-cloud.co')) return true;

    // Check origin
    const origin = headers.origin || headers.Origin || '';
    if (origin.includes('rapid-cloud.co')) return true;

    return false;
}

// Helper function to format headers for logging
function formatHeaders(headers) {
    const formatted = { ...headers };
    if (formatted.referer?.includes('rapid-cloud.co')) {
        formatted.referer = `[RAPID-CLOUD] ${formatted.referer}`;
    }
    if (formatted.origin?.includes('rapid-cloud.co')) {
        formatted.origin = `[RAPID-CLOUD] ${formatted.origin}`;
    }
    return formatted;
}

async function monitorTraffic(url) {
    const { page, browser } = await connect({
        args: ["--start-maximized"],
        headless: false,
        connectOption: {
            defaultViewport: null
        }
    });

    // Enable request interception
    await page.setRequestInterception(true);
    
    // Get the CDP session
    const client = await page.target().createCDPSession();
    
    // Enable necessary domains
    await client.send('Network.enable');
    await client.send('ServiceWorker.enable');
    await client.send('Runtime.enable');

    // Create a log file for requests
    const fs = require('fs');
    const logStream = fs.createWriteStream('traffic.log', { flags: 'a' });

    // Helper function to write to both console and file
    const logRequest = (prefix, data) => {
        const logEntry = JSON.stringify(data, null, 2);
        console.log(`\n${prefix}`);
        console.log(logEntry);
        logStream.write(`${prefix}\n${logEntry}\n`);
    };

    // Configuration for sources monitoring
    const SOURCES_PATTERN = /"sources":"([^"]+)"/;
    const sourceValues = new Set();

    // MODIFIED: Monitor script execution with enhanced source value checking
    client.on('Runtime.executionContextCreated', async (context) => {
        try {
            const { scriptSource } = await client.send('Runtime.getScriptSource', { 
                scriptId: context.context.auxData?.frameId 
            });
            
            for (const sourceValue of sourceValues) {
                if (checkSourceValueMatch(scriptSource, sourceValue)) {
                    console.log('\n🔍 Found sources value usage:', {
                        url: context.context.auxData?.url || 'inline script',
                        context: extractContext(scriptSource, sourceValue)
                    });
                }
            }
        } catch (error) {
            // Ignore errors as some contexts might not have associated scripts
        }
    });

    // Helper function to extract context
    function extractContext(source, value) {
        if (!source) return '';
        const index = source.indexOf(value);
        if (index === -1) return '';
        
        const start = Math.max(0, index - 100);
        const end = Math.min(source.length, index + value.length + 100);
        return source.substring(start, end);
    }

    // NEW: WebSocket monitoring
    client.on('Network.webSocketFrameSent', (event) => {
        const { payload } = event;
        for (const sourceValue of sourceValues) {
            if (checkSourceValueMatch(payload, sourceValue)) {
                console.log('\n📡 Found sources value in WebSocket message (sent):', {
                    payload: payload.substring(0, 100) + '...'
                });
            }
        }
    });

    client.on('Network.webSocketFrameReceived', (event) => {
        const { payload } = event;
        for (const sourceValue of sourceValues) {
            if (checkSourceValueMatch(payload, sourceValue)) {
                console.log('\n📡 Found sources value in WebSocket message (received):', {
                    payload: payload.substring(0, 100) + '...'
                });
            }
        }
    });

    // Listen to service worker requests
    client.on('Network.requestWillBeSent', request => {
        const url = request.request.url;
        const headers = request.request.headers;

        if (!url.endsWith('.svg') && isRapidCloudRelated(url, headers)) {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                url,
                method: request.request.method,
                headers: formatHeaders(headers),
                resourceType: request.type,
                isServiceWorker: true
            };

            logRequest('🤖 Detected Service Worker request:', logEntry);
        }
    });

    // Listen to service worker responses
    client.on('Network.responseReceived', response => {
        const url = response.response.url;
        const headers = response.response.headers;

        if (!url.endsWith('.svg') && isRapidCloudRelated(url, headers)) {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                url,
                status: response.response.status,
                headers: formatHeaders(headers),
                resourceType: response.type,
                isServiceWorker: true
            };

            logRequest('🤖 Received Service Worker response:', logEntry);
        }
    });

    // MODIFIED: Listen to page requests with enhanced source value checking
    page.on('request', request => {
        const url = request.url();
        const resourceType = request.resourceType();
        const headers = request.headers();
        const postData = request.postData();

        // Check URL and post data for source values
        for (const sourceValue of sourceValues) {
            if (checkSourceValueMatch(url, sourceValue) || 
                checkSourceValueMatch(postData, sourceValue)) {
                console.log('\n🔍 Found sources value in request:', {
                    url,
                    postData: postData ? postData.substring(0, 100) + '...' : undefined,
                    resourceType
                });
            }
        }

        if (resourceType !== 'image' && !url.endsWith('.svg') && isRapidCloudRelated(url, headers)) {
            const timestamp = new Date().toISOString();
            const logEntry = {
                timestamp,
                url,
                method: request.method(),
                headers: formatHeaders(headers),
                resourceType,
                isServiceWorker: false
            };

            logRequest('🔍 Detected request:', logEntry);
        }
        request.continue();
    });

    // MODIFIED: Listen to page responses with enhanced source value logging
    page.on('response', async response => {
        const url = response.url();
        const resourceType = response.request().resourceType();
        const headers = response.headers();

        if (resourceType !== 'image' && !url.endsWith('.svg') && isRapidCloudRelated(url, headers)) {
            const timestamp = new Date().toISOString();
            try {
                const responseBody = await response.text();
                
                // Check if this is a getSources response
                if (url.includes('/getSources?id=')) {
                    // Extract and store the sources value
                    const match = SOURCES_PATTERN.exec(responseBody);
                    if (match && match[1]) {
                        sourceValues.add(match[1]);
                        console.log('\n🎯 Found new sources value to monitor:', {
                            value: match[1].substring(0, 50) + '...',
                            totalValues: sourceValues.size
                        });
                    }
                }

                const logEntry = {
                    timestamp,
                    url,
                    status: response.status(),
                    headers: formatHeaders(headers),
                    resourceType,
                    isServiceWorker: false,
                    body: responseBody.substring(0, 1000) + (responseBody.length > 1000 ? '...' : '')
                };

                logRequest('✅ Received response:', logEntry);
            } catch (error) {
                console.error('Error processing response:', error);
                logStream.write(`Error processing response: ${error.message}\n`);
            }
        }
    });

    client.on('Runtime.consoleAPICalled', async (event) => {
        for (const arg of event.args) {
            const value = arg.value || arg.description;
            if (value) {
                for (const sourceValue of sourceValues) {
                    if (checkSourceValueMatch(value, sourceValue)) {
                        console.log('\n🔍 Found sources value in console:', {
                            type: event.type,
                            url: event.context?.url || 'unknown',
                            context: extractContext(value, sourceValue)
                        });
                    }
                }
            }
        }
    });

    client.on('Runtime.evaluate', async (event) => {
        const { result } = event;
        if (result.value) {
            for (const sourceValue of sourceValues) {
                if (checkSourceValueMatch(result.value, sourceValue)) {
                    console.log('\n🔍 Found sources value in evaluation:', {
                        url: 'eval',
                        context: extractContext(result.value, sourceValue)
                    });
                }
            }
        }
    });

    // Monitor Service Worker scripts
    client.on('ServiceWorker.scriptResponseReceived', async (event) => {
        const { scriptURL, body } = event;
        
        for (const sourceValue of sourceValues) {
            if (checkSourceValueMatch(body, sourceValue)) {
                console.log('\n🔧 Found sources value in Service Worker:', {
                    url: scriptURL,
                    context: extractContext(body, sourceValue)
                });
            }
        }
    });

    // Monitor Service Worker state changes and messages
    client.on('ServiceWorker.workerVersionUpdated', async (event) => {
        const { versions } = event;
        for (const version of versions) {
            try {
                const { scriptSource } = await client.send('ServiceWorker.getWorkerSourceContents', {
                    workerId: version.id
                });
                
                for (const sourceValue of sourceValues) {
                    if (checkSourceValueMatch(scriptSource, sourceValue)) {
                        console.log('\n🔧 Found sources value in updated Service Worker:', {
                            url: version.scriptURL,
                            status: version.status,
                            context: extractContext(scriptSource, sourceValue)
                        });
                    }
                }
            } catch (error) {
                // Ignore errors as some workers might not be accessible
            }
        }
    });

    // Navigate to the specified URL
    try {
        await page.goto(url, { waitUntil: 'networkidle0' });
        console.log('Page loaded successfully');
        logStream.write(`\n${new Date().toISOString()} - Page loaded successfully: ${url}\n`);
    } catch (error) {
        console.error('Error loading page:', error);
        logStream.write(`\n${new Date().toISOString()} - Error loading page: ${error.message}\n`);
    }

    console.log('\nMonitoring traffic...' + (RAPID_CLOUD_ONLY ? ' (rapid-cloud.co and related traffic)' : ' (all URLs)'));
    console.log('Press Ctrl+C to stop.');
    logStream.write(`\n${new Date().toISOString()} - Started monitoring traffic ${RAPID_CLOUD_ONLY ? '(rapid-cloud.co and related traffic)' : '(all URLs)'}\n`);

    // Handle process termination
    process.on('SIGINT', async () => {
        console.log('\nClosing browser...');
        logStream.write(`\n${new Date().toISOString()} - Stopping monitoring\n`);
        logStream.end();
        await client.detach();
        await browser.close();
        process.exit();
    });
}

// Start monitoring with the specified URL
const targetUrl = process.argv[2] || 'https://example.com';
monitorTraffic(targetUrl).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});