// Main JavaScript for Noon Log Plugin UI

class NoonLogUI {
    constructor() {
        this.ws = null;
        this.state = {
            connected: false,
            timeUntilNoon: null,
            lastLog: null,
            totalDistance: 0,
            reportsSent: 0,
            voyageName: '--'
        };

        this.init();
    }

    init() {
        this.connectWebSocket();
        this.setupEventListeners();
        this.loadInitialData();
        this.updateUI();
    }

    // Load initial data from API
    async loadInitialData() {
        try {
            const response = await fetch('/plugins/signalk-noon-log/api/voyage');
            const result = await response.json();
            if (result.success && result.data) {
                this.state.voyageName = result.data.name;
                this.updateUI();
            }
        } catch (error) {
            console.error('Failed to load initial voyage data:', error);
        }
    }

    // WebSocket Connection to SignalK delta stream
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/signalk/v1/stream?subscribe=self`;

        console.log('Connecting to SignalK stream:', wsUrl);

        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
            console.log('WebSocket connected');
            this.state.connected = true;
            this.updateConnectionStatus(true);
            
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
                this.handleDeltaMessage(data);
            } catch (error) {
                console.error('Error parsing delta message:', error);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateConnectionStatus(false);
        };

        this.ws.onclose = () => {
            console.log('WebSocket disconnected');
            this.state.connected = false;
            this.updateConnectionStatus(false);

            // Reconnect after 3 seconds
            setTimeout(() => {
                this.connectWebSocket();
            }, 3000);
        };
    }

    // Handle incoming SignalK delta messages
    handleDeltaMessage(data) {
        if (!data.updates) return;

        data.updates.forEach(update => {
            update.values?.forEach(({ path, value }) => {
                if (!path.startsWith('navigation.log')) return;

                console.log('Received delta:', path, value);

                // Handle different paths
                if (path === 'navigation.log.nextReport') {
                    this.state.timeUntilNoon = this.calculateTimeUntil(value);
                } else if (path === 'navigation.log.distance.total') {
                    this.state.totalDistance = value;
                } else if (path === 'navigation.log.reportsSent') {
                    this.state.reportsSent = value;
                } else if (path === 'navigation.log.voyageName') {
                    this.state.voyageName = value;
                } else if (path === 'navigation.log') {
                    // Full log entry update
                    this.state.lastLog = value;
                }

                this.updateUI();
            });
        });
    }

    calculateTimeUntil(nextNoonISO) {
        const nextNoon = new Date(nextNoonISO);
        const now = new Date();
        const msUntil = nextNoon - now;

        if (msUntil < 0) return { hours: 0, minutes: 0, nextNoon };

        const hours = Math.floor(msUntil / 1000 / 60 / 60);
        const minutes = Math.floor((msUntil / 1000 / 60) % 60);

        return { hours, minutes, nextNoon };
    }

    // Setup event listeners
    setupEventListeners() {
        document.getElementById('logForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitLog();
        });

        document.getElementById('clearLogBtn').addEventListener('click', () => {
            document.getElementById('logText').value = '';
        });

        document.getElementById('viewHistoryBtn').addEventListener('click', () => {
            this.showHistory();
        });

        document.getElementById('createNewVoyageBtn').addEventListener('click', () => {
            this.createNewVoyage();
        });

        document.getElementById('sendNowBtn').addEventListener('click', () => {
            this.sendNow();
        });

        document.getElementById('closeHistoryBtn').addEventListener('click', () => {
            document.getElementById('historyModal').style.display = 'none';
        });

        document.getElementById('historyModal').addEventListener('click', (e) => {
            if (e.target.id === 'historyModal') {
                document.getElementById('historyModal').style.display = 'none';
            }
        });

        setInterval(() => {
            this.updateTimeDisplay();
        }, 60000);
    }

    // Submit log entry via HTTP PUT
    async submitLog() {
        const logText = document.getElementById('logText').value.trim();
        const submitBtn = document.getElementById('submitLogBtn');

        if (!logText) {
            this.showMessage('error', 'Please enter a log entry');
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';

        try {
            const response = await fetch('/plugins/signalk-noon-log/api/submitLog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logText })
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('success', 'Log entry saved! It will be included in the next noon report.');
                document.getElementById('logText').value = '';
            } else {
                this.showMessage('error', `Error: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            this.showMessage('error', `Error: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Submit Log Entry';
        }
    }

    // Show history
    async showHistory() {
        document.getElementById('historyModal').style.display = 'flex';
        document.getElementById('historyContent').innerHTML = '<div class="loading">Loading...</div>';

        try {
            const response = await fetch('/plugins/signalk-noon-log/api/history?limit=30');
            const logs = await response.json();
            this.displayHistory(logs);
        } catch (error) {
            document.getElementById('historyContent').innerHTML =
                `<div class="empty-state"><p>Error loading history: ${error.message}</p></div>`;
        }
    }

    // Display history
    displayHistory(logs) {
        const historyContent = document.getElementById('historyContent');

        if (!logs || logs.length === 0) {
            historyContent.innerHTML = '<div class="empty-state"><p>No log entries yet</p></div>';
            return;
        }

        let html = '<div class="history-list">';

        for (const log of logs) {
            const date = new Date(log.timestamp * 1000);
            const dateStr = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
            const timeStr = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const preview = log.log_text
                ? log.log_text.substring(0, 100) + (log.log_text.length > 100 ? '...' : '')
                : 'No log text';

            const badgeClass = log.email_sent ? 'sent' : 'pending';
            const badgeText = log.email_sent ? '✓ Sent' : '⏳ Pending';

            html += `
                <div class="history-item">
                    <div class="history-item-header">
                        <span class="history-item-date">${dateStr} ${timeStr}</span>
                        <span class="history-item-badge ${badgeClass}">${badgeText}</span>
                    </div>
                    <div class="history-item-preview">${this.escapeHtml(preview)}</div>
                </div>
            `;
        }

        html += '</div>';
        historyContent.innerHTML = html;
    }

    async createNewVoyage() {
        if (!confirm('Start a new voyage? This will archive the current voyage and reset distance tracking to zero. All current logs will be preserved in the archived voyage.')) {
            return;
        }

        const voyageName = prompt('Enter a name for the new voyage:', `Voyage ${new Date().toLocaleDateString()}`);

        if (voyageName === null) {
            return;
        }

        try {
            const response = await fetch('/plugins/signalk-noon-log/api/resetVoyage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voyageName: voyageName || null })
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('success', 'New voyage created! The previous voyage has been archived.');
                await this.loadInitialData();

                if (window.voyageManager) {
                    await window.voyageManager.loadVoyages();
                }
            } else {
                this.showMessage('error', `Error: ${result.error}`);
            }
        } catch (error) {
            this.showMessage('error', `Error: ${error.message}`);
        }
    }

    async sendNow() {
        if (!confirm('Send the current log now (bypasses scheduled time)?')) {
            return;
        }

        try {
            const response = await fetch('/plugins/signalk-noon-log/api/sendNow', {
                method: 'POST'
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('success', 'Log sent successfully!');
            } else {
                this.showMessage('error', `Error: ${result.error}`);
            }
        } catch (error) {
            this.showMessage('error', `Error: ${error.message}`);
        }
    }

    updateUI() {
        this.updateTimeDisplay();
        this.updateVoyageDisplay();
        this.updateLastReport();
    }

    updateConnectionStatus(connected) {
        const statusDot = document.querySelector('.status-dot');
        const statusText = document.querySelector('.status-text');

        if (connected) {
            statusDot.classList.remove('offline');
            statusDot.classList.add('online');
            statusText.textContent = 'Connected';
        } else {
            statusDot.classList.remove('online');
            statusDot.classList.add('offline');
            statusText.textContent = 'Disconnected';
        }
    }

    updateTimeDisplay() {
        const nextNoonEl = document.getElementById('nextNoonTime');
        const timeUntilEl = document.getElementById('timeUntilNoon');

        if (this.state.timeUntilNoon && this.state.timeUntilNoon.nextNoon) {
            nextNoonEl.textContent = this.state.timeUntilNoon.nextNoon.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const { hours, minutes } = this.state.timeUntilNoon;
            timeUntilEl.textContent = `${hours}h ${minutes}m`;
        } else {
            nextNoonEl.textContent = '--:--';
            timeUntilEl.textContent = '-- hours -- min';
        }
    }

    updateVoyageDisplay() {
        const voyageNameEl = document.getElementById('voyageName');
        const totalDistanceEl = document.getElementById('totalDistance');

        voyageNameEl.textContent = this.state.voyageName || '--';
        totalDistanceEl.textContent = `${this.state.totalDistance.toFixed(1)} nm`;
    }

    updateLastReport() {
        const lastReportContent = document.getElementById('lastReportContent');

        if (!this.state.lastLog) {
            lastReportContent.innerHTML = '<div class="empty-state"><p>No reports yet</p></div>';
            return;
        }

        const log = this.state.lastLog;
        const date = new Date(log.timestamp * 1000);
        const dateStr = date.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        let html = '<div class="report-content">';
        html += `<div class="report-section"><h3>${dateStr}</h3></div>`;

        if (log.logText) {
            html += `
                <div class="report-section">
                    <h3>Captain's Log</h3>
                    <div class="report-log-text">${this.escapeHtml(log.logText)}</div>
                </div>
            `;
        }

        html += '</div>';
        lastReportContent.innerHTML = html;
    }

    showMessage(type, text) {
        const messageDiv = document.getElementById('submitMessage');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = text;
        messageDiv.style.display = 'block';

        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.noonLogUI = new NoonLogUI();

    setTimeout(() => {
        if (typeof VoyageManager !== 'undefined') {
            window.voyageManager = new VoyageManager(window.noonLogUI);
            window.voyageManager.initializeModalHandlers();
            window.voyageManager.loadVoyages();
        } else {
            console.error('VoyageManager not loaded');
        }
    }, 100);
});
