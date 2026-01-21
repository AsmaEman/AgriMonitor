import 'reflect-metadata';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
  Max,
  IsNotEmpty,
  validate,
  ValidationError,
} from 'class-validator';
import { Transform, plainToClass, classToPlain } from 'class-transformer';
import { BaseModel, VALIDATION_CONSTRAINTS } from './types';

export class SatelliteObservation implements BaseModel {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsNumber()
  field_id!: number;

  @IsDateString()
  observation_date!: string;

  @IsNumber()
  @Min(VALIDATION_CONSTRAINTS.NDVI_MIN)
  @Max(VALIDATION_CONSTRAINTS.NDVI_MAX)
  ndvi!: number;

  @IsNumber()
  @Min(VALIDATION_CONSTRAINTS.NDVI_MIN)
  @Max(VALIDATION_CONSTRAINTS.NDVI_MAX)
  ndwi!: number;

  @IsNumber()
  @Min(VALIDATION_CONSTRAINTS.NDVI_MIN)
  @Max(VALIDATION_CONSTRAINTS.NDVI_MAX)
  gndvi!: number;

  @IsNumber()
  @Min(VALIDATION_CONSTRAINTS.HEALTH_SCORE_MIN)
  @Max(VALIDATION_CONSTRAINTS.HEALTH_SCORE_MAX)
  health_score!: number;

  @IsNumber()
  @Min(VALIDATION_CONSTRAINTS.PERCENTAGE_MIN)
  @Max(VALIDATION_CONSTRAINTS.PERCENTAGE_MAX)
  cloud_cover!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  image_source?: string;

  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  created_at?: Date;

  constructor(data?: Partial<SatelliteObservation>) {
    if (data) {
      Object.assign(this, data);
      // Set default image source if not provided
      if (!this.image_source) {
        this.image_source = 'Sentinel-2';
      }
    }
  }

  /**
   * Validates the satellite observation instance
   * @returns Promise<ValidationError[]> - Array of validation errors, empty if valid
   */
  async validate(): Promise<ValidationError[]> {
    const errors = await validate(this);

    // Custom validation for health score calculation
    if (this.ndvi !== undefined && this.ndwi !== undefined && this.gndvi !== undefined && this.health_score !== undefined) {
      const calculatedHealthScore = this.calculateHealthScore();
      const tolerance = 0.01; // Allow small floating point differences

      if (Math.abs(this.health_score - calculatedHealthScore) > tolerance) {
        const error = new ValidationError();
        error.property = 'health_score';
        error.constraints = {
          healthScoreCalculation: `Health score should be calculated as NDVI(40%) + NDWI(30%) + GNDVI(30%). Expected: ${calculatedHealthScore.toFixed(2)}, got: ${this.health_score.toFixed(2)}`
        };
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * Calculates health score using the weighted formula: NDVI (40%) + NDWI (30%) + GNDVI (30%)
   * @returns Calculated health score (0-100)
   */
  calculateHealthScore(): number {
    if (this.ndvi === undefined || this.ndwi === undefined || this.gndvi === undefined) {
      throw new Error('Cannot calculate health score: missing vegetation indices');
    }

    // Normalize indices from [-1, 1] to [0, 1] range
    const normalizedNDVI = (this.ndvi + 1) / 2;
    const normalizedNDWI = (this.ndwi + 1) / 2;
    const normalizedGNDVI = (this.gndvi + 1) / 2;

    // Apply weighted formula and scale to 0-100
    const healthScore = (normalizedNDVI * 0.4 + normalizedNDWI * 0.3 + normalizedGNDVI * 0.3) * 100;

    // Ensure bounds
    return Math.max(0, Math.min(100, healthScore));
  }

  /**
   * Sets the health score using the calculated value
   */
  setCalculatedHealthScore(): void {
    this.health_score = this.calculateHealthScore();
  }

  /**
   * Serializes the satellite observation instance to a plain object
   * @returns Plain object representation
   */
  toJSON(): Record<string, any> {
    return classToPlain(this, {
      excludeExtraneousValues: false,
      exposeDefaultValues: true,
    });
  }

  /**
   * Creates a SatelliteObservation instance from a plain object
   * @param data - Plain object data
   * @returns SatelliteObservation instance
   */
  static fromJSON(data: Record<string, any>): SatelliteObservation {
    return plainToClass(SatelliteObservation, data, {
      enableImplicitConversion: true,
    });
  }

  /**
   * Creates a SatelliteObservation instance from database row
   * @param row - Database row object
   * @returns SatelliteObservation instance
   */
  static fromDatabaseRow(row: any): SatelliteObservation {
    const observation = new SatelliteObservation();
    observation.id = row.id;
    observation.field_id = row.field_id;
    observation.observation_date = row.observation_date;
    observation.ndvi = row.ndvi;
    observation.ndwi = row.ndwi;
    observation.gndvi = row.gndvi;
    observation.health_score = row.health_score;
    observation.cloud_cover = row.cloud_cover;
    observation.image_source = row.image_source || 'Sentinel-2';
    if (row.created_at) observation.created_at = new Date(row.created_at);

    return observation;
  }

  /**
   * Converts SatelliteObservation instance to database row format
   * @returns Database row object
   */
  toDatabaseRow(): Record<string, any> {
    return {
      id: this.id,
      field_id: this.field_id,
      observation_date: this.observation_date,
      ndvi: this.ndvi,
      ndwi: this.ndwi,
      gndvi: this.gndvi,
      health_score: this.health_score,
      cloud_cover: this.cloud_cover,
      image_source: this.image_source || 'Sentinel-2',
      created_at: this.created_at?.toISOString(),
    };
  }

  /**
   * Checks if this observation indicates vegetation stress
   * @param threshold - NDVI threshold below which vegetation is considered stressed (default: 0.3)
   * @returns True if vegetation appears stressed
   */
  isVegetationStressed(threshold: number = 0.3): boolean {
    return this.ndvi < threshold;
  }

  /**
   * Checks if this observation indicates water stress
   * @param threshold - NDWI threshold below which water stress is indicated (default: 0.0)
   * @returns True if water stress is indicated
   */
  isWaterStressed(threshold: number = 0.0): boolean {
    return this.ndwi < threshold;
  }

  /**
   * Gets a human-readable health status based on health score
   * @returns Health status string
   */
  getHealthStatus(): string {
    if (this.health_score >= 80) return 'Excellent';
    if (this.health_score >= 60) return 'Good';
    if (this.health_score >= 40) return 'Fair';
    if (this.health_score >= 20) return 'Poor';
    return 'Critical';
  }
}