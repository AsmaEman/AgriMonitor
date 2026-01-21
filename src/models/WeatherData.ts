import 'reflect-metadata';
import {
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
  Max,
  validate,
  ValidationError,
} from 'class-validator';
import { Transform, plainToClass, classToPlain } from 'class-transformer';
import { BaseModel, VALIDATION_CONSTRAINTS } from './types';

export class WeatherData implements BaseModel {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsNumber()
  field_id!: number;

  @IsDateString()
  date!: string;

  @IsOptional()
  @IsNumber()
  temperature_max?: number; // Celsius

  @IsOptional()
  @IsNumber()
  temperature_min?: number; // Celsius

  @IsOptional()
  @IsNumber()
  temperature_avg?: number; // Celsius

  @IsOptional()
  @IsNumber()
  @Min(0)
  precipitation?: number; // mm

  @IsOptional()
  @IsNumber()
  @Min(VALIDATION_CONSTRAINTS.PERCENTAGE_MIN)
  @Max(VALIDATION_CONSTRAINTS.PERCENTAGE_MAX)
  humidity?: number; // %

  @IsOptional()
  @IsNumber()
  @Min(0)
  wind_speed?: number; // m/s

  @IsOptional()
  @IsNumber()
  @Min(0)
  et0?: number; // Reference evapotranspiration (mm/day)

  @IsOptional()
  @IsNumber()
  @Min(0)
  solar_radiation?: number; // MJ/m²/day

  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  created_at?: Date;

  constructor(data?: Partial<WeatherData>) {
    if (data) {
      Object.assign(this, data);
      // Set default precipitation if not provided
      if (this.precipitation === undefined) {
        this.precipitation = 0;
      }
    }
  }

  /**
   * Validates the weather data instance
   * @returns Promise<ValidationError[]> - Array of validation errors, empty if valid
   */
  async validate(): Promise<ValidationError[]> {
    const errors = await validate(this);

    // Custom validation for temperature consistency
    if (this.temperature_min !== undefined && this.temperature_max !== undefined) {
      if (this.temperature_min > this.temperature_max) {
        const error = new ValidationError();
        error.property = 'temperature_min';
        error.constraints = {
          temperatureRange: 'Minimum temperature cannot be greater than maximum temperature'
        };
        errors.push(error);
      }

      // Validate average temperature if provided
      if (this.temperature_avg !== undefined) {
        if (this.temperature_avg < this.temperature_min || this.temperature_avg > this.temperature_max) {
          const error = new ValidationError();
          error.property = 'temperature_avg';
          error.constraints = {
            temperatureAverage: 'Average temperature must be between minimum and maximum temperatures'
          };
          errors.push(error);
        }
      }
    }

    return errors;
  }

  /**
   * Calculates average temperature from min and max if not provided
   * @returns Average temperature in Celsius
   */
  calculateAverageTemperature(): number | undefined {
    if (this.temperature_min !== undefined && this.temperature_max !== undefined) {
      return (this.temperature_min + this.temperature_max) / 2;
    }
    return this.temperature_avg;
  }

  /**
   * Sets the average temperature using calculated value
   */
  setCalculatedAverageTemperature(): void {
    const calculated = this.calculateAverageTemperature();
    if (calculated !== undefined) {
      this.temperature_avg = calculated;
    }
  }

  /**
   * Calculates reference evapotranspiration (ET₀) using simplified Penman-Monteith equation
   * This is a basic implementation - for production use, consider using a dedicated library
   * @returns ET₀ in mm/day
   */
  calculateET0(): number | undefined {
    // Require minimum data for ET₀ calculation
    if (this.temperature_max === undefined ||
      this.temperature_min === undefined ||
      this.humidity === undefined) {
      return undefined;
    }

    const tempAvg = this.calculateAverageTemperature()!;
    const tempMax = this.temperature_max;
    const tempMin = this.temperature_min;
    const humidity = this.humidity;
    const windSpeed = this.wind_speed || 2.0; // Default wind speed if not provided
    const solarRad = this.solar_radiation || this.estimateSolarRadiation();

    // Simplified Penman-Monteith calculation
    // This is a basic approximation - for production, use a proper meteorological library
    const delta = 4098 * (0.6108 * Math.exp(17.27 * tempAvg / (tempAvg + 237.3))) / Math.pow(tempAvg + 237.3, 2);
    const gamma = 0.665; // Psychrometric constant (approximate)
    const u2 = windSpeed; // Wind speed at 2m height
    const es = (0.6108 * Math.exp(17.27 * tempMax / (tempMax + 237.3)) +
      0.6108 * Math.exp(17.27 * tempMin / (tempMin + 237.3))) / 2;
    const ea = es * humidity / 100;
    const rn = solarRad * 0.408; // Net radiation (simplified)

    const et0 = (0.408 * delta * rn + gamma * 900 / (tempAvg + 273) * u2 * (es - ea)) /
      (delta + gamma * (1 + 0.34 * u2));

    return Math.max(0, et0);
  }

