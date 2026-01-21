import { logger } from '../utils/logger';
import { SatelliteService } from './SatelliteService';
import { WeatherService } from './WeatherService';
import { IrrigationService, SoilData } from './IrrigationService';
import { CropType, GrowthStage } from '../models/types';

export interface Alert {
  id: string;
  fieldId: string;
  type: 'ndvi_decline' | 'soil_moisture_critical' | 'irrigation_needed' | 'weather_warning' | 'pest_risk';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  data?: any; // Additional alert-specific data
  expiresAt?: Date;
}

export interface AlertConfiguration {
  ndviDeclineThreshold: number; // Percentage decline over 7 days
  ndviDeclineDays: number; // Days to check for decline
  soilMoistureCriticalLevel: number; // Percentage of AWC
  temperatureWarningThreshold: number; // °C
  humidityWarningThreshold: number; // %
  windSpeedWarningThreshold: number; // m/s
  enabledAlertTypes: string[];
}

export interface AlertStatistics {
  totalAlerts: number;
  activeAlerts: number;
  acknowledgedAlerts: number;
  alertsByUrgency: Record<string, number>;
  alertsByType: Record<string, number>;
  averageResponseTime: number; // hours
}

export class AlertService {
  private alerts: Map<string, Alert> = new Map();
  private satelliteService: SatelliteService;
  private weatherService: WeatherService;
  private irrigationService: IrrigationService;
  private configuration: AlertConfiguration;

  constructor() {
    this.satelliteService = new SatelliteService();
    this.weatherService = new WeatherService();
    this.irrigationService = new IrrigationService();
    this.configuration = this.getDefaultConfiguration();
  }

  /**
   * Generate alerts for a field based on current conditions
   */
  async generateAlerts(
    fieldId: string,
    cropType: CropType,
    growthStage: GrowthStage,
    soilData: SoilData,
    latitude: number,
    longitude: number
  ): Promise<Alert[]> {
    const generatedAlerts: Alert[] = [];

    try {
      // Check NDVI decline
      if (this.configuration.enabledAlertTypes.includes('ndvi_decline')) {
        const ndviAlert = await this.checkNDVIDecline(fieldId);
        if (ndviAlert) generatedAlerts.push(ndviAlert);
      }

      // Check soil moisture critical level
      if (this.configuration.enabledAlertTypes.includes('soil_moisture_critical')) {
        const soilAlert = this.checkSoilMoistureCritical(fieldId, soilData);
        if (soilAlert) generatedAlerts.push(soilAlert);
      }

      // Check irrigation needs
      if (this.configuration.enabledAlertTypes.includes('irrigation_needed')) {
        const irrigationAlert = await this.checkIrrigationNeeded(
          fieldId, cropType, growthStage, soilData, latitude, longitude
        );
        if (irrigationAlert) generatedAlerts.push(irrigationAlert);
      }

      // Check weather warnings
      if (this.configuration.enabledAlertTypes.includes('weather_warning')) {
        const weatherAlert = await this.checkWeatherWarnings(fieldId, latitude, longitude);
        if (weatherAlert) generatedAlerts.push(weatherAlert);
      }

      // Store generated alerts
      generatedAlerts.forEach(alert => {
        this.alerts.set(alert.id, alert);
      });

      logger.info('Generated alerts for field', {
        fieldId,
        alertCount: generatedAlerts.length,
        alertTypes: generatedAlerts.map(a => a.type)
      });

      return generatedAlerts;

    } catch (error) {
      logger.error('Failed to generate alerts', { fieldId, error });
      return [];
    }
  }

  /**
   * Check for NDVI decline over specified period
   */
  private async checkNDVIDecline(fieldId: string): Promise<Alert | null> {
    try {
      // Get recent satellite observations
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - this.configuration.ndviDeclineDays);

      const observations = await this.satelliteService.getObservations(
        parseInt(fieldId),
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      if (observations.length < 2) {
        return null; // Need at least 2 observations to detect decline
      }

      // Sort by date
      observations.sort((a: any, b: any) => new Date(a.observationDate).getTime() - new Date(b.observationDate).getTime());

      const latestNDVI = observations[observations.length - 1].ndvi;
      const earliestNDVI = observations[0].ndvi;

      // Calculate percentage decline
      const decline = ((earliestNDVI - latestNDVI) / earliestNDVI) * 100;

      if (decline >= this.configuration.ndviDeclineThreshold) {
        const urgency = this.determineNDVIDeclineUrgency(decline);

        return {
          id: this.generateAlertId(),
          fieldId,
          type: 'ndvi_decline',
          urgency,
          title: 'Vegetation Health Decline Detected',
          message: `NDVI has declined by ${decline.toFixed(1)}% over the past ${this.configuration.ndviDeclineDays} days. ` +
            `Current NDVI: ${latestNDVI.toFixed(3)}, Previous: ${earliestNDVI.toFixed(3)}. ` +
            `This may indicate crop stress, disease, or pest issues requiring immediate attention.`,
          timestamp: new Date(),
          acknowledged: false,
          data: {
            decline,
            currentNDVI: latestNDVI,
            previousNDVI: earliestNDVI,
            observationCount: observations.length
          }
        };
      }

      return null;

    } catch (error) {
      logger.error('Failed to check NDVI decline', { fieldId, error });
      return null;
    }
  }

  /**
   * Check for critical soil moisture levels
   */
  private checkSoilMoistureCritical(fieldId: string, soilData: SoilData): Alert | null {
    const availableWaterCapacity = soilData.fieldCapacity - soilData.wiltingPoint;
    const currentWaterLevel = ((soilData.currentMoisture - soilData.wiltingPoint) / availableWaterCapacity) * 100;

    if (currentWaterLevel <= this.configuration.soilMoistureCriticalLevel) {
      const urgency = this.determineSoilMoistureUrgency(currentWaterLevel);

      return {
        id: this.generateAlertId(),
        fieldId,
        type: 'soil_moisture_critical',
        urgency,
        title: 'Critical Soil Moisture Level',
        message: `Soil moisture is critically low at ${currentWaterLevel.toFixed(1)}% of available water capacity. ` +
          `Current moisture: ${soilData.currentMoisture.toFixed(1)}mm, ` +
          `Field capacity: ${soilData.fieldCapacity.toFixed(1)}mm. ` +
          `Immediate irrigation is required to prevent crop stress and yield loss.`,
        timestamp: new Date(),
        acknowledged: false,
        data: {
          currentWaterLevel,
          currentMoisture: soilData.currentMoisture,
          fieldCapacity: soilData.fieldCapacity,
          wiltingPoint: soilData.wiltingPoint
        }
      };
    }

    return null;
  }

  /**
   * Check if irrigation is needed and create alert
   */
  private async checkIrrigationNeeded(
    fieldId: string,
    cropType: CropType,
    growthStage: GrowthStage,
    soilData: SoilData,
    latitude: number,
    longitude: number
  ): Promise<Alert | null> {
    try {
      const recommendation = await this.irrigationService.generateRecommendation(
        fieldId, cropType, growthStage, soilData, latitude, longitude
      );

      if (recommendation.shouldIrrigate) {
        return {
          id: this.generateAlertId(),
          fieldId,
          type: 'irrigation_needed',
          urgency: recommendation.urgency,
          title: 'Irrigation Recommended',
          message: `${recommendation.reasoning} Recommended water amount: ${recommendation.waterAmount.toFixed(1)}mm.`,
          timestamp: new Date(),
          acknowledged: false,
          data: {
            waterAmount: recommendation.waterAmount,
            currentWaterLevel: recommendation.currentWaterLevel,
            cropWaterRequirement: recommendation.cropWaterRequirement,
            nextCheckDate: recommendation.nextCheckDate
          }
        };
      }

      return null;

    } catch (error) {
      logger.error('Failed to check irrigation needs', { fieldId, error });
      return null;
    }
  }

  /**
   * Check for weather warnings
   */
  private async checkWeatherWarnings(fieldId: string, latitude: number, longitude: number): Promise<Alert | null> {
    try {
      const weather = await this.weatherService.getCurrentWeather(latitude, longitude);
      const warnings: string[] = [];

      if (weather.temperature > this.configuration.temperatureWarningThreshold) {
        warnings.push(`High temperature: ${weather.temperature.toFixed(1)}°C`);
      }

      if (weather.humidity < this.configuration.humidityWarningThreshold) {
        warnings.push(`Low humidity: ${weather.humidity.toFixed(1)}%`);
      }

      if (weather.windSpeed > this.configuration.windSpeedWarningThreshold) {
        warnings.push(`High wind speed: ${weather.windSpeed.toFixed(1)} m/s`);
      }

      if (warnings.length > 0) {
        const urgency = this.determineWeatherUrgency(weather);

        return {
          id: this.generateAlertId(),
          fieldId,
          type: 'weather_warning',
          urgency,
          title: 'Weather Warning',
          message: `Adverse weather conditions detected: ${warnings.join(', ')}. ` +
            `Monitor crops closely and consider protective measures if conditions persist.`,
          timestamp: new Date(),
          acknowledged: false,
          data: {
            temperature: weather.temperature,
            humidity: weather.humidity,
            windSpeed: weather.windSpeed,
            warnings
          }
        };
      }

      return null;

    } catch (error) {
      logger.error('Failed to check weather warnings', { fieldId, error });
      return null;
    }
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    if (acknowledgedBy) {
      alert.acknowledgedBy = acknowledgedBy;
    }

    this.alerts.set(alertId, alert);

    logger.info('Alert acknowledged', { alertId, acknowledgedBy });
    return true;
  }

  /**
   * Get all alerts for a field
   */
  getFieldAlerts(fieldId: string, includeAcknowledged: boolean = true): Alert[] {
    const fieldAlerts = Array.from(this.alerts.values())
      .filter(alert => alert.fieldId === fieldId);

    if (!includeAcknowledged) {
      return fieldAlerts.filter(alert => !alert.acknowledged);
    }

    return fieldAlerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get all active (unacknowledged) alerts
   */
  getActiveAlerts(): Alert[] {
    return Array.from(this.alerts.values())
      .filter(alert => !alert.acknowledged)
      .sort((a, b) => {
        // Sort by urgency first, then by timestamp
        const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 };
        const urgencyDiff = urgencyOrder[b.urgency] - urgencyOrder[a.urgency];
        if (urgencyDiff !== 0) return urgencyDiff;
        return b.timestamp.getTime() - a.timestamp.getTime();
      });
  }

  /**
   * Get alert statistics
   */
  getAlertStatistics(): AlertStatistics {
    const allAlerts = Array.from(this.alerts.values());
    const activeAlerts = allAlerts.filter(alert => !alert.acknowledged);
    const acknowledgedAlerts = allAlerts.filter(alert => alert.acknowledged);

    const alertsByUrgency = allAlerts.reduce((acc, alert) => {
      acc[alert.urgency] = (acc[alert.urgency] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const alertsByType = allAlerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate average response time for acknowledged alerts
    const responseTimes = acknowledgedAlerts
      .filter(alert => alert.acknowledgedAt)
      .map(alert => {
        const responseTime = alert.acknowledgedAt!.getTime() - alert.timestamp.getTime();
        return responseTime / (1000 * 60 * 60); // Convert to hours
      });

    const averageResponseTime = responseTimes.length > 0
      ? responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length
      : 0;

    return {
      totalAlerts: allAlerts.length,
      activeAlerts: activeAlerts.length,
      acknowledgedAlerts: acknowledgedAlerts.length,
      alertsByUrgency,
      alertsByType,
      averageResponseTime
    };
  }

  /**
   * Update alert configuration
   */
  updateConfiguration(config: Partial<AlertConfiguration>): void {
    this.configuration = { ...this.configuration, ...config };
    logger.info('Alert configuration updated', { config });
  }

  /**
   * Get current configuration
   */
  getConfiguration(): AlertConfiguration {
    return { ...this.configuration };
  }

  /**
   * Clear expired alerts
   */
  clearExpiredAlerts(): number {
    const now = new Date();
    let clearedCount = 0;

    for (const [id, alert] of this.alerts.entries()) {
      if (alert.expiresAt && alert.expiresAt < now) {
        this.alerts.delete(id);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      logger.info('Cleared expired alerts', { count: clearedCount });
    }

    return clearedCount;
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get default alert configuration
   */
  private getDefaultConfiguration(): AlertConfiguration {
    return {
      ndviDeclineThreshold: 15, // 15% decline
      ndviDeclineDays: 7, // Over 7 days
      soilMoistureCriticalLevel: 20, // 20% of AWC
      temperatureWarningThreshold: 35, // 35°C
      humidityWarningThreshold: 30, // 30%
      windSpeedWarningThreshold: 15, // 15 m/s
      enabledAlertTypes: [
        'ndvi_decline',
        'soil_moisture_critical',
        'irrigation_needed',
        'weather_warning'
      ]
    };
  }

  /**
   * Determine urgency level for NDVI decline
   */
  private determineNDVIDeclineUrgency(decline: number): 'low' | 'medium' | 'high' | 'critical' {
    if (decline >= 30) return 'critical';
    if (decline >= 25) return 'high';
    if (decline >= 20) return 'medium';
    return 'low';
  }

  /**
   * Determine urgency level for soil moisture
   */
  private determineSoilMoistureUrgency(waterLevel: number): 'low' | 'medium' | 'high' | 'critical' {
    if (waterLevel <= 10) return 'critical';
    if (waterLevel <= 15) return 'high';
    if (waterLevel <= 20) return 'medium';
    return 'low';
  }

  /**
   * Determine urgency level for weather warnings
   */
  private determineWeatherUrgency(weather: any): 'low' | 'medium' | 'high' | 'critical' {
    let urgencyScore = 0;

    if (weather.temperature > 40) urgencyScore += 3;
    else if (weather.temperature > 35) urgencyScore += 2;
    else if (weather.temperature > 30) urgencyScore += 1;

    if (weather.humidity < 20) urgencyScore += 2;
    else if (weather.humidity < 30) urgencyScore += 1;

    if (weather.windSpeed > 20) urgencyScore += 2;
    else if (weather.windSpeed > 15) urgencyScore += 1;

    if (urgencyScore >= 5) return 'critical';
    if (urgencyScore >= 3) return 'high';
    if (urgencyScore >= 2) return 'medium';
    return 'low';
  }
}