/**
 * WebSocket Manager
 * Handles SignalK WebSocket connection and delta message processing
 */

class WebSocketManager {
    constructor(app) {
        this.app = app;  // Reference to main NoonLogUI instance
        this.ws = null;
    }

    /**
     * Connect to SignalK WebSocket stream
     */
    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/signalk/v1/stream?subscribe=self`;

        console.log('Connecting to SignalK stream:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.app.state.connected = true;
            this.app.ui.updateConnectionStatus(true);
            
            // Subscribe to navigation.log paths
            this.ws.send(JSON.stringify({
                context: 'vessels.self',
                subscribe: [{
                    path: 'navigation.log.*',
                    period: 1000
                }]
            }));
        };

        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (error) {
                console.error('Error parsing delta message:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.app.ui.updateConnectionStatus(false);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.app.state.connected = false;
            this.app.ui.updateConnectionStatus(false);

            // Reconnect after 3 seconds
            setTimeout(() => {
                this.connect();
            }, 3000);
        };
    }

    /**
     * Handle incoming SignalK delta messages
     */
    handleMessage(data) {
        if (!data.updates) return;

        data.updates.forEach(update => {
            update.values?.forEach(({ path, value }) => {
                if (!path.startsWith('navigation.log')) return;

                console.log('Received delta:', path, value);

                // Update state based on path
                if (path === 'navigation.log.nextReport') {
                    this.app.state.timeUntilNoon = this.calculateTimeUntil(value);
                } else if (path === 'navigation.log.distance.total') {
                    this.app.state.totalDistance = value;
                } else if (path === 'navigation.log.reportsSent') {
                    this.app.state.reportsSent = value;
                } else if (path === 'navigation.log.voyageName') {
                    this.app.state.voyageName = value;
                } else if (path === 'navigation.log.pendingEntry') {
                    // Pending log status (boolean: true if pending, false if cleared)
                    // We store the boolean - the actual text stays on server
                    this.app.state.pendingLog = value ? true : false;
                } else if (path === 'navigation.log.positionsTracked') {
                    // Position tracking count
                    this.app.state.positionsTracked = value;
                } else if (path === 'navigation.log') {
                    // Full log entry update
                    this.app.state.lastLog = value;
                }

                // Trigger UI update
                this.app.ui.updateUI();
            });
        });
    }

    /**
     * Calculate time until next report
     */
    calculateTimeUntil(nextNoonISO) {
        const nextNoon = new Date(nextNoonISO);
        const now = new Date();
        const msUntil = nextNoon - now;

        if (msUntil < 0) return { hours: 0, minutes: 0, nextNoon };

        const hours = Math.floor(msUntil / 1000 / 60 / 60);
        const minutes = Math.floor((msUntil / 1000 / 60) % 60);

        return { hours, minutes, nextNoon };
    }

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}