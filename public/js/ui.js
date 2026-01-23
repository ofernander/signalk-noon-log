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

        // Clear button
        document.getElementById('clearLogBtn').addEventListener('click', () => {
            document.getElementById('logText').value = '';
        });

        // View history button
        document.getElementById('viewHistoryBtn').addEventListener('click', () => {
            this.showHistory();
        });

        // Reset voyage button
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

    /**
     * Show history modal
     */
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

    /**
     * Display history in modal
     */
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

            const preview = log.log_text ? log.log_text.substring(0, 100) + (log.log_text.length > 100 ? '...' : '') : 'No log text';
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

    /**
     * Reset voyage (create new voyage)
     */
    async resetVoyage() {
        if (!confirm('Are you sure you want to reset the trip log? This will start distance tracking from zero.')) {
            return;
        }

        const voyageName = prompt('Enter a name for the new voyage (optional):');
        
        try {
            const response = await fetch('/plugins/signalk-noon-log/api/resetVoyage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ voyageName: voyageName || null })
            });

            const result = await response.json();

            if (result.success) {
                this.showMessage('success', 'Trip log has been reset');
                // Reload voyage data
                await this.app.loadInitialData();
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
        const timeUntilEl = document.getElementById('timeUntilNoon');

        if (this.app.state.timeUntilNoon && this.app.state.timeUntilNoon.nextNoon) {
            nextNoonEl.textContent = this.app.state.timeUntilNoon.nextNoon.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });

            const hours = this.app.state.timeUntilNoon.hours;
            const minutes = this.app.state.timeUntilNoon.minutes;
            timeUntilEl.textContent = `${hours}h ${minutes}m`;
        } else {
            nextNoonEl.textContent = '--:--';
            timeUntilEl.textContent = '-- hours -- min';
        }
    }

    /**
     * Update voyage display (name and distance)
     */
    updateVoyageDisplay() {
        const voyageNameEl = document.getElementById('voyageName');
        const totalDistanceEl = document.getElementById('totalDistance');

        voyageNameEl.textContent = this.app.state.voyageName || '--';
        totalDistanceEl.textContent = `${this.app.state.totalDistance.toFixed(1)} nm`;
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
            message += '✅ Log entry saved and ready to send';
            
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
                        🗑️ Remove
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
            container.innerHTML = `
                <div style="text-align: center; padding: 20px; color: #6c757d;">
                    No log entries yet
                </div>
            `;
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
            
            // Get first 60 chars of log text as preview
            const preview = log.log_text.substring(0, 60) + (log.log_text.length > 60 ? '...' : '');
            
            return `
                <div class="voyage-log-item" data-log-id="${log.id}" 
                     style="padding: 10px; cursor: pointer; border-bottom: 1px solid #e9ecef; transition: background-color 0.2s;"
                     onmouseover="this.style.backgroundColor='#f8f9fa'"
                     onmouseout="this.style.backgroundColor='white'">
                    <div style="display: flex; align-items: start; gap: 8px;">
                        <span style="font-size: 1.2rem;">📝</span>
                        <div style="flex: 1; min-width: 0;">
                            <div style="font-weight: 500; font-size: 0.9rem; color: #212529;">${dateDisplay}</div>
                            <div style="font-size: 0.75rem; color: #6c757d; margin-top: 2px;">${timeDisplay}</div>
                            <div style="font-size: 0.75rem; color: #495057; margin-top: 4px; opacity: 0.8;">${this.escapeHtml(preview)}</div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Add click handlers - using arrow function to preserve 'this' context
        container.querySelectorAll('.voyage-log-item').forEach(item => {
            item.addEventListener('click', () => {
                const logId = parseInt(item.getAttribute('data-log-id'));
                const log = this.currentVoyageLogs.find(l => l.id === logId);
                if (log) {
                    this.displayLogById(log);
                    // Highlight selected
                    container.querySelectorAll('.voyage-log-item').forEach(i => {
                        i.style.backgroundColor = 'white';
                    });
                    item.style.backgroundColor = '#e7f3ff';
                } else {
                    console.error('Log not found with ID:', logId);
                }
            });
        });
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
            positionEl.textContent = `${log.latitude.toFixed(6)}°, ${log.longitude.toFixed(6)}°`;
            positionEl.style.backgroundColor = '#28a745';
            positionEl.style.fontSize = '0.8rem';
        } else {
            positionEl.textContent = 'No position';
            positionEl.style.backgroundColor = '#6c757d';
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
                <div style="background-color: white; padding: 10px; border-radius: 4px; border: 1px solid #dee2e6;">
                    <div style="font-size: 0.8rem; color: #6c757d; margin-bottom: 4px;">${this.escapeHtml(item.data_label)}</div>
                    <div style="font-weight: 500;">${this.escapeHtml(item.data_value)}${this.escapeHtml(item.data_unit || '')}</div>
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