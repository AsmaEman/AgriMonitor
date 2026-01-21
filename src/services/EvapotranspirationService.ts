import { logger } from '../utils/logger';

export interface WeatherDataForET {
  temperatureMax: number;    // °C
  temperatureMin: number;    // °C
  humidity: number;          // %
  windSpeed?: number;        // m/s
  solarRadiation?: number;   // MJ/m²/day
  pressure?: number;         // kPa
}

export interface ET0Result {
  et0: number;              // mm/day
  method: string;           // Calculation method used
  dataQuality: 'high' | 'medium' | 'low';
}

export class EvapotranspirationService {

  /**
   * Calculate reference evapotranspiration (ET₀) using FAO Penman-Monteith equation
   * Based on FAO Irrigation and Drainage Paper 56
   */
  calculateET0(weatherData: WeatherDataForET, latitude: number, dayOfYear: number): ET0Result {
    try {
      // Validate input data
      this.validateWeatherData(weatherData);

      const { temperatureMax, temperatureMin, humidity, windSpeed = 2.0 } = weatherData;

      // Calculate mean temperature
      const tempMean = (temperatureMax + temperatureMin) / 2;

      // Calculate slope of saturation vapour pressure curve (kPa/°C)
      const delta = this.calculateSlopeVapourPressure(tempMean);

      // Calculate psychrometric constant (kPa/°C)
      const gamma = this.calculatePsychrometricConstant(weatherData.pressure);

      // Calculate saturation vapour pressure (kPa)
      const es = this.calculateSaturationVapourPressure(temperatureMax, temperatureMin);

      // Calculate actual vapour pressure (kPa)
      const ea = this.calculateActualVapourPressure(es, humidity);

      // Calculate net radiation (MJ/m²/day)
      const rn = this.calculateNetRadiation(
        weatherData.solarRadiation || this.estimateSolarRadiation(temperatureMax, temperatureMin, latitude, dayOfYear),
        tempMean,
        ea
      );

      // Calculate soil heat flux (assumed to be 0 for daily calculations)
      const g = 0;

      // Calculate wind speed at 2m height
      const u2 = windSpeed;

      // FAO Penman-Monteith equation
      const numerator = 0.408 * delta * (rn - g) + gamma * 900 / (tempMean + 273) * u2 * (es - ea);
      const denominator = delta + gamma * (1 + 0.34 * u2);

      const et0 = numerator / denominator;

      // Ensure ET₀ is not negative
      const finalET0 = Math.max(0, et0);

      // Determine data quality
      const dataQuality = this.assessDataQuality(weatherData);

      logger.debug('ET₀ calculation completed', {
        et0: finalET0,
        method: 'FAO Penman-Monteith',
        dataQuality,
        inputs: { tempMean, humidity, windSpeed, rn }
      });

      return {
        et0: finalET0,
        method: 'FAO Penman-Monteith',
        dataQuality
      };

    } catch (error) {
      logger.error('ET₀ calculation failed, using fallback method:', error);
      return this.calculateET0Fallback(weatherData);
    }
  }

  /**
   * Fallback ET₀ calculation using simplified Hargreaves method
   */
  private calculateET0Fallback(weatherData: WeatherDataForET): ET0Result {
    const { temperatureMax, temperatureMin } = weatherData;
    const tempMean = (temperatureMax + temperatureMin) / 2;
    const tempRange = temperatureMax - temperatureMin;

    // Simplified Hargreaves equation: ET₀ = 0.0023 * (Tmean + 17.8) * sqrt(TD) * Ra
    // Using approximate Ra = 15 MJ/m²/day for simplification
    const ra = 15;
    const et0 = 0.0023 * (tempMean + 17.8) * Math.sqrt(tempRange) * ra;

    return {
      et0: Math.max(0, et0),
      method: 'Hargreaves (simplified)',
      dataQuality: 'low'
    };
  }

  /**
   * Calculate slope of saturation vapour pressure curve
   */
  private calculateSlopeVapourPressure(temperature: number): number {
    return 4098 * (0.6108 * Math.exp(17.27 * temperature / (temperature + 237.3))) /
      Math.pow(temperature + 237.3, 2);
  }

  /**
   * Calculate psychrometric constant
   */
  private calculatePsychrometricConstant(pressure?: number): number {
    const p = pressure || 101.3; // Standard atmospheric pressure in kPa
    return 0.665 * p;
  }

  /**
   * Calculate saturation vapour pressure
   */
  private calculateSaturationVapourPressure(tempMax: number, tempMin: number): number {
    const esMax = 0.6108 * Math.exp(17.27 * tempMax / (tempMax + 237.3));
    const esMin = 0.6108 * Math.exp(17.27 * tempMin / (tempMin + 237.3));
    return (esMax + esMin) / 2;
  }

  /**
   * Calculate actual vapour pressure
   */
  private calculateActualVapourPressure(es: number, humidity: number): number {
    return es * humidity / 100;
  }

  /**
   * Calculate net radiation (simplified)
   */
  private calculateNetRadiation(
    solarRadiation: number,
    temperature: number,
    actualVapourPressure: number
  ): number {
    // Simplified net radiation calculation
    // In practice, this would require more detailed calculations
    const albedo = 0.23; // Grass reference albedo
    const netSolarRadiation = (1 - albedo) * solarRadiation;

    // Simplified net longwave radiation
    const stefanBoltzmann = 4.903e-9; // MJ K⁻⁴ m⁻² day⁻¹
    const tempKelvin = temperature + 273.16;
    const netLongwaveRadiation = stefanBoltzmann * Math.pow(tempKelvin, 4) *
      (0.34 - 0.14 * Math.sqrt(actualVapourPressure)) * 0.5;

    return netSolarRadiation - netLongwaveRadiation;
  }

