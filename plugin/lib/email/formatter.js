/**
 * Formats noon log data into HTML email
 */
class EmailFormatter {
  constructor(app, options) {
    this.app = app;
    this.options = options;
  }

  /**
   * Get vessel name from SignalK
   */
  getVesselName() {
    try {
      // Try multiple paths for vessel name
      let name = this.app.getSelfPath('name');
      
      if (!name) {
        // Try alternative path
        const selfData = this.app.getSelfPath('');
        name = selfData?.name;
      }
      
      if (!name) {
        // Try getting from full vessel object
        name = this.app.getSelf()?.name;
      }
      
      return name || 'Unknown Vessel';
    } catch (error) {
      return 'Unknown Vessel';
    }
  }

  /**
   * Generate clickable map link to Google Maps satellite view
   */
  getMapLink(lat, lon) {
    // Google Maps satellite view with marker
    return `https://www.google.com/maps?q=${lat},${lon}&t=k&z=12`;
  }

  /**
   * Format position string
   */
  formatPosition(lat, lon) {
    if (!lat || !lon) return 'Position unavailable';

    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';

    const latDeg = Math.floor(Math.abs(lat));
    const latMin = ((Math.abs(lat) - latDeg) * 60).toFixed(3);

    const lonDeg = Math.floor(Math.abs(lon));
    const lonMin = ((Math.abs(lon) - lonDeg) * 60).toFixed(3);

    return `${latDeg}°${latMin}'${latDir}, ${lonDeg}°${lonMin}'${lonDir}`;
  }

  /**
   * Generate HTML email body
   */
  generateEmailHTML(logData) {
    const vesselName = this.getVesselName();
    const { position, customData, logText, distance, dateStr } = logData;

    const lat = position?.latitude;
    const lon = position?.longitude;

    let mapLink = null;

    if (lat && lon) {
      mapLink = this.getMapLink(lat, lon);
    }

    const formattedPosition = lat && lon ? this.formatPosition(lat, lon) : 'Position unavailable';

    // Build HTML
    let html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f4f4f4;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 3px solid #2c5282;
      padding-bottom: 15px;
      margin-bottom: 25px;
    }
    h1 {
      color: #2c5282;
      margin: 0 0 5px 0;
      font-size: 28px;
    }
    .date {
      color: #666;
      font-size: 16px;
      margin: 0;
    }
    .section {
      margin-bottom: 25px;
    }
    .section-title {
      color: #2c5282;
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 10px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 5px;
    }
    .log-text {
      background-color: #f7fafc;
      border-left: 4px solid #4299e1;
      padding: 15px;
      border-radius: 4px;
      font-style: italic;
      margin: 10px 0;
    }
    .data-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 15px;
      margin: 15px 0;
    }
    .data-item {
      background-color: #f7fafc;
      padding: 12px;
      border-radius: 4px;
      border: 1px solid #e2e8f0;
    }
    .data-label {
      font-weight: bold;
      color: #4a5568;
      font-size: 12px;
      text-transform: uppercase;
      margin-bottom: 5px;
    }
    .data-value {
      font-size: 20px;
      color: #2d3748;
    }
    .map-container {
      margin: 20px 0;
      text-align: center;
    }
    .map-image {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    .map-link {
      display: inline-block;
      margin-top: 10px;
      color: #4299e1;
      text-decoration: none;
      font-weight: bold;
    }
    .map-link:hover {
      text-decoration: underline;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      text-align: center;
      color: #718096;
      font-size: 12px;
    }
    .position-display {
      font-family: 'Courier New', monospace;
      background-color: #edf2f7;
      padding: 8px 12px;
      border-radius: 4px;
      display: inline-block;
      margin: 5px 0;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${vesselName} - Noon Report</h1>
      <p class="date">${new Date(dateStr).toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}</p>
    </div>
`;

    // Log text section
    if (logText) {
      html += `
    <div class="section">
      <div class="section-title">Captain's Log</div>
      <div class="log-text">${this.escapeHtml(logText)}</div>
    </div>
`;
    }

    // Position section
    html += `
    <div class="section">
      <div class="section-title">Position</div>
      <div class="position-display">${formattedPosition}</div>
`;

    if (mapLink) {
      html += `
      <div class="map-container">
        <a href="${mapLink}" target="_blank" class="map-link">📍 View Position on Google Earth</a>
      </div>
`;
    }

    html += `
    </div>
`;

    // Distance section
    if (distance) {
      html += `
    <div class="section">
      <div class="section-title">Distance</div>
      <div class="data-grid">
        <div class="data-item">
          <div class="data-label">Since Last Report</div>
          <div class="data-value">${distance.distanceSinceLast.toFixed(1)} nm</div>
        </div>
        <div class="data-item">
          <div class="data-label">Total Voyage</div>
          <div class="data-value">${distance.totalDistance.toFixed(1)} nm</div>
        </div>
      </div>
    </div>
`;
    }

    // Weather/Environmental data section
    if (customData && customData.length > 0) {
      html += `
    <div class="section">
      <div class="section-title">Conditions</div>
      <div class="data-grid">
`;

      for (const data of customData) {
        html += `
        <div class="data-item">
          <div class="data-label">${this.escapeHtml(data.label)}</div>
          <div class="data-value">${this.escapeHtml(data.value)}${data.unit ? ' ' + this.escapeHtml(data.unit) : ''}</div>
        </div>
`;
      }

      html += `
      </div>
    </div>
`;
    }

    // Footer
    html += `
    <div class="footer">
      Generated by SignalK Noon Log Plugin
    </div>
  </div>
</body>
</html>
`;

    return html;
  }

  /**
   * Generate plain text email (fallback)
   */
  generateEmailText(logData) {
    const vesselName = this.getVesselName();
    const { position, customData, logText, distance, dateStr } = logData;

    const lat = position?.latitude;
    const lon = position?.longitude;
    const formattedPosition = lat && lon ? this.formatPosition(lat, lon) : 'Position unavailable';

    let text = `${vesselName} - NOON REPORT\n`;
    text += `${new Date(dateStr).toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    })}\n`;
    text += `${'='.repeat(50)}\n\n`;

    if (logText) {
      text += `CAPTAIN'S LOG:\n${logText}\n\n`;
    }

    text += `POSITION:\n${formattedPosition}\n`;
    if (lat && lon) {
      text += `Coordinates: ${lat.toFixed(6)}, ${lon.toFixed(6)}\n`;
      text += `Map: ${this.getMapLink(lat, lon)}\n`;
    }
    text += `\n`;

    if (distance) {
      text += `DISTANCE:\n`;
      text += `Since Last Report: ${distance.distanceSinceLast.toFixed(1)} nm\n`;
      text += `Total Voyage: ${distance.totalDistance.toFixed(1)} nm\n\n`;
    }

    if (customData && customData.length > 0) {
      text += `CONDITIONS:\n`;
      for (const data of customData) {
        text += `${data.label}: ${data.value}${data.unit ? ' ' + data.unit : ''}\n`;
      }
    }

    text += `\n${'='.repeat(50)}\n`;
    text += `Generated by SignalK Noon Log Plugin\n`;

    return text;
  }

  /**
   * Escape HTML entities
   */
  escapeHtml(text) {
    if (!text) return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
  }
}

module.exports = EmailFormatter;