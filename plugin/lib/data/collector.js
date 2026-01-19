/**
 * Collects data from SignalK paths
 */
class DataCollector {
  constructor(app, options) {
    this.app = app;
    this.options = options;
  }

  /**
   * Get value from SignalK path
   * @param {string} path - SignalK path
   * @returns {*} Value or null if not found
   */
  getValue(path) {
    try {
      const value = this.app.getSelfPath(path);
      return value?.value !== undefined ? value.value : null;
    } catch (error) {
      this.app.debug(`Error getting value for path ${path}:`, error.message);
      return null;
    }
  }

  /**
   * Get position data
   * @returns {Object|null} Object with latitude and longitude, or null
   */
  getPosition() {
    const posPath = this.options.positionPath || 'navigation.position';
    const position = this.getValue(posPath);

    if (!position || typeof position !== 'object') {
      return null;
    }

    return {
      latitude: position.latitude || null,
      longitude: position.longitude || null
    };
  }

  /**
   * Convert value based on data type and unit preference
   * @param {number} value - Raw value from SignalK
   * @param {string} path - SignalK path to determine data type
   * @returns {object} Object with converted value and unit label
   */
  convertValueWithUnit(value, path) {
    if (value === null || value === undefined) {
      return { value: null, unit: '' };
    }

    const useMetric = this.options.useMetricUnits || false;

    // Temperature conversion (SignalK uses Kelvin)
    if (path.includes('temperature')) {
      if (useMetric) {
        // Kelvin to Celsius
        return { value: value - 273.15, unit: '°C' };
      } else {
        // Kelvin to Fahrenheit
        return { value: (value - 273.15) * 9/5 + 32, unit: '°F' };
      }
    }

    // Wind speed (SignalK uses m/s)
    if (path.includes('wind') && path.includes('speed')) {
      if (useMetric) {
        // Keep m/s
        return { value: value, unit: 'm/s' };
      } else {
        // m/s to knots
        return { value: value * 1.94384, unit: 'kts' };
      }
    }

    // Wind angle (SignalK uses radians)
    if (path.includes('wind') && (path.includes('angle') || path.includes('direction'))) {
      // Always convert radians to degrees
      const degrees = value * (180 / Math.PI);
      return { value: degrees < 0 ? degrees + 360 : degrees, unit: '°' };
    }

    // Pressure (SignalK uses Pascals)
    if (path.includes('pressure')) {
      if (useMetric) {
        // Pascal to hPa (hectopascal/millibar)
        return { value: value / 100, unit: 'hPa' };
      } else {
        // Pascal to inHg (inches of mercury)
        return { value: value * 0.0002953, unit: 'inHg' };
      }
    }

    // Speed (SignalK uses m/s)
    if (path.includes('speed') && !path.includes('wind')) {
      if (useMetric) {
        // m/s to km/h
        return { value: value * 3.6, unit: 'km/h' };
      } else {
        // m/s to knots
        return { value: value * 1.94384, unit: 'kts' };
      }
    }

    // Distance (SignalK uses meters)
    if (path.includes('distance')) {
      if (useMetric) {
        // meters to kilometers
        return { value: value / 1000, unit: 'km' };
      } else {
        // meters to nautical miles
        return { value: value / 1852, unit: 'nm' };
      }
    }

    // Depth (SignalK uses meters)
    if (path.includes('depth')) {
      if (useMetric) {
        return { value: value, unit: 'm' };
      } else {
        // meters to feet
        return { value: value * 3.28084, unit: 'ft' };
      }
    }

    // Default: no conversion
    return { value: value, unit: '' };
  }

  /**
   * Format value for display
   */
  formatValue(value) {
    if (value === null || value === undefined) {
      return 'N/A';
    }

    if (typeof value === 'number') {
      // Round to 2 decimal places
      return value.toFixed(2);
    }

    return String(value);
  }

  /**
   * Collect all custom data paths
   * @returns {Array} Array of data objects
   */
  collectCustomData() {
    const customPaths = this.options.customDataPaths || [];
    const collectedData = [];

    for (const pathConfig of customPaths) {
      const rawValue = this.getValue(pathConfig.path);
      
      if (rawValue !== null) {
        const converted = this.convertValueWithUnit(rawValue, pathConfig.path);
        
        collectedData.push({
          path: pathConfig.path,
          label: pathConfig.label || pathConfig.path,
          value: this.formatValue(converted.value),
          unit: converted.unit,
          rawValue: converted.value
        });
      }
    }

    return collectedData;
  }

  /**
   * Collect all data for noon report
   * @returns {Object} Complete data package
   */
  collectNoonData() {
    const position = this.getPosition();
    const customData = this.collectCustomData();
    const timestamp = Date.now();

    return {
      timestamp: Math.floor(timestamp / 1000), // Unix timestamp in seconds
      dateStr: new Date(timestamp).toISOString().split('T')[0], // YYYY-MM-DD
      position: position,
      customData: customData
    };
  }

  /**
   * Get human-readable location string (reverse geocoding placeholder)
   * For now, just returns lat/lon formatted
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
}

module.exports = DataCollector;