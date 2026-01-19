/**
 * Calculate distance between two positions using Haversine formula
 * Returns distance in nautical miles
 */
class DistanceCalculator {
  constructor(app, storage) {
    this.app = app;
    this.storage = storage;
  }

  /**
   * Calculate distance between two lat/lon points
   * @param {number} lat1 - Latitude of first point
   * @param {number} lon1 - Longitude of first point
   * @param {number} lat2 - Latitude of second point
   * @param {number} lon2 - Longitude of second point
   * @returns {number} Distance in nautical miles
   */
  haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 3440.065; // Earth's radius in nautical miles
    
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Calculate distance since last log entry
   * @param {number} currentLat - Current latitude
   * @param {number} currentLon - Current longitude
   * @returns {number} Distance in nautical miles, or 0 if no previous log
   */
  getDistanceSinceLast(currentLat, currentLon) {
    const lastLog = this.storage.getLastLog();
    
    if (!lastLog || !lastLog.latitude || !lastLog.longitude) {
      return 0;
    }

    return this.haversineDistance(
      lastLog.latitude,
      lastLog.longitude,
      currentLat,
      currentLon
    );
  }

  /**
   * Get total voyage distance from database
   * @returns {number} Total distance in nautical miles
   */
  getTotalVoyageDistance() {
    return this.storage.getVoyageDistance();
  }

  /**
   * Calculate distance data for a new log entry
   * @param {number} currentLat - Current latitude
   * @param {number} currentLon - Current longitude
   * @returns {Object} Object with distanceSinceLast and totalDistance
   */
  calculateDistanceData(currentLat, currentLon) {
    const distanceSinceLast = this.getDistanceSinceLast(currentLat, currentLon);
    const currentTotal = this.getTotalVoyageDistance();
    const totalDistance = currentTotal + distanceSinceLast;

    return {
      distanceSinceLast: Math.round(distanceSinceLast * 10) / 10, // Round to 1 decimal
      totalDistance: Math.round(totalDistance * 10) / 10
    };
  }

  /**
   * Format distance for display
   * @param {number} distance - Distance in nautical miles
   * @returns {string} Formatted distance string
   */
  formatDistance(distance) {
    return `${distance.toFixed(1)} nm`;
  }
}

module.exports = DistanceCalculator;
