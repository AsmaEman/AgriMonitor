import 'reflect-metadata';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsDateString,
  IsIn,
  Min,
  Max,
  IsObject,
  IsNotEmpty,
  validate,
  ValidationError,
} from 'class-validator';
import { Transform, plainToClass, classToPlain } from 'class-transformer';
import { BaseModel, CropType, GrowthStage, GeoJSONPolygon, VALIDATION_CONSTRAINTS } from './types';

export class Field implements BaseModel {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsIn(['wheat', 'rice', 'maize', 'cotton', 'soybean'])
  crop_type!: CropType;

  @IsNumber()
  @Min(VALIDATION_CONSTRAINTS.AREA_MIN)
  area_hectares!: number;

  @IsObject()
  geometry!: GeoJSONPolygon;

  @IsOptional()
  @IsNumber()
  @Min(VALIDATION_CONSTRAINTS.PERCENTAGE_MIN)
  @Max(VALIDATION_CONSTRAINTS.PERCENTAGE_MAX)
  field_capacity?: number;

  @IsOptional()
  @IsNumber()
  @Min(VALIDATION_CONSTRAINTS.PERCENTAGE_MIN)
  @Max(VALIDATION_CONSTRAINTS.PERCENTAGE_MAX)
  wilting_point?: number;

  @IsOptional()
  @IsDateString()
  planting_date?: string;

  @IsOptional()
  @IsString()
  @IsIn(['initial', 'development', 'mid_season', 'late_season'])
  growth_stage?: GrowthStage;

  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  created_at?: Date;

  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  updated_at?: Date;

  constructor(data?: Partial<Field>) {
    if (data) {
      Object.assign(this, data);
    }
  }

  /**
   * Validates the field instance
   * @returns Promise<ValidationError[]> - Array of validation errors, empty if valid
   */
  async validate(): Promise<ValidationError[]> {
    const errors = await validate(this);

    // Custom validation for soil moisture constraints
    if (this.field_capacity !== undefined && this.wilting_point !== undefined) {
      if (this.wilting_point >= this.field_capacity) {
        const error = new ValidationError();
        error.property = 'wilting_point';
        error.constraints = {
          soilMoistureConstraint: 'Wilting point must be less than field capacity'
        };
        errors.push(error);
      }
    }

    // Custom validation for GeoJSON geometry
    if (this.geometry) {
      const geometryErrors = this.validateGeometry();
      errors.push(...geometryErrors);
    }

    return errors;
  }

  /**
   * Validates GeoJSON geometry coordinates
   * @returns ValidationError[] - Array of geometry validation errors
   */
  private validateGeometry(): ValidationError[] {
    const errors: ValidationError[] = [];

    if (!this.geometry || this.geometry.type !== 'Polygon') {
      const error = new ValidationError();
      error.property = 'geometry';
      error.constraints = {
        geometryType: 'Geometry must be a valid GeoJSON Polygon'
      };
      errors.push(error);
      return errors;
    }

    if (!Array.isArray(this.geometry.coordinates) || this.geometry.coordinates.length === 0) {
      const error = new ValidationError();
      error.property = 'geometry';
      error.constraints = {
        geometryCoordinates: 'Geometry coordinates must be a non-empty array'
      };
      errors.push(error);
      return errors;
    }

    // Validate coordinate bounds
    for (const ring of this.geometry.coordinates) {
      if (!Array.isArray(ring)) continue;

      for (const coord of ring) {
        if (!Array.isArray(coord) || coord.length !== 2) continue;

        const [longitude, latitude] = coord;

        if (typeof longitude !== 'number' || typeof latitude !== 'number') {
          const error = new ValidationError();
          error.property = 'geometry';
          error.constraints = {
            coordinateType: 'Coordinates must be numbers'
          };
          errors.push(error);
          continue;
        }

        if (longitude < VALIDATION_CONSTRAINTS.LONGITUDE_MIN || longitude > VALIDATION_CONSTRAINTS.LONGITUDE_MAX) {
          const error = new ValidationError();
          error.property = 'geometry';
          error.constraints = {
            longitudeRange: `Longitude must be between ${VALIDATION_CONSTRAINTS.LONGITUDE_MIN} and ${VALIDATION_CONSTRAINTS.LONGITUDE_MAX}`
          };
          errors.push(error);
        }

        if (latitude < VALIDATION_CONSTRAINTS.LATITUDE_MIN || latitude > VALIDATION_CONSTRAINTS.LATITUDE_MAX) {
          const error = new ValidationError();
          error.property = 'geometry';
          error.constraints = {
            latitudeRange: `Latitude must be between ${VALIDATION_CONSTRAINTS.LATITUDE_MIN} and ${VALIDATION_CONSTRAINTS.LATITUDE_MAX}`
          };
          errors.push(error);
        }
      }
    }

    return errors;
  }

  /**
   * Serializes the field instance to a plain object
   * @returns Plain object representation
   */
  toJSON(): Record<string, any> {
    return classToPlain(this, {
      excludeExtraneousValues: false,
      exposeDefaultValues: true,
    });
  }

  /**
   * Creates a Field instance from a plain object
   * @param data - Plain object data
   * @returns Field instance
   */
  static fromJSON(data: Record<string, any>): Field {
    return plainToClass(Field, data, {
      enableImplicitConversion: true,
    });
  }

  /**
   * Creates a Field instance from database row
   * @param row - Database row object
   * @returns Field instance
   */
  static fromDatabaseRow(row: any): Field {
    const field = new Field();
    field.id = row.id;
    field.name = row.name;
    field.crop_type = row.crop_type as CropType;
    field.area_hectares = row.area_hectares;

    // Parse GeoJSON geometry from string
    try {
      field.geometry = typeof row.geometry === 'string'
        ? JSON.parse(row.geometry)
        : row.geometry;
    } catch (error) {
      throw new Error(`Invalid GeoJSON geometry in database: ${error}`);
    }

    field.field_capacity = row.field_capacity;
    field.wilting_point = row.wilting_point;
    field.planting_date = row.planting_date;
    field.growth_stage = row.growth_stage as GrowthStage;
    if (row.created_at) field.created_at = new Date(row.created_at);
    if (row.updated_at) field.updated_at = new Date(row.updated_at);

    return field;
  }

  /**
   * Converts Field instance to database row format
   * @returns Database row object
   */
  toDatabaseRow(): Record<string, any> {
    return {
      id: this.id,
      name: this.name,
      crop_type: this.crop_type,
      area_hectares: this.area_hectares,
      geometry: JSON.stringify(this.geometry),
      field_capacity: this.field_capacity,
      wilting_point: this.wilting_point,
      planting_date: this.planting_date,
      growth_stage: this.growth_stage || 'initial',
      created_at: this.created_at?.toISOString(),
      updated_at: this.updated_at?.toISOString(),
    };
  }

  /**
   * Gets the center point of the field geometry
   * @returns [longitude, latitude] or null if geometry is invalid
   */
  getCenterPoint(): [number, number] | null {
    if (!this.geometry || !this.geometry.coordinates || this.geometry.coordinates.length === 0) {
      return null;
    }

    const ring = this.geometry.coordinates[0];
    if (!Array.isArray(ring) || ring.length === 0) {
      return null;
    }

    let totalLon = 0;
    let totalLat = 0;
    let count = 0;

    for (const coord of ring) {
      if (Array.isArray(coord) && coord.length === 2) {
        totalLon += coord[0];
        totalLat += coord[1];
        count++;
      }
    }

    if (count === 0) {
      return null;
    }

    return [totalLon / count, totalLat / count];
  }
}