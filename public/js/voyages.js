// Voyage Management Module

class VoyageManager {
    constructor(mainUI) {
        this.mainUI = mainUI;
    }

    // Load and display voyages list
    async loadVoyages() {
        try {
            const response = await fetch('/plugins/signalk-noon-log/api/voyages');
            const result = await response.json();
            
            if (!result.success) {
                document.getElementById('voyagesList').innerHTML = '<p class="empty-state">Failed to load voyages</p>';
                return;
            }
            
            const voyages = result.data;
            
            if (voyages.length === 0) {
                document.getElementById('voyagesList').innerHTML = '<p class="empty-state">No voyages yet</p>';
                return;
            }
            
            let html = '';
            voyages.forEach(voyage => {
                const startDate = new Date(voyage.startTimestamp * 1000).toLocaleDateString();
                const activeTag = voyage.isActive ? ' <span class="voyage-active-tag">(Active)</span>' : '';
                
                html += `
                    <div class="voyage-item${voyage.isActive ? ' active' : ''}" data-voyage-id="${voyage.id}">
                        <div class="voyage-item-main">
                            <div>
                                <div class="voyage-name">${voyage.name}${activeTag}</div>
                                <div class="voyage-stats">
                                    ${startDate} • ${voyage.logCount} entries • ${voyage.totalDistance.toFixed(1)} nm
                                </div>
                            </div>
                            ${voyage.isActive ? `
                            <button class="btn-end-voyage-inline" data-voyage-id="${voyage.id}" title="End Voyage">
                                End
                            </button>` : ''}
                        </div>
                    </div>
                `;
            });
            
            document.getElementById('voyagesList').innerHTML = html;
            
            // Add click handlers
            document.querySelectorAll('.voyage-item').forEach(item => {
                item.addEventListener('click', () => {
                    const voyageId = parseInt(item.dataset.voyageId);
                    this.showVoyageDetails(voyageId);
                });
            });

            // Add end voyage button handlers
            document.querySelectorAll('.btn-end-voyage-inline').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const voyageId = parseInt(btn.dataset.voyageId);
                    this.endVoyage(voyageId);
                });
            });
            
        } catch (error) {
            console.error('Error loading voyages:', error);
            document.getElementById('voyagesList').innerHTML = '<p class="empty-state">Error loading voyages</p>';
        }
    }

    // Show voyage details modal
    async showVoyageDetails(voyageId) {
        document.getElementById('voyageModal').style.display = 'flex';
        document.getElementById('voyageContent').innerHTML = '<div class="loading">Loading...</div>';
        
        try {
            const response = await fetch(`/plugins/signalk-noon-log/api/voyages/${voyageId}`);
            const result = await response.json();
            
            if (!result.success) {
                document.getElementById('voyageContent').innerHTML = '<p>Error loading voyage details</p>';
                return;
            }
            
            const { voyage, logs } = result.data;
            const startDate = new Date(voyage.startTimestamp * 1000);
            const lastDate = voyage.lastEntryTimestamp ? new Date(voyage.lastEntryTimestamp * 1000) : null;
            const duration = lastDate ? Math.ceil((lastDate - startDate) / (1000 * 60 * 60 * 24)) : 0;
            
            document.getElementById('voyageModalTitle').innerHTML = `
                <span onclick="window.voyageManager.renameVoyage(${voyageId}, '${voyage.name.replace(/'/g, "\\'")}')" 
                      style="cursor: pointer; border-bottom: 1px dashed #999;" 
                      title="Click to rename">
                    ${voyage.name}
                </span>
            `;
            
            // Stats grid
            let html = `
                <div class="info-grid" style="margin-bottom: 20px;">
                    <div class="info-item">
                        <div class="info-label">Started</div>
                        <div class="info-value">${startDate.toLocaleDateString()}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Last Entry</div>
                        <div class="info-value">${lastDate ? lastDate.toLocaleDateString() : '--'}</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Duration</div>
                        <div class="info-value">${duration} days</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Total Distance</div>
                        <div class="info-value">${voyage.totalDistance.toFixed(1)} nm</div>
                    </div>
                    <div class="info-item">
                        <div class="info-label">Log Entries</div>
                        <div class="info-value">${voyage.logCount}</div>
                    </div>
                </div>
            `;

            // Log entries section
            const logsWithText = logs ? logs.filter(log => log.log_text && log.log_text.trim()) : [];
            html += `<h3 style="margin: 0 0 12px 0;">Log Entries</h3>`;
            if (logsWithText.length === 0) {
                html += `<p class="empty-state">No log entries for this voyage</p>`;
            } else {
                html += `<div style="display: flex; flex-direction: column; gap: 8px; max-height: 300px; overflow-y: auto; margin-bottom: 20px;">`;
                logsWithText.forEach(log => {
                    const d = new Date(log.timestamp * 1000);
                    const dateStr = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                    const timeStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                    const posStr = log.latitude && log.longitude
                        ? `${Math.abs(log.latitude).toFixed(4)}° ${log.latitude >= 0 ? 'N' : 'S'}, ${Math.abs(log.longitude).toFixed(4)}° ${log.longitude >= 0 ? 'E' : 'W'}`
                        : '';
                    html += `
                        <div class="log-data-item">
                            <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
                                <span class="log-data-label">${dateStr} &nbsp; ${timeStr}</span>
                                ${posStr ? `<span class="log-data-label">${posStr}</span>` : ''}
                            </div>
                            <div class="log-data-value" style="white-space: pre-wrap; font-size: 0.9rem; font-weight: normal;">${this.escapeHtml(log.log_text)}</div>
                        </div>
                    `;
                });
                html += `</div>`;
            }

            // Export section — 3 buttons inline, delete full width below
            html += `
                <h3 style="margin: 0 0 12px 0;">Export</h3>
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                    <button class="export-btn" onclick="window.voyageManager.exportVoyage(${voyageId}, 'logbook')">
                        📄 Logbook (Text)
                        <br><small>Written logs + weather data</small>
                    </button>
                    <button class="export-btn" onclick="window.voyageManager.exportVoyage(${voyageId}, 'gpx')">
                        📍 Track (GPX)
                        <br><small>Position points for navigation apps</small>
                    </button>
                    <button class="export-btn" onclick="window.voyageManager.exportVoyage(${voyageId}, 'json')">
                        📦 Complete Export (JSON)
                        <br><small>All data - backup</small>
                    </button>
                </div>
                ${voyage.isActive ? `
                <button class="export-btn" style="width: 100%; margin-bottom: 10px; background: var(--warning, #b45309); color: white;" onclick="window.voyageManager.endVoyage(${voyageId})">
                    🏁 End Voyage
                    <br><small>Close this voyage — logging stops until a new voyage is started</small>
                </button>` : ''}
                <button class="export-btn delete-voyage-btn" style="width: 100%;" onclick="window.voyageManager.deleteVoyage(${voyageId})">
                    🗑️ Delete Voyage
                    <br><small>Permanently delete all logs from this voyage</small>
                </button>
            `;

            document.getElementById('voyageContent').innerHTML = html;
            
        } catch (error) {
            console.error('Error loading voyage details:', error);
            document.getElementById('voyageContent').innerHTML = '<p>Error loading voyage details</p>';
        }
    }

    // Export voyage
    async exportVoyage(voyageId, format) {
        if (format === 'json') {
            // Get voyage data and download as JSON
            try {
                const response = await fetch(`/plugins/signalk-noon-log/api/voyages/${voyageId}`);
                const result = await response.json();
                const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `${result.data.voyage.name.replace(/[^a-z0-9]/gi, '_')}.json`;
                a.click();
                URL.revokeObjectURL(downloadUrl);
                return;
            } catch (error) {
                this.mainUI.showMessage('error', `Export failed: ${error.message}`);
                return;
            }
        }

        // For logbook and GPX, fetch as blob - same pattern as JSON export
        try {
            const isGpx = format === 'gpx';
            const url = isGpx
                ? `/plugins/signalk-noon-log/api/voyages/${voyageId}/export-gpx`
                : `/plugins/signalk-noon-log/api/voyages/${voyageId}/export-logbook`;
            const extension = isGpx ? 'gpx' : 'txt';

            const response = await fetch(url);
            const blob = await response.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = `voyage_${voyageId}.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);
        } catch (error) {
            this.mainUI.showMessage('error', `Export failed: ${error.message}`);
        }
    }

    // Delete voyage
    async deleteVoyage(voyageId) {
        if (!confirm('Are you sure you want to delete this voyage and all its logs? This cannot be undone.')) {
            return;
        }
        
        try {
            const response = await fetch(`/plugins/signalk-noon-log/api/voyages/${voyageId}`, {
                method: 'DELETE'
            });
            
            const result = await response.json();
            
            if (result.success) {
                document.getElementById('voyageModal').style.display = 'none';
                this.loadVoyages();
                this.mainUI.ui?.loadVoyageLogs();
            } else {
                this.mainUI.showMessage('error', `Error: ${result.error}`);
            }
        } catch (error) {
            this.mainUI.showMessage('error', `Error: ${error.message}`);
        }
    }

    // End voyage without starting a new one
    async endVoyage(voyageId) {
        if (!confirm('End this voyage? Logging will stop until a new voyage is started.')) return;
        try {
            const response = await fetch('/plugins/signalk-noon-log/api/endVoyage', { method: 'POST' });
            const result = await response.json();
            if (result.success) {
                document.getElementById('voyageModal').style.display = 'none';
                this.loadVoyages();
                this.mainUI.ui?.loadVoyageLogs();
                this.mainUI.showMessage('success', 'Voyage ended');
            } else {
                this.mainUI.showMessage('error', `Error: ${result.error}`);
            }
        } catch (error) {
            this.mainUI.showMessage('error', `Error: ${error.message}`);
        }
    }

    // Rename voyage
    async renameVoyage(voyageId, currentName) {
        const newName = prompt('Enter new voyage name:', currentName);
        
        if (!newName || newName === currentName) {
            return;
        }
        
        try {
            const response = await fetch(`/plugins/signalk-noon-log/api/voyages/${voyageId}/rename`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            
            const result = await response.json();
            
            if (result.success) {
                this.mainUI.showMessage('success', 'Voyage renamed');
                // Refresh the modal and list
                this.showVoyageDetails(voyageId);
                this.loadVoyages();
            } else {
                this.mainUI.showMessage('error', `Error: ${result.error}`);
            }
        } catch (error) {
            this.mainUI.showMessage('error', `Error: ${error.message}`);
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Initialize voyage modal handlers
    initializeModalHandlers() {
        document.getElementById('closeVoyageBtn')?.addEventListener('click', () => {
            document.getElementById('voyageModal').style.display = 'none';
        });
        
        document.getElementById('voyageModal')?.addEventListener('click', (e) => {
            if (e.target.id === 'voyageModal') {
                document.getElementById('voyageModal').style.display = 'none';
            }
        });
    }
}