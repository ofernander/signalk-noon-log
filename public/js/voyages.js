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
                const activeTag = voyage.isActive ? ' <span style="color: #28a745;">(Active)</span>' : '';
                
                html += `
                    <div class="voyage-item${voyage.isActive ? ' active' : ''}" data-voyage-id="${voyage.id}">
                        <div class="voyage-name">${voyage.name}${activeTag}</div>
                        <div class="voyage-stats">
                            ${startDate} • ${voyage.logCount} entries • ${voyage.totalDistance.toFixed(1)} nm
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
                
                <h3>Export Options</h3>
                <div class="voyage-actions">
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
            `;
            
            if (!voyage.isActive) {
                html += `
                    <button class="export-btn delete-voyage-btn" onclick="window.voyageManager.deleteVoyage(${voyageId})">
                        🗑️ Delete Voyage
                        <br><small>Permanently delete all logs from this voyage</small>
                    </button>
                `;
            }
            
            html += `</div>`;
            
            document.getElementById('voyageContent').innerHTML = html;
            
        } catch (error) {
            console.error('Error loading voyage details:', error);
            document.getElementById('voyageContent').innerHTML = '<p>Error loading voyage details</p>';
        }
    }

    // Export voyage
    async exportVoyage(voyageId, format) {
        let url;
        if (format === 'logbook') {
            url = `/plugins/signalk-noon-log/api/voyages/${voyageId}/export-logbook`;
        } else if (format === 'gpx') {
            url = `/plugins/signalk-noon-log/api/voyages/${voyageId}/export-gpx`;
        } else if (format === 'json') {
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
        
        // For logbook and GPX, just open the URL (browser will download)
        window.open(url, '_blank');
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
                this.mainUI.showMessage('success', `Voyage deleted (${result.data.deletedLogs} logs removed)`);
                document.getElementById('voyageModal').style.display = 'none';
                this.loadVoyages();
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