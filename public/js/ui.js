/**
 * UI Controller
 * Handles all DOM interactions, form submissions, and UI updates
 */

class UIController {
    constructor(app) {
        this.app = app;  // Reference to main NoonLogUI instance
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Log form submission
        document.getElementById('logForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.submitLog();
        });

        // Position history button
        document.getElementById('viewHistoryBtn').addEventListener('click', () => {
            this.showPositionHistory();
        });

        // New voyage button
        document.getElementById('resetVoyageBtn').addEventListener('click', () => {
            this.resetVoyage();
        });

        // Send now button
        document.getElementById('sendNowBtn').addEventListener('click', () => {
            this.sendNow();
        });

        // Edit pending log button
        const editPendingBtn = document.getElementById('editPendingBtn');
        if (editPendingBtn) {
            editPendingBtn.addEventListener('click', () => {
                this.editPendingLog();
            });
        }

        // Clear pending log button
        const clearPendingBtn = document.getElementById('clearPendingBtn');
        if (clearPendingBtn) {
            clearPendingBtn.addEventListener('click', () => {
                this.clearPendingLog();
            });
        }

        // Close history modal
        document.getElementById('closeHistoryBtn').addEventListener('click', () => {
            document.getElementById('historyModal').style.display = 'none';
        });

        // Close modal on outside click
        document.getElementById('historyModal').addEventListener('click', (e) => {
            if (e.target.id === 'historyModal') {
                document.getElementById('historyModal').style.display = 'none';
            }
        });

