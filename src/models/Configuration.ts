import 'reflect-metadata';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  validate,
  ValidationError,
} from 'class-validator';
import { Transform, plainToClass, classToPlain } from 'class-transformer';
import { BaseModel } from './types';

export class Configuration implements BaseModel {
  @IsOptional()
  id?: number;

  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  value!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  updated_at?: Date;

  constructor(data?: Partial<Configuration>) {
    if (data) {
      Object.assign(this, data);
      if (this.updated_at === undefined) {
        this.updated_at = new Date();
      }
    }
  }

  /**
   * Validates the configuration instance
   * @returns Promise<ValidationError[]> - Array of validation errors, empty if valid
   */
  async validate(): Promise<ValidationError[]> {
    const errors = await validate(this);

    // Custom validation for specific configuration keys
    if (this.key && this.value) {
      const validationError = this.validateKeyValue();
      if (validationError) {
        errors.push(validationError);
      }
    }

    return errors;
  }

  /**
   * Validates specific key-value combinations
   * @returns ValidationError or null if valid
   */
  private validateKeyValue(): ValidationError | null {
    const numericKeys = [
      'health_score_threshold',
      'ndvi_decline_threshold',
      'soil_moisture_critical_threshold',
      'weather_cache_duration',
      'satellite_cache_duration',
      'api_rate_limit_window',
      'api_rate_limit_max_requests'
    ];

    if (numericKeys.includes(this.key)) {
      const numValue = parseFloat(this.value);
      if (isNaN(numValue) || numValue < 0) {
        const error = new ValidationError();
        error.property = 'value';
        error.constraints = {
          numericValue: `Configuration key '${this.key}' must have a non-negative numeric value`
        };
        return error;
      }

      // Specific range validations
      if (this.key === 'health_score_threshold' && (numValue < 0 || numValue > 100)) {
        const error = new ValidationError();
        error.property = 'value';
        error.constraints = {
          healthScoreRange: 'Health score threshold must be between 0 and 100'
        };
        return error;
      }

      if (this.key === 'ndvi_decline_threshold' && (numValue < 0 || numValue > 100)) {
        const error = new ValidationError();
        error.property = 'value';
        error.constraints = {
          ndviDeclineRange: 'NDVI decline threshold must be between 0 and 100 percent'
        };
        return error;
      }

      if (this.key === 'soil_moisture_critical_threshold' && (numValue < 0 || numValue > 100)) {
        const error = new ValidationError();
        error.property = 'value';
        error.constraints = {
          soilMoistureRange: 'Soil moisture threshold must be between 0 and 100 percent'
        };
        return error;
      }
    }

    return null;
  }

  /**
   * Gets the configuration value as a number
   * @returns Numeric value or NaN if not numeric
   */
  getNumericValue(): number {
    return parseFloat(this.value);
  }

  /**
   * Gets the configuration value as a boolean
   * @returns Boolean value
   */
  getBooleanValue(): boolean {
    return this.value.toLowerCase() === 'true' || this.value === '1';
  }

  /**
   * Gets the configuration value as a string (default behavior)
   * @returns String value
   */
  getStringValue(): string {
    return this.value;
  }

  /**
   * Updates the configuration value
   * @param newValue - New value to set
   */
  updateValue(newValue: string): void {
    this.value = newValue;
    this.updated_at = new Date();
  }

  /**
   * Serializes the configuration instance to a plain object
   * @returns Plain object representation
   */
  toJSON(): Record<string, any> {
    return classToPlain(this, {
      excludeExtraneousValues: false,
      exposeDefaultValues: true,
    });
  }

  /**
   * Creates a Configuration instance from a plain object
   * @param data - Plain object data
   * @returns Configuration instance
   */
  static fromJSON(data: Record<string, any>): Configuration {
    return plainToClass(Configuration, data, {
      enableImplicitConversion: true,
    });
  }

  /**
   * Creates a Configuration instance from database row
   * @param row - Database row object
   * @returns Configuration instance
   */
  static fromDatabaseRow(row: any): Configuration {
    const config = new Configuration();
    config.id = row.id;
    config.key = row.key;
    config.value = row.value;
    config.description = row.description;
    if (row.updated_at) config.updated_at = new Date(row.updated_at);

    return config;
  }

  /**
   * Converts Configuration instance to database row format
   * @returns Database row object
   */
  toDatabaseRow(): Record<string, any> {
    return {
      id: this.id,
      key: this.key,
      value: this.value,
      description: this.description,
      updated_at: this.updated_at?.toISOString(),
    };
  }

  /**
   * Creates a new configuration entry
   * @param key - Configuration key
   * @param value - Configuration value
   * @param description - Optional description
   * @returns Configuration instance
   */
  static create(key: string, value: string, description?: string): Configuration {
    const config = new Configuration({
      key,
      value,
      updated_at: new Date(),
    });
    if (description) {
      config.description = description;
    }
    return config;
  }

  /**
   * Gets default configuration values
   * @returns Array of default Configuration instances
   */
  static getDefaults(): Configuration[] {
    return [
      Configuration.create('health_score_threshold', '50', 'Health score threshold for generating alerts'),
      Configuration.create('ndvi_decline_threshold', '15', 'NDVI decline percentage threshold for alerts'),
      Configuration.create('soil_moisture_critical_threshold', '20', 'Critical soil moisture level for alerts'),
      Configuration.create('weather_cache_duration', '3600', 'Weather data cache duration in seconds'),
      Configuration.create('satellite_cache_duration', '86400', 'Satellite data cache duration in seconds'),
      Configuration.create('api_rate_limit_window', '900000', 'API rate limit window in milliseconds'),
      Configuration.create('api_rate_limit_max_requests', '100', 'Maximum API requests per window'),
    ];
  }
}