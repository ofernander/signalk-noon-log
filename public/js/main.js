/**
 * SignalK Noon Log - Main Entry Point
 * 
 * Coordinates between WebSocket manager and UI controller
 * Holds application state
 */
class NoonLogUI {
    constructor() {
        // Application state
        this.state = {
            connected: false,
            timeUntilNoon: null,
            lastLog: null,
            totalDistance: 0,
            distance24h: 0,
            reportsSent: 0,
            voyageName: '--',
            pendingLog: false,  // Boolean flag: true if log pending, false if none
            positionsTracked: 0  // Count of positions tracked for current voyage
        };

        // Component instances (will be initialized in init())
        this.ws = null;
        this.ui = null;

        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        // Initialize UI controller
        this.ui = new UIController(this);

        // Initialize WebSocket manager
        this.ws = new WebSocketManager(this);

        // Setup event listeners
        this.ui.setupEventListeners();

        // Connect to WebSocket
        this.ws.connect();

        // Load initial data
        this.loadInitialData();

        // Initial UI update
        this.ui.updateUI();
    }

    /**
     * Load initial voyage data from API
     */
    async loadInitialData() {
        try {
            const response = await fetch('/plugins/signalk-noon-log/api/voyage');
            const result = await response.json();

            if (result.success && result.data) {
                this.state.voyageName = result.data.id ? result.data.name : '--';
                this.ui.updateUI();
            }
        } catch (error) {
            console.error('Failed to load initial voyage data:', error);
        }

        // Load email recipients
        if (this.ui.loadEmailRecipients) {
            this.ui.loadEmailRecipients();
        }

        // Setup email form handler
        if (this.ui.setupEmailFormHandler) {
            this.ui.setupEmailFormHandler();
        }

        // Setup log viewer
        if (this.ui.setupLogViewer) {
            this.ui.setupLogViewer();
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Apply night mode BEFORE initializing UI so first render uses correct colors
    const nightToggle = document.getElementById('nightModeToggle');
    const logoImg = document.querySelector('header h1 img');
    const iconBase = './assets/icons/signalk-noon-log-icon_72x72';

    if (localStorage.getItem('nightMode') === 'true') {
        document.body.classList.add('night-mode');
        nightToggle.checked = true;
        logoImg.src = `${iconBase}_dark.png`;
        logoImg.style.display = 'none';
    }

    window.noonLogUI = new NoonLogUI();

    nightToggle.addEventListener('change', () => {
        document.body.classList.toggle('night-mode', nightToggle.checked);
        localStorage.setItem('nightMode', nightToggle.checked);
        logoImg.src = nightToggle.checked ? `${iconBase}_dark.png` : `${iconBase}.png`;
        logoImg.style.display = nightToggle.checked ? 'none' : 'inline';
        // No need to re-render — all colors now use CSS variables
    });
    
    // Initialize voyage manager with a slight delay to ensure it's loaded
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