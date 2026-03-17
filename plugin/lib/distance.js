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
   * Calculate distance since last noon report using position track
   * Sums position track segments after the last noon report timestamp
   * @returns {number} Distance in nautical miles
   */
  getDistanceSinceLast() {
    const lastReport = this.storage.getLastLog(); // now returns only noon reports
    const voyage = this.storage.getActiveVoyage();
    if (!voyage) return 0;

    // If no previous noon report, use voyage start
    const sinceTimestamp = lastReport ? lastReport.timestamp : voyage.start_timestamp;
    return this.storage.getDistanceSinceTimestamp(voyage.id, sinceTimestamp);
  }

  /**
   * Calculate distance sailed in the last 24 hours using position track
   * @returns {number} Distance in nautical miles
   */
  getDistance24h() {
    const voyage = this.storage.getActiveVoyage();
    if (!voyage) return 0;
    const since24h = Math.floor(Date.now() / 1000) - 86400;
    return this.storage.getDistanceSinceTimestamp(voyage.id, since24h);
  }

  /**
   * Get total voyage distance from position track
   * @returns {number} Total distance in nautical miles
   */
  getTotalVoyageDistance() {
    return this.storage.getVoyageDistance();
  }

  /**
   * Calculate all distance data for a noon report
   * @returns {Object} Object with distanceSinceLast, distance24h, and totalDistance
   */
  calculateDistanceData() {
    const distanceSinceLast = this.getDistanceSinceLast();
    const distance24h = this.getDistance24h();
    const totalDistance = this.getTotalVoyageDistance();

    return {
      distanceSinceLast: Math.round(distanceSinceLast * 10) / 10,
      distance24h: Math.round(distance24h * 10) / 10,
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