  /**
   * Estimate solar radiation using temperature-based method
   */
  private estimateSolarRadiation(
    tempMax: number,
    tempMin: number,
    latitude: number,
    dayOfYear: number
  ): number {
    // Hargreaves method for estimating solar radiation
    const tempRange = tempMax - tempMin;
    const ra = this.calculateExtraterrestrialRadiation(latitude, dayOfYear);

    // Hargreaves coefficient (typically 0.16-0.19)
    const krs = 0.17;

    return krs * Math.sqrt(tempRange) * ra;
  }

  /**
   * Calculate extraterrestrial radiation
   */
  private calculateExtraterrestrialRadiation(latitude: number, dayOfYear: number): number {
    const latRad = latitude * Math.PI / 180;
    const solarConstant = 0.0820; // MJ m⁻² min⁻¹

    // Solar declination
    const declination = 0.409 * Math.sin(2 * Math.PI / 365 * dayOfYear - 1.39);

    // Sunset hour angle
    const sunsetAngle = Math.acos(-Math.tan(latRad) * Math.tan(declination));

    // Inverse relative distance Earth-Sun
    const dr = 1 + 0.033 * Math.cos(2 * Math.PI / 365 * dayOfYear);

    // Extraterrestrial radiation
    const ra = 24 * 60 / Math.PI * solarConstant * dr *
      (sunsetAngle * Math.sin(latRad) * Math.sin(declination) +
        Math.cos(latRad) * Math.cos(declination) * Math.sin(sunsetAngle));

    return Math.max(0, ra);
  }

  /**
   * Validate weather data for ET₀ calculation (throws errors)
   */
  /**
   * Validate weather data for ET₀ calculation (throws errors)
   */
  validateWeatherDataStrict(data: WeatherDataForET): void {
    this.validateWeatherData(data);
  }

  /**
   * Validate weather data for ET₀ calculation (private method)
   */
  private validateWeatherData(data: WeatherDataForET): void {
    if (data.temperatureMax === undefined || data.temperatureMin === undefined) {
      throw new Error('Temperature data (max and min) is required for ET₀ calculation');
    }

    if (data.humidity === undefined) {
      throw new Error('Humidity data is required for ET₀ calculation');
    }

    // Check for NaN values
    if (!isFinite(data.temperatureMax) || !isFinite(data.temperatureMin) || !isFinite(data.humidity)) {
      throw new Error('Temperature and humidity values must be finite numbers');
    }

    if (data.temperatureMin > data.temperatureMax) {
      throw new Error('Minimum temperature cannot be greater than maximum temperature');
    }

    if (data.humidity < 0 || data.humidity > 100) {
      throw new Error('Humidity must be between 0 and 100%');
    }

    if (data.windSpeed !== undefined && (!isFinite(data.windSpeed) || data.windSpeed < 0)) {
      throw new Error('Wind speed must be a non-negative finite number');
    }
  }

  /**
   * Assess data quality for ET₀ calculation
   */
  private assessDataQuality(data: WeatherDataForET): 'high' | 'medium' | 'low' {
    let score = 0;

    // Check if all parameters are available
    if (data.temperatureMax !== undefined && data.temperatureMin !== undefined) score += 2;
    if (data.humidity !== undefined) score += 2;
    if (data.windSpeed !== undefined) score += 1;
    if (data.solarRadiation !== undefined) score += 2;
    if (data.pressure !== undefined) score += 1;

    // Check data reasonableness
    const tempRange = data.temperatureMax - data.temperatureMin;
    if (tempRange > 5 && tempRange < 30) score += 1; // Reasonable temperature range
    if (data.humidity >= 20 && data.humidity <= 90) score += 1; // Reasonable humidity

    if (score >= 7) return 'high';
    if (score >= 5) return 'medium';
    return 'low';
  }

  /**
   * Calculate crop evapotranspiration (ETc) using crop coefficient
   */
  calculateETc(et0: number, cropCoefficient: number): number {
    if (!isFinite(et0) || !isFinite(cropCoefficient)) {
      throw new Error('ET₀ and crop coefficient must be finite numbers');
    }

    if (et0 < 0 || cropCoefficient < 0) {
      throw new Error('ET₀ and crop coefficient must be non-negative');
    }

    return et0 * cropCoefficient;
  }

  /**
   * Get typical crop coefficients for different growth stages
   */
  getCropCoefficients(cropType: string, growthStage: string): number {
    const coefficients: Record<string, Record<string, number>> = {
      wheat: {
        initial: 0.4,
        development: 0.7,
        mid_season: 1.15,
        late_season: 0.4
      },
      rice: {
        initial: 1.05,
        development: 1.10,
        mid_season: 1.20,
        late_season: 0.90
      },
      maize: {
        initial: 0.3,
        development: 0.7,
        mid_season: 1.20,
        late_season: 0.6
      },
      cotton: {
        initial: 0.35,
        development: 0.75,
        mid_season: 1.15,
        late_season: 0.8
      },
      soybean: {
        initial: 0.4,
        development: 0.8,
        mid_season: 1.15,
        late_season: 0.5
      }
    };

    return coefficients[cropType]?.[growthStage] || 1.0; // Default coefficient
  }
}