  /**
   * Estimates solar radiation based on temperature range (simplified method)
   * @returns Estimated solar radiation in MJ/m²/day
   */
  private estimateSolarRadiation(): number {
    if (this.temperature_max === undefined || this.temperature_min === undefined) {
      return 15; // Default value
    }

    // Hargreaves method approximation
    const tempRange = this.temperature_max - this.temperature_min;
    const tempAvg = (this.temperature_max + this.temperature_min) / 2;

    // Simplified estimation - in production, use proper solar radiation calculation
    return Math.max(5, Math.min(30, 0.16 * Math.sqrt(tempRange) * (tempAvg + 17.8)));
  }

  /**
   * Sets the ET₀ using calculated value
   */
  setCalculatedET0(): void {
    const calculated = this.calculateET0();
    if (calculated !== undefined) {
      this.et0 = calculated;
    }
  }

  /**
   * Serializes the weather data instance to a plain object
   * @returns Plain object representation
   */
  toJSON(): Record<string, any> {
    return classToPlain(this, {
      excludeExtraneousValues: false,
      exposeDefaultValues: true,
    });
  }

  /**
   * Creates a WeatherData instance from a plain object
   * @param data - Plain object data
   * @returns WeatherData instance
   */
  static fromJSON(data: Record<string, any>): WeatherData {
    return plainToClass(WeatherData, data, {
      enableImplicitConversion: true,
    });
  }

  /**
   * Creates a WeatherData instance from database row
   * @param row - Database row object
   * @returns WeatherData instance
   */
  static fromDatabaseRow(row: any): WeatherData {
    const weatherData = new WeatherData();
    weatherData.id = row.id;
    weatherData.field_id = row.field_id;
    weatherData.date = row.date;
    weatherData.temperature_max = row.temperature_max;
    weatherData.temperature_min = row.temperature_min;
    weatherData.temperature_avg = row.temperature_avg;
    weatherData.precipitation = row.precipitation || 0;
    weatherData.humidity = row.humidity;
    weatherData.wind_speed = row.wind_speed;
    weatherData.et0 = row.et0;
    weatherData.solar_radiation = row.solar_radiation;
    if (row.created_at) weatherData.created_at = new Date(row.created_at);

    return weatherData;
  }

  /**
   * Converts WeatherData instance to database row format
   * @returns Database row object
   */
  toDatabaseRow(): Record<string, any> {
    return {
      id: this.id,
      field_id: this.field_id,
      date: this.date,
      temperature_max: this.temperature_max,
      temperature_min: this.temperature_min,
      temperature_avg: this.temperature_avg,
      precipitation: this.precipitation || 0,
      humidity: this.humidity,
      wind_speed: this.wind_speed,
      et0: this.et0,
      solar_radiation: this.solar_radiation,
      created_at: this.created_at?.toISOString(),
    };
  }

  /**
   * Checks if the weather conditions indicate drought stress
   * @param precipitationThreshold - Minimum precipitation in mm (default: 5)
   * @param humidityThreshold - Maximum humidity % for drought conditions (default: 30)
   * @returns True if drought conditions are indicated
   */
  isDroughtConditions(precipitationThreshold: number = 5, humidityThreshold: number = 30): boolean {
    const lowPrecipitation = (this.precipitation || 0) < precipitationThreshold;
    const lowHumidity = this.humidity !== undefined && this.humidity < humidityThreshold;

    return lowPrecipitation && lowHumidity;
  }

  /**
   * Checks if conditions are favorable for irrigation
   * @returns True if conditions are good for irrigation
   */
  isFavorableForIrrigation(): boolean {
    // Avoid irrigation during rain or high humidity
    const noRain = (this.precipitation || 0) < 1;
    const moderateHumidity = this.humidity === undefined || this.humidity < 80;
    const moderateWind = this.wind_speed === undefined || this.wind_speed < 15; // Avoid high wind

    return noRain && moderateHumidity && moderateWind;
  }

  /**
   * Gets a human-readable weather summary
   * @returns Weather summary string
   */
  getWeatherSummary(): string {
    const parts: string[] = [];

    if (this.temperature_max !== undefined && this.temperature_min !== undefined) {
      parts.push(`${this.temperature_min}°C - ${this.temperature_max}°C`);
    }

    if (this.precipitation !== undefined && this.precipitation > 0) {
      parts.push(`${this.precipitation}mm rain`);
    }

    if (this.humidity !== undefined) {
      parts.push(`${this.humidity}% humidity`);
    }

    if (this.wind_speed !== undefined) {
      parts.push(`${this.wind_speed}m/s wind`);
    }

    return parts.join(', ') || 'No weather data available';
  }
}