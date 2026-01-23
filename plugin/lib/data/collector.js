/**
 * Collects data from SignalK paths
 */

// FIX #9: Define conversion constants at top of file
const CONVERSIONS = {
  KELVIN_TO_CELSIUS: 273.15,
  CELSIUS_TO_FAHRENHEIT_MULT: 9 / 5,
  CELSIUS_TO_FAHRENHEIT_ADD: 32,
  MS_TO_KNOTS: 1.94384,
  MS_TO_KMH: 3.6,
  PASCAL_TO_HPA: 0.01,
  PASCAL_TO_INHG: 0.0002953,
  METERS_TO_FEET: 3.28084,
  METERS_TO_KM: 0.001,
  METERS_TO_NM: 1 / 1852,
  RADIANS_TO_DEGREES: 180 / Math.PI,
  MINUTES_PER_DEGREE: 60
};

// FIX #13: Date/time helper functions
const DateHelpers = {
  /**
   * Convert JavaScript timestamp (ms) to Unix timestamp (seconds)
   */
  toUnixTimestamp(date) {
    return Math.floor(date.getTime() / 1000);
  },

  /**
   * Convert Unix timestamp (seconds) to JavaScript Date
   */
  fromUnixTimestamp(unix) {
    return new Date(unix * 1000);
  },

  /**
   * Get current Unix timestamp in seconds
   */
  nowUnix() {
    return Math.floor(Date.now() / 1000);
  },

  /**
   * Format date as YYYY-MM-DD
   */
  formatDateString(date) {
    return date.toISOString().split('T')[0];
  }
};

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
      // FIX #8: Better error handling with context
      this.app.debug(`Error getting value for path ${path}: ${error.message}`);
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
        return { 
          value: value - CONVERSIONS.KELVIN_TO_CELSIUS, 
          unit: '°C' 
        };
      } else {
        // Kelvin to Fahrenheit
        const celsius = value - CONVERSIONS.KELVIN_TO_CELSIUS;
        return { 
          value: celsius * CONVERSIONS.CELSIUS_TO_FAHRENHEIT_MULT + CONVERSIONS.CELSIUS_TO_FAHRENHEIT_ADD, 
          unit: '°F' 
        };
      }
    }

    // Wind speed (SignalK uses m/s)
    if (path.includes('wind') && path.includes('speed')) {
      if (useMetric) {
        // Keep m/s
        return { value: value, unit: 'm/s' };
      } else {
        // m/s to knots
        return { 
          value: value * CONVERSIONS.MS_TO_KNOTS, 
          unit: 'kts' 
        };
      }
    }

    // Wind angle (SignalK uses radians)
    if (path.includes('wind') && (path.includes('angle') || path.includes('direction'))) {
      // Always convert radians to degrees
      const degrees = value * CONVERSIONS.RADIANS_TO_DEGREES;
      return { 
        value: degrees < 0 ? degrees + 360 : degrees, 
        unit: '°' 
      };
    }

    // Pressure (SignalK uses Pascals)
    if (path.includes('pressure')) {
      if (useMetric) {
        // Pascal to hPa (hectopascal/millibar)
        return { 
          value: value * CONVERSIONS.PASCAL_TO_HPA, 
          unit: 'hPa' 
        };
      } else {
        // Pascal to inHg (inches of mercury)
        return { 
          value: value * CONVERSIONS.PASCAL_TO_INHG, 
          unit: 'inHg' 
        };
      }
    }

    // Speed (SignalK uses m/s)
    if (path.includes('speed') && !path.includes('wind')) {
      if (useMetric) {
        // m/s to km/h
        return { 
          value: value * CONVERSIONS.MS_TO_KMH, 
          unit: 'km/h' 
        };
      } else {
        // m/s to knots
        return { 
          value: value * CONVERSIONS.MS_TO_KNOTS, 
          unit: 'kts' 
        };
      }
    }

    // Distance (SignalK uses meters)
    if (path.includes('distance')) {
      if (useMetric) {
        // meters to kilometers
        return { 
          value: value * CONVERSIONS.METERS_TO_KM, 
          unit: 'km' 
        };
      } else {
        // meters to nautical miles
        return { 
          value: value * CONVERSIONS.METERS_TO_NM, 
          unit: 'nm' 
        };
      }
    }

    // Depth (SignalK uses meters)
    if (path.includes('depth')) {
      if (useMetric) {
        return { value: value, unit: 'm' };
      } else {
        // meters to feet
        return { 
          value: value * CONVERSIONS.METERS_TO_FEET, 
          unit: 'ft' 
        };
      }
    }

    // Battery State of Charge (SignalK uses ratio 0-1)
    if (path.includes('stateOfCharge') || path.includes('soc')) {
      // Convert ratio to percentage
      return { 
        value: value * 100, 
        unit: '%' 
      };
    }

    // Battery Voltage (SignalK uses volts)
    if (path.includes('voltage') || (path.includes('electrical') && path.includes('batteries'))) {
      // Auto-detect if this looks like a percentage (0-1 range)
      if (value >= 0 && value <= 1) {
        // Likely a state of charge ratio, convert to percentage
        return { 
          value: value * 100, 
          unit: '%' 
        };
      }
      // Otherwise treat as voltage
      return { 
        value: value, 
        unit: 'V' 
      };
    }

    // Default: no conversion
    return { value: value, unit: '' };
  }

  /**
   * Format value for display
   * @param {*} value - Value to format
   * @returns {string} Formatted value
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
      try {
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
      } catch (error) {
        // FIX #8: Better error handling - continue collecting other data
        this.app.error(`Error collecting data for ${pathConfig.path}: ${error.message}`);
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
    const now = Date.now();

    // FIX #13: Use date helper functions for consistency
    return {
      timestamp: DateHelpers.toUnixTimestamp(new Date(now)),
      dateStr: DateHelpers.formatDateString(new Date(now)),
      position: position,
      customData: customData
    };
  }

  /**
   * FIX #12: Actually use the formatPosition method or remove it
   * Get human-readable location string
   * @param {number} lat - Latitude
   * @param {number} lon - Longitude
   * @returns {string} Formatted position string
   */
  formatPosition(lat, lon) {
    if (!lat || !lon) return 'Position unavailable';

    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';

    const latDeg = Math.floor(Math.abs(lat));
    const latMin = ((Math.abs(lat) - latDeg) * CONVERSIONS.MINUTES_PER_DEGREE).toFixed(3);

    const lonDeg = Math.floor(Math.abs(lon));
    const lonMin = ((Math.abs(lon) - lonDeg) * CONVERSIONS.MINUTES_PER_DEGREE).toFixed(3);

    return `${latDeg}°${latMin}'${latDir}, ${lonDeg}°${lonMin}'${lonDir}`;
  }
}

// Export helpers for use in other modules
DataCollector.DateHelpers = DateHelpers;
DataCollector.CONVERSIONS = CONVERSIONS;

module.exports = DataCollector;