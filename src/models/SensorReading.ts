import 'reflect-metadata';
import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  Max,
  validate,
  ValidationError,
} from 'class-validator';
import { Transform, plainToClass, classToPlain } from 'class-transformer';
import { BaseModel, VALIDATION_CONSTRAINTS } from './types';

export class SensorReading implements BaseModel {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsNumber()
  field_id!: number;

  @Transform(({ value }) => value ? new Date(value) : undefined)
  timestamp!: Date;

  @IsOptional()
  @IsNumber()
  @Min(VALIDATION_CONSTRAINTS.PERCENTAGE_MIN)
  @Max(VALIDATION_CONSTRAINTS.PERCENTAGE_MAX)
  soil_moisture?: number; // %

  @IsOptional()
  @IsNumber()
  soil_temperature?: number; // Celsius

  @IsOptional()
  @IsNumber()
  @Min(0)
  battery_voltage?: number; // Volts

  @IsOptional()
  @IsString()
  sensor_id?: string;

  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  created_at?: Date;

  constructor(data?: Partial<SensorReading>) {
    if (data) {
      Object.assign(this, data);
      if (this.created_at === undefined) {
        this.created_at = new Date();
      }
    }
  }

  /**
   * Validates the sensor reading instance
   * @returns Promise<ValidationError[]> - Array of validation errors, empty if valid
   */
  async validate(): Promise<ValidationError[]> {
    const errors = await validate(this);

    // Custom validation for timestamp
    if (this.timestamp && this.timestamp > new Date()) {
      const error = new ValidationError();
      error.property = 'timestamp';
      error.constraints = {
        futureTimestamp: 'Sensor reading timestamp cannot be in the future'
      };
      errors.push(error);
    }

    // Custom validation for battery voltage (typical range for IoT sensors)
    if (this.battery_voltage !== undefined) {
      if (this.battery_voltage < 1.0 || this.battery_voltage > 5.0) {
        const error = new ValidationError();
        error.property = 'battery_voltage';
        error.constraints = {
          batteryRange: 'Battery voltage should be between 1.0V and 5.0V for typical IoT sensors'
        };
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * Checks if the sensor reading indicates low battery
   * @param threshold - Battery voltage threshold (default: 2.5V)
   * @returns True if battery is low
   */
  isLowBattery(threshold: number = 2.5): boolean {
    return this.battery_voltage !== undefined && this.battery_voltage < threshold;
  }

  /**
   * Checks if the soil moisture indicates drought conditions
   * @param threshold - Soil moisture threshold (default: 20%)
   * @returns True if drought conditions are indicated
   */
  isDroughtConditions(threshold: number = 20): boolean {
    return this.soil_moisture !== undefined && this.soil_moisture < threshold;
  }

  /**
   * Checks if the soil temperature indicates stress conditions
   * @param minThreshold - Minimum temperature threshold (default: 5°C)
   * @param maxThreshold - Maximum temperature threshold (default: 35°C)
   * @returns True if temperature stress is indicated
   */
  isTemperatureStress(minThreshold: number = 5, maxThreshold: number = 35): boolean {
    if (this.soil_temperature === undefined) {
      return false;
    }
    return this.soil_temperature < minThreshold || this.soil_temperature > maxThreshold;
  }

  /**
   * Gets the age of the sensor reading in hours
   * @returns Age in hours
   */
  getAgeInHours(): number {
    if (!this.timestamp) {
      return 0;
    }
    return (Date.now() - this.timestamp.getTime()) / (1000 * 60 * 60);
  }

  /**
   * Checks if the sensor reading is recent
   * @param maxAgeInHours - Maximum age in hours (default: 24)
   * @returns True if reading is recent
   */
  isRecent(maxAgeInHours: number = 24): boolean {
    return this.getAgeInHours() <= maxAgeInHours;
  }

  /**
   * Gets a human-readable status summary
   * @returns Status summary string
   */
  getStatusSummary(): string {
    const parts: string[] = [];

    if (this.soil_moisture !== undefined) {
      parts.push(`${this.soil_moisture.toFixed(1)}% moisture`);
    }

    if (this.soil_temperature !== undefined) {
      parts.push(`${this.soil_temperature.toFixed(1)}°C soil temp`);
    }

    if (this.battery_voltage !== undefined) {
      parts.push(`${this.battery_voltage.toFixed(2)}V battery`);
    }

    if (this.sensor_id) {
      parts.push(`sensor ${this.sensor_id}`);
    }

    return parts.join(', ') || 'No sensor data available';
  }

  /**
   * Serializes the sensor reading instance to a plain object
   * @returns Plain object representation
   */
  toJSON(): Record<string, any> {
    return classToPlain(this, {
      excludeExtraneousValues: false,
      exposeDefaultValues: true,
    });
  }

  /**
   * Creates a SensorReading instance from a plain object
   * @param data - Plain object data
   * @returns SensorReading instance
   */
  static fromJSON(data: Record<string, any>): SensorReading {
    return plainToClass(SensorReading, data, {
      enableImplicitConversion: true,
    });
  }

  /**
   * Creates a SensorReading instance from database row
   * @param row - Database row object
   * @returns SensorReading instance
   */
  static fromDatabaseRow(row: any): SensorReading {
    const reading = new SensorReading();
    reading.id = row.id;
    reading.field_id = row.field_id;
    reading.timestamp = row.timestamp ? new Date(row.timestamp) : new Date();
    reading.soil_moisture = row.soil_moisture;
    reading.soil_temperature = row.soil_temperature;
    reading.battery_voltage = row.battery_voltage;
    reading.sensor_id = row.sensor_id;
    if (row.created_at) reading.created_at = new Date(row.created_at);

    return reading;
  }

  /**
   * Converts SensorReading instance to database row format
   * @returns Database row object
   */
  toDatabaseRow(): Record<string, any> {
    return {
      id: this.id,
      field_id: this.field_id,
      timestamp: this.timestamp?.toISOString(),
      soil_moisture: this.soil_moisture,
      soil_temperature: this.soil_temperature,
      battery_voltage: this.battery_voltage,
      sensor_id: this.sensor_id,
      created_at: this.created_at?.toISOString(),
    };
  }

  /**
   * Creates a sensor reading with current timestamp
   * @param fieldId - Field ID
   * @param sensorId - Sensor identifier
   * @param soilMoisture - Soil moisture percentage
   * @param soilTemperature - Soil temperature in Celsius
   * @param batteryVoltage - Battery voltage
   * @returns SensorReading instance
   */
  static createReading(
    fieldId: number,
    sensorId: string,
    soilMoisture?: number,
    soilTemperature?: number,
    batteryVoltage?: number
  ): SensorReading {
    const reading = new SensorReading({
      field_id: fieldId,
      sensor_id: sensorId,
      timestamp: new Date(),
    });
    if (soilMoisture !== undefined) reading.soil_moisture = soilMoisture;
    if (soilTemperature !== undefined) reading.soil_temperature = soilTemperature;
    if (batteryVoltage !== undefined) reading.battery_voltage = batteryVoltage;
    return reading;
  }
}