        // Update time until noon every minute
        setInterval(() => {
            this.updateTimeDisplay();
        }, 60000);
    }

    // ========================================================================
    // FORM HANDLERS / API CALLS
    // ========================================================================

    /**
     * Submit log entry via API
     */
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
                this.loadVoyageLogs();
            } else {
                this.showMessage('error', `Error: ${result.error || 'Unknown error'}`);
            }
        } catch (error) {
            this.showMessage('error', `Error: ${error.message}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Save Log Entry';
        }
    }

    /**
     * Show position history modal
     */
    async showPositionHistory() {
        document.getElementById('historyModal').style.display = 'flex';
        document.getElementById('historyContent').innerHTML = '<div class="loading">Loading...</div>';

        try {
            // Get current voyage ID
            const voyageResponse = await fetch('/plugins/signalk-noon-log/api/voyage');
            const voyageData = await voyageResponse.json();
            const voyageId = voyageData?.data?.id;

            if (!voyageId) {
                document.getElementById('historyContent').innerHTML =
                    '<div class="empty-state"><p>No active voyage</p></div>';
                return;
            }

            const response = await fetch(`/plugins/signalk-noon-log/api/voyages/${voyageId}/positions`);
            const result = await response.json();

            if (!result.success) {
                throw new Error(result.error || 'Failed to load positions');
            }

            this.displayPositionHistory(result.data.positions);
        } catch (error) {
            document.getElementById('historyContent').innerHTML =
                `<div class="empty-state"><p>Error loading positions: ${error.message}</p></div>`;
        }
    }

    /**
     * Display position history in modal
     */
    displayPositionHistory(positions) {
        const historyContent = document.getElementById('historyContent');

        if (!positions || positions.length === 0) {
            historyContent.innerHTML = '<div class="empty-state"><p>No positions tracked yet</p></div>';
            return;
        }

        // Build dynamic column headers from first record with data
        const sensorLabels = [];
        for (const pos of positions) {
            if (pos.data && pos.data.length > 0) {
                pos.data.forEach(d => {
                    if (!sensorLabels.includes(d.data_label)) {
                        sensorLabels.push(d.data_label);
                    }
                });
                break;
            }
        }

        let html = `
            <div style="overflow-x: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.85rem;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                        <th style="padding: 8px 12px; color: var(--text-secondary); font-weight: 600;">Time</th>
                        <th style="padding: 8px 12px; color: var(--text-secondary); font-weight: 600;">Position</th>
                        ${sensorLabels.map(l => `<th style="padding: 8px 12px; color: var(--text-secondary); font-weight: 600;">${this.escapeHtml(l)}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
        `;

        positions.forEach((pos, idx) => {
            const date = new Date(pos.timestamp * 1000);
            const timeStr = date.toLocaleString('en-US', {
                month: 'short', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            const latStr = pos.latitude ? `${pos.latitude.toFixed(4)}°` : '--';
            const lonStr = pos.longitude ? `${pos.longitude.toFixed(4)}°` : '--';
            const rowBg = idx % 2 === 0 ? 'background-color: var(--background);' : '';

            // Build sensor value map for this row
            const sensorMap = {};
            if (pos.data) {
                pos.data.forEach(d => {
                    sensorMap[d.data_label] = `${d.data_value || '--'}${d.data_unit ? ' ' + d.data_unit : ''}`;
                });
            }

            html += `
                <tr style="border-bottom: 1px solid var(--border-color); ${rowBg}">
                    <td style="padding: 8px 12px; color: var(--text-primary); white-space: nowrap;">${timeStr}</td>
                    <td style="padding: 8px 12px; color: var(--text-primary); white-space: nowrap; font-family: monospace; font-size: 0.8rem;">${latStr} N<br>${lonStr} W</td>
                    ${sensorLabels.map(l => `<td style="padding: 8px 12px; color: var(--text-primary);">${this.escapeHtml(sensorMap[l] || '--')}</td>`).join('')}
                </tr>
            `;
        });

        html += `</tbody></table></div>`;
        html += `<div style="text-align: right; margin-top: 10px; font-size: 0.8rem; color: var(--text-secondary);">${positions.length} position${positions.length !== 1 ? 's' : ''} recorded</div>`;

        historyContent.innerHTML = html;
    }

    /**
     * Reset voyage (create new voyage)
     */
    async resetVoyage() {
        if (!confirm('Start a new voyage? This will archive the current voyage and reset distance tracking.')) {
            return;
        }

        const voyageName = prompt('Enter a name for the new voyage:');
        
        try {
            const response = await fetch('/plugins/signalk-noon-log/api/resetVoyage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voyageName: voyageName || null })
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('success', 'New voyage started');
                window.voyageManager?.loadVoyages();
                this.loadVoyageLogs();
            } else {
                this.showMessage('error', `Error: ${result.error}`);
            }
        } catch (error) {
            this.showMessage('error', `Error: ${error.message}`);
        }
    }

    /**
     * Export logs as JSON
     */
    async exportLogs() {
        try {
            const response = await fetch('/plugins/signalk-noon-log/api/export');
            const logs = await response.json();

            if (logs && logs.length > 0) {
                const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `noon-logs-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                this.showMessage('success', 'Logs exported successfully');
            } else {
                this.showMessage('error', 'No logs to export');
            }
        } catch (error) {
            this.showMessage('error', `Error: ${error.message}`);
        }
    }

    /**
     * Manually trigger noon report
     */
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
                this.loadVoyageLogs();
            } else {
                this.showMessage('error', `Error: ${result.error}`);
            }
        } catch (error) {
            this.showMessage('error', `Error: ${error.message}`);
        }
    }

    /**
     * Edit pending log - fetches it from server and loads into textarea
     */
    async editPendingLog() {
        try {
            // Fetch the current pending log from server
            const response = await fetch('/plugins/signalk-noon-log/api/getPendingLog');
            const result = await response.json();
            
            if (result.success && result.data && result.data.pendingLog) {
                const textarea = document.getElementById('logText');
                // Append to existing text if any
                if (textarea.value.trim()) {
                    textarea.value = textarea.value + '\n\n' + result.data.pendingLog;
                } else {
                    textarea.value = result.data.pendingLog;
                }
                // Scroll to the form
                document.getElementById('logForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
                // Focus the textarea
                textarea.focus();
            } else {
                this.showMessage('error', 'No pending log found');
            }
        } catch (error) {
            this.showMessage('error', `Error loading pending log: ${error.message}`);
        }
    }

    /**
     * Clear pending log
     */
    async clearPendingLog() {
        if (!confirm('Clear the pending log entry?')) {
            return;
        }

        try {
            // Submit empty/null log to clear
            const response = await fetch('/plugins/signalk-noon-log/api/submitLog', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logText: null })
            });

            const result = await response.json();

            if (result.success) {
                this.app.state.pendingLog = null;
                this.updatePendingLogDisplay();
                this.showMessage('success', 'Pending log cleared');
            } else {
                this.showMessage('error', `Error: ${result.error}`);
            }
        } catch (error) {
            this.showMessage('error', `Error: ${error.message}`);
        }
    }

    // ========================================================================
    // UI UPDATE METHODS
    // ========================================================================

    /**
     * Update all UI elements
     */
    updateUI() {
        this.updateTimeDisplay();
        this.updateVoyageDisplay();
        this.updateLastReport();
        this.updatePendingLogDisplay();
        this.updatePositionTrackingDisplay();
    }

    /**
     * Update connection status indicator
     */
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

    /**
     * Update time display (countdown to noon)
     */
    updateTimeDisplay() {
        const nextNoonEl = document.getElementById('nextNoonTime');

        if (this.app.state.timeUntilNoon && this.app.state.timeUntilNoon.nextNoon) {
            nextNoonEl.textContent = this.app.state.timeUntilNoon.nextNoon.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            document.getElementById('nextNoonDate').textContent =
                this.app.state.timeUntilNoon.nextNoon.toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric'
                });
        } else {
            nextNoonEl.textContent = '--:--';
            document.getElementById('nextNoonDate').textContent = '--';
        }
    }

    /**
     * Update voyage display (name and distance)
     */
    updateVoyageDisplay() {
        const voyageNameEl = document.getElementById('voyageName');
        const totalDistanceEl = document.getElementById('totalDistance');
        const distance24hEl = document.getElementById('distance24h');

        voyageNameEl.textContent = this.app.state.voyageName || '--';
        totalDistanceEl.textContent = `${this.app.state.totalDistance.toFixed(1)} nm`;
        distance24hEl.textContent = `${(this.app.state.distance24h || 0).toFixed(1)} nm`;
    }

    /**
     * Update last report display
     */
    updateLastReport() {
        // Removed - Last Report card no longer exists
        // Use the Voyage Logs viewer instead
    }

    /**
     * Update pending log display
     */
    updatePendingLogDisplay() {
        const pendingLogCard = document.getElementById('pendingLogCard');
        const pendingLogText = document.getElementById('pendingLogText');
        const pendingLogActions = document.getElementById('pendingLogActions');

        // Check if elements exist (they might not if using non-enhanced HTML)
        if (!pendingLogCard || !pendingLogText || !pendingLogActions) {
            return;
        }

        if (this.app.state.pendingLog) {
            // Show pending log card (state is just boolean now)
            pendingLogCard.style.display = 'block';
            
            // Build the message with next report time
            let message = '<div style="color: #856404; padding: 10px; text-align: center;">';
            message += 'Log entry saved and ready to send';
            
            // Add scheduled time if available
            if (this.app.state.timeUntilNoon && this.app.state.timeUntilNoon.nextNoon) {
                const nextReport = this.app.state.timeUntilNoon.nextNoon;
                const timeStr = nextReport.toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                });
                message += `<br><strong>Next scheduled report: ${timeStr}</strong>`;
            }
            
            message += '</div>';
            pendingLogText.innerHTML = message;
            pendingLogActions.style.display = 'flex';
        } else {
            // Hide pending log card
            pendingLogCard.style.display = 'none';
        }
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Show success/error message
     */
    showMessage(type, text) {
        const messageDiv = document.getElementById('submitMessage');
        messageDiv.className = `message ${type}`;
        messageDiv.textContent = text;
        messageDiv.style.display = 'block';

        setTimeout(() => {
            messageDiv.style.display = 'none';
        }, 5000);
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Update position tracking status display
     */
    updatePositionTrackingDisplay() {
        const statusEl = document.getElementById('positionTrackingStatus');
        const countEl = document.getElementById('positionsTracked');
        
        if (!statusEl || !countEl) return;
        
        const count = this.app.state.positionsTracked || 0;
        
        // Always show position tracking status (even when 0) so user knows if it's working
        statusEl.style.display = 'block';
        countEl.textContent = `${count} position${count !== 1 ? 's' : ''}`;
    }

    // ========================================================================
    // EMAIL MANAGEMENT
    // ========================================================================

    /**
     * Load and display email recipients
     */
    async loadEmailRecipients() {
        const emailList = document.getElementById('emailList');
        const emailCount = document.getElementById('emailCount');
        const emailListHeader = document.getElementById('emailListHeader');

        try {
            const response = await fetch('/plugins/signalk-noon-log/api/email/recipients');
            const result = await response.json();

            if (!result.success) {
                emailList.innerHTML = '<div class="empty-state">Error loading recipients</div>';
                return;
            }

            const recipients = result.data.recipients || [];

            // Update count
            if (emailCount) {
                emailCount.textContent = recipients.length;
            }

            // Show/hide header
            if (emailListHeader) {
                emailListHeader.style.display = recipients.length > 0 ? 'block' : 'none';
            }

            if (recipients.length === 0) {
                emailList.innerHTML = '<div class="empty-state">No email recipients yet. Add one above.</div>';
                return;
            }

            // Display recipients
            emailList.innerHTML = recipients.map(email => `
                <div class="email-item">
                    <span class="email-address">${this.escapeHtml(email)}</span>
                    <button class="email-remove-btn" data-email="${this.escapeHtml(email)}">
                        Remove
                    </button>
                </div>
            `).join('');

            // Add remove button listeners
            emailList.querySelectorAll('.email-remove-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const email = btn.getAttribute('data-email');
                    this.removeEmailRecipient(email);
                });
            });

        } catch (error) {
            console.error('Error loading email recipients:', error);
            emailList.innerHTML = '<div class="empty-state">Error loading recipients</div>';
        }
    }

    /**
     * Add email recipient
     */
    async addEmailRecipient(email) {
        try {
            const response = await fetch('/plugins/signalk-noon-log/api/email/recipients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const result = await response.json();

            if (!result.success) {
                this.showMessage('error', result.error || 'Failed to add email');
                return;
            }

            this.showMessage('success', result.data.message || 'Email added successfully');
            this.loadEmailRecipients();

        } catch (error) {
            console.error('Error adding email:', error);
            this.showMessage('error', 'Failed to add email');
        }
    }

    /**
     * Remove email recipient
     */
    async removeEmailRecipient(email) {
        if (!confirm(`Remove ${email} from recipients?`)) {
            return;
        }

        try {
            const encodedEmail = encodeURIComponent(email);
            const response = await fetch(`/plugins/signalk-noon-log/api/email/recipients/${encodedEmail}`, {
                method: 'DELETE'
            });

            const result = await response.json();

            if (!result.success) {
                this.showMessage('error', result.error || 'Failed to remove email');
                return;
            }

            this.showMessage('success', result.data.message || 'Email removed successfully');
            this.loadEmailRecipients();

        } catch (error) {
            console.error('Error removing email:', error);
            this.showMessage('error', 'Failed to remove email');
        }
    }

    /**
     * Setup email form handler
     */
    setupEmailFormHandler() {
        const form = document.getElementById('addEmailForm');
        const input = document.getElementById('newEmailInput');

        if (!form || !input) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = input.value.trim();
            if (!email) {
                this.showMessage('error', 'Please enter an email address');
                return;
            }

            await this.addEmailRecipient(email);
            input.value = ''; // Clear input on success
        });
    }

    /**
     * Setup log viewer
     */
    setupLogViewer() {
        // Load logs for current voyage
        this.loadVoyageLogs();
    }

    /**
     * Load logs for the current voyage
     */
    async loadVoyageLogs() {
        try {
            
            // First get the current voyage
            const voyageResponse = await fetch('/plugins/signalk-noon-log/api/voyage');
            
            if (!voyageResponse.ok) {
                console.error('Voyage fetch failed:', voyageResponse.status);
                throw new Error(`HTTP ${voyageResponse.status}`);
            }

            const voyageData = await voyageResponse.json();
            
            const voyageId = voyageData?.data?.id;
            
            if (!voyageId) {
                document.getElementById('voyageLogsList').innerHTML = `
                    <div style="text-align: center; padding: 20px; color: #6c757d;">
                        No active voyage
                    </div>
                `;
                return;
            }

            
            // Now get the logs for this voyage
            const logsResponse = await fetch(`/plugins/signalk-noon-log/api/voyages/${voyageId}`);
            
            
            if (!logsResponse.ok) {
                throw new Error(`HTTP ${logsResponse.status}`);
            }

            const data = await logsResponse.json();
            
            if (data.success && data.data && data.data.logs) {
                this.displayVoyageLogsList(data.data.logs);
            } else {
                this.displayVoyageLogsList([]);
            }

        } catch (error) {
            console.error('Error loading voyage logs:', error);
            document.getElementById('voyageLogsList').innerHTML = `
                <div style="text-align: center; padding: 20px; color: #dc3545;">
                    Failed to load logs: ${error.message}
                </div>
            `;
        }
    }

    /**
     * Display list of logs for current voyage
     * @param {Array} logs - Array of log objects
     */
    displayVoyageLogsList(logs) {
        const container = document.getElementById('voyageLogsList');
        const countEl = document.getElementById('logListCount');

        // Filter to only logs with text (no auto-track positions)
        const logsWithText = logs.filter(log => log.log_text && log.log_text.trim());

        if (!logsWithText || logsWithText.length === 0) {
            container.innerHTML = '<div class="empty-state">No log entries yet</div>';
            countEl.textContent = 'No Log Entries';
            return;
        }

        countEl.textContent = `${logsWithText.length} Log Entr${logsWithText.length !== 1 ? 'ies' : 'y'}`;

        // Store logs in a property so click handlers can access them
        this.currentVoyageLogs = logsWithText;
        container.innerHTML = logsWithText.map(log => {
            const date = new Date(log.timestamp * 1000);
            const dateDisplay = date.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                weekday: 'short'
            });
            const timeDisplay = date.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            const preview = log.log_text.substring(0, 60) + (log.log_text.length > 60 ? '...' : '');

            return `
                <div class="voyage-log-item" data-log-id="${log.id}">
                    <div class="log-item-date">${dateDisplay}</div>
                    <div class="log-item-time">${timeDisplay}</div>
                    <div class="log-item-preview">${this.escapeHtml(preview)}</div>
                </div>
            `;
        }).join('');

        // Add click handlers
        container.querySelectorAll('.voyage-log-item').forEach(item => {
            item.addEventListener('click', () => {
                const logId = parseInt(item.getAttribute('data-log-id'));
                const log = this.currentVoyageLogs.find(l => l.id === logId);
                if (log) {
                    this.displayLogById(log);
                    container.querySelectorAll('.voyage-log-item').forEach(i => i.classList.remove('selected'));
                    item.classList.add('selected');
                } else {
                    console.error('Log not found with ID:', logId);
                }
            });
        });

        // Auto-load the most recent log after handlers are attached
        const firstItem = container.querySelector('.voyage-log-item');
        if (firstItem) firstItem.click();
    }

    /**
     * Display a log by its full object
     * @param {Object} log - Log object
     */
    displayLogById(log) {
        // The log from the voyage endpoint already has data and distance
        this.displayLog(log);
    }

    /**
     * Load log for a specific date
     * @param {string} dateStr - Date string in YYYY-MM-DD format
     */
    async loadLogForDate(dateStr) {
        try {
            const response = await fetch(`/plugins/signalk-noon-log/api/logs/date/${dateStr}`);
            
            if (!response.ok) {
                if (response.status === 404) {
                    this.showNoLogFound();
                    return;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            if (data.success && data.log) {
                this.displayLog(data.log);
            } else {
                this.showNoLogFound();
            }

        } catch (error) {
            console.error('Error loading log:', error);
            this.showMessage('error', 'Failed to load log');
        }
    }

    /**
     * Display a log entry
     * @param {Object} log - Log entry object
     */
    displayLog(log) {
        
        // Hide placeholder, show result
        document.getElementById('logViewerPlaceholder').style.display = 'none';
        document.getElementById('logViewerResult').style.display = 'block';

        // Format and display date using timestamp
        const date = new Date(log.timestamp * 1000);
        const dateDisplay = date.toLocaleDateString('en-US', { 
            weekday: 'long',
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        });
        document.getElementById('logViewerDateDisplay').textContent = dateDisplay;

        // Display position in the badge area
        const positionEl = document.getElementById('logViewerType');
        if (log.latitude && log.longitude) {
            const latDir = log.latitude >= 0 ? 'N' : 'S';
            const lonDir = log.longitude >= 0 ? 'E' : 'W';
            positionEl.textContent = `${Math.abs(log.latitude).toFixed(4)}° ${latDir}, ${Math.abs(log.longitude).toFixed(4)}° ${lonDir}`;
            positionEl.style.backgroundColor = '';
            positionEl.className = 'log-position-badge log-position-badge--found';
            positionEl.style.fontSize = '0.8rem';
        } else {
            positionEl.textContent = 'No position';
            positionEl.style.backgroundColor = '';
            positionEl.className = 'log-position-badge log-position-badge--missing';
        }

        // Display log text if present
        const textSection = document.getElementById('logViewerTextSection');
        const textEl = document.getElementById('logViewerText');
        if (log.log_text && log.log_text.trim()) {
            textEl.textContent = log.log_text;
            textSection.style.display = 'block';
        } else {
            textSection.style.display = 'none';
        }

        // Display environmental data
        const dataSection = document.getElementById('logViewerDataSection');
        const dataContainer = document.getElementById('logViewerData');
        if (log.data && log.data.length > 0) {
            dataContainer.innerHTML = log.data.map(item => `
                <div class="log-data-item">
                    <div class="log-data-label">${this.escapeHtml(item.data_label)}</div>
                    <div class="log-data-value">${this.escapeHtml(item.data_value)}${this.escapeHtml(item.data_unit || '')}</div>
                </div>
            `).join('');
            dataSection.style.display = 'block';
        } else {
            dataSection.style.display = 'none';
        }

        // Display distance
        const distSection = document.getElementById('logViewerDistanceSection');
        if (log.distance) {
            const distLast = log.distance.distance_since_last ? 
                `${log.distance.distance_since_last.toFixed(1)} nm` : '--';
            const distTotal = log.distance.total_distance ? 
                `${log.distance.total_distance.toFixed(1)} nm` : '--';
            
            document.getElementById('logViewerDistLast').textContent = distLast;
            document.getElementById('logViewerDistTotal').textContent = distTotal;
            distSection.style.display = 'block';
        } else {
            distSection.style.display = 'none';
        }
    }

    /**
     * Show "no log found" message
     */
    showNoLogFound() {
        document.getElementById('logViewerResult').style.display = 'none';
        document.getElementById('logViewerPlaceholder').style.display = 'block';
    }

    /**
     * Format coordinate as degrees and minutes
     * @param {number} coord - Coordinate value
     * @param {string} type - 'lat' or 'lon'
     * @returns {string} Formatted coordinate
     */
    formatCoordinate(coord, type) {
        const isLat = type === 'lat';
        const dir = coord >= 0 ? (isLat ? 'N' : 'E') : (isLat ? 'S' : 'W');
        const abs = Math.abs(coord);
        const deg = Math.floor(abs);
        const min = ((abs - deg) * 60).toFixed(3);
        return `${deg}° ${min}' ${dir}`;
    }

    /**
     * Escape HTML to prevent XSS
     * @param {string} str - String to escape
     * @returns {string} Escaped string
     */
    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}