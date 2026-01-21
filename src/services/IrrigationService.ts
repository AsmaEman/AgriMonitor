import { logger } from '../utils/logger';
import { CropCoefficientService } from './CropCoefficientService';
import { EvapotranspirationService } from './EvapotranspirationService';
import { WeatherService } from './WeatherService';
import { CropType, GrowthStage } from '../models/types';

export interface SoilData {
  fieldCapacity: number; // mm
  wiltingPoint: number; // mm
  currentMoisture: number; // mm
  depth: number; // cm
  texture: 'clay' | 'loam' | 'sand' | 'silt';
}

export interface IrrigationRecommendation {
  fieldId: string;
  recommendationDate: Date;
  shouldIrrigate: boolean;
  waterAmount: number; // mm
  urgency: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
  nextCheckDate: Date;
  soilMoistureDeficit: number; // mm
  cropWaterRequirement: number; // mm/day
  availableWaterCapacity: number; // mm
  currentWaterLevel: number; // % of available water capacity
}

export class IrrigationService {
  private cropService: CropCoefficientService;
  private etService: EvapotranspirationService;
  private weatherService: WeatherService;

  constructor() {
    this.cropService = new CropCoefficientService();
    this.etService = new EvapotranspirationService();
    this.weatherService = new WeatherService();
  }

  /**
   * Generate irrigation recommendation for a field
   */
  async generateRecommendation(
    fieldId: string,
    cropType: CropType,
    growthStage: GrowthStage,
    soilData: SoilData,
    latitude: number,
    longitude: number
  ): Promise<IrrigationRecommendation> {
    try {
      // Get weather data for ET calculation
      const weatherData = await this.weatherService.getCurrentWeather(latitude, longitude);

      // Calculate reference evapotranspiration
      const weatherDataForET = {
        temperatureMax: weatherData.temperature + 5, // Estimate max temp
        temperatureMin: weatherData.temperature - 5, // Estimate min temp
        humidity: weatherData.humidity,
        windSpeed: weatherData.windSpeed,
        pressure: 101.3 // Standard atmospheric pressure
      };

      const etResult = this.etService.calculateET0(weatherDataForET, latitude, new Date().getDay());
      const et0 = etResult.et0;

      // Get crop coefficient
      const kc = this.cropService.getCropCoefficient(cropType, growthStage);

      // Calculate crop water requirement (ETc = ET0 * Kc)
      const cropWaterRequirement = et0 * kc;

      // Calculate available water capacity
      const availableWaterCapacity = soilData.fieldCapacity - soilData.wiltingPoint;

      // Calculate current water level as percentage of available capacity
      const currentWaterLevel = ((soilData.currentMoisture - soilData.wiltingPoint) / availableWaterCapacity) * 100;

      // Calculate soil moisture deficit
      const targetMoisture = soilData.wiltingPoint + (availableWaterCapacity * 0.5); // 50% AWC threshold
      const soilMoistureDeficit = Math.max(0, targetMoisture - soilData.currentMoisture);

      // Determine if irrigation is needed (50% available water capacity threshold)
      const shouldIrrigate = currentWaterLevel <= 50;

      // Calculate water amount needed
      let waterAmount = 0;
      if (shouldIrrigate) {
        // Fill to field capacity plus account for next few days of ET
        const daysAhead = 3;
        const futureET = cropWaterRequirement * daysAhead;
        waterAmount = soilMoistureDeficit + futureET;

        // Ensure minimum and maximum irrigation amounts
        waterAmount = Math.max(10, Math.min(waterAmount, 50)); // 10-50mm range
      }

      // Determine urgency based on current water level
      let urgency: 'low' | 'medium' | 'high' | 'critical';
      if (currentWaterLevel > 50) {
        urgency = 'low';
      } else if (currentWaterLevel > 30) {
        urgency = 'medium';
      } else if (currentWaterLevel > 15) {
        urgency = 'high';
      } else {
        urgency = 'critical';
      }

      // Generate reasoning text
      const reasoning = this.generateReasoning(
        shouldIrrigate,
        currentWaterLevel,
        cropWaterRequirement,
        soilMoistureDeficit,
        cropType,
        growthStage,
        weatherData.temperature,
        weatherData.humidity
      );

      // Calculate next check date
      const nextCheckDate = new Date();
      if (shouldIrrigate) {
        nextCheckDate.setDate(nextCheckDate.getDate() + 1); // Check daily if irrigation needed
      } else {
        nextCheckDate.setDate(nextCheckDate.getDate() + 2); // Check every 2 days if no irrigation needed
      }

      const recommendation: IrrigationRecommendation = {
        fieldId,
        recommendationDate: new Date(),
        shouldIrrigate,
        waterAmount,
        urgency,
        reasoning,
        nextCheckDate,
        soilMoistureDeficit,
        cropWaterRequirement,
        availableWaterCapacity,
        currentWaterLevel
      };

      logger.info('Generated irrigation recommendation', {
        fieldId,
        shouldIrrigate,
        waterAmount,
        urgency,
        currentWaterLevel
      });

      return recommendation;

    } catch (error: any) {
      logger.error('Failed to generate irrigation recommendation', { fieldId, error });
      throw new Error(`Failed to generate irrigation recommendation: ${error.message}`);
    }
  }

  /**
   * Generate detailed reasoning text for the recommendation
   */
  private generateReasoning(
    shouldIrrigate: boolean,
    currentWaterLevel: number,
    cropWaterRequirement: number,
    soilMoistureDeficit: number,
    cropType: CropType,
    growthStage: GrowthStage,
    temperature: number,
    humidity: number
  ): string {
    if (!shouldIrrigate) {
      return `Soil moisture is adequate at ${currentWaterLevel.toFixed(1)}% of available water capacity. ` +
        `${cropType} in ${growthStage} stage requires ${cropWaterRequirement.toFixed(2)}mm/day. ` +
        `Current conditions (${temperature.toFixed(1)}°C, ${humidity.toFixed(1)}% humidity) are favorable. ` +
        `Continue monitoring - irrigation will be needed when soil moisture drops below 50% AWC.`;
    }

    let reasoning = `Irrigation recommended: soil moisture at ${currentWaterLevel.toFixed(1)}% of available water capacity (below 50% threshold). `;

    reasoning += `${cropType} in ${growthStage} stage has high water demand (${cropWaterRequirement.toFixed(2)}mm/day). `;

    if (soilMoistureDeficit > 20) {
      reasoning += `Significant soil moisture deficit of ${soilMoistureDeficit.toFixed(1)}mm detected. `;
    }

    if (temperature > 30) {
      reasoning += `High temperature (${temperature.toFixed(1)}°C) increases evapotranspiration stress. `;
    }

    if (humidity < 40) {
      reasoning += `Low humidity (${humidity.toFixed(1)}%) accelerates water loss. `;
    }

    if (currentWaterLevel < 15) {
      reasoning += `CRITICAL: Soil moisture approaching wilting point - immediate irrigation required to prevent crop stress.`;
    } else if (currentWaterLevel < 30) {
      reasoning += `Urgent irrigation needed to maintain optimal crop growth and prevent yield loss.`;
    } else {
      reasoning += `Timely irrigation will maintain optimal soil moisture for healthy crop development.`;
    }

    return reasoning;
  }

  /**
   * Calculate irrigation efficiency based on application method
   */
  calculateIrrigationEfficiency(method: 'drip' | 'sprinkler' | 'flood' | 'furrow'): number {
    const efficiencies = {
      drip: 0.90,      // 90% efficiency
      sprinkler: 0.75,  // 75% efficiency
      flood: 0.60,      // 60% efficiency
      furrow: 0.65      // 65% efficiency
    };

    return efficiencies[method] || 0.70; // Default 70% efficiency
  }

  /**
   * Adjust water amount based on irrigation method efficiency
   */
  adjustWaterAmountForMethod(
    waterAmount: number,
    method: 'drip' | 'sprinkler' | 'flood' | 'furrow'
  ): number {
    const efficiency = this.calculateIrrigationEfficiency(method);
    return waterAmount / efficiency;
  }

  /**
   * Get soil texture specific parameters
   */
  getSoilTextureParameters(texture: 'clay' | 'loam' | 'sand' | 'silt'): {
    infiltrationRate: number; // mm/hour
    waterHoldingCapacity: number; // mm/cm depth
    recommendedDepth: number; // cm
  } {
    const parameters = {
      clay: {
        infiltrationRate: 5,
        waterHoldingCapacity: 2.0,
        recommendedDepth: 30
      },
      loam: {
        infiltrationRate: 15,
        waterHoldingCapacity: 1.5,
        recommendedDepth: 40
      },
      sand: {
        infiltrationRate: 30,
        waterHoldingCapacity: 0.8,
        recommendedDepth: 50
      },
      silt: {
        infiltrationRate: 10,
        waterHoldingCapacity: 1.8,
        recommendedDepth: 35
      }
    };

    return parameters[texture];
  }

  /**
   * Validate soil data inputs
   */
  validateSoilData(soilData: SoilData): boolean {
    if (soilData.fieldCapacity <= soilData.wiltingPoint) {
      return false;
    }

    if (soilData.currentMoisture < 0 || soilData.currentMoisture > soilData.fieldCapacity * 1.2) {
      return false;
    }

    if (soilData.depth <= 0 || soilData.depth > 200) {
      return false;
    }

    return true;
  }

  /**
   * Get irrigation timing recommendations
   */
  getIrrigationTiming(
    season: 'spring' | 'summer' | 'fall' | 'winter'
  ): {
    optimalStartHour: number;
    optimalEndHour: number;
    reasoning: string;
  } {
    // Early morning irrigation is generally best to minimize evaporation
    let optimalStartHour = 5;
    let optimalEndHour = 8;
    let reasoning = 'Early morning irrigation minimizes evaporation losses and allows plants to absorb water before heat stress.';

    if (season === 'summer') {
      optimalStartHour = 4;
      optimalEndHour = 7;
      reasoning = 'Very early morning irrigation in summer reduces evaporation losses during hot weather.';
    } else if (season === 'winter') {
      optimalStartHour = 7;
      optimalEndHour = 10;
      reasoning = 'Later morning irrigation in winter avoids frost conditions and allows soil to warm.';
    }

    return {
      optimalStartHour,
      optimalEndHour,
      reasoning
    };
  }
}