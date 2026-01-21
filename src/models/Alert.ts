import 'reflect-metadata';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  validate,
  ValidationError,
} from 'class-validator';
import { Transform, plainToClass, classToPlain } from 'class-transformer';
import { BaseModel, AlertType, SeverityLevel } from './types';

export class Alert implements BaseModel {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsNumber()
  field_id!: number;

  @IsString()
  @IsIn(['health_score', 'ndvi_decline', 'soil_moisture', 'weather', 'sensor'])
  alert_type!: AlertType;

  @IsString()
  @IsIn(['info', 'warning', 'critical'])
  severity!: SeverityLevel;

  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsOptional()
  @IsNumber()
  threshold_value?: number;

  @IsOptional()
  @IsNumber()
  current_value?: number;

  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  generated_at?: Date;

  @IsOptional()
  @IsBoolean()
  acknowledged?: boolean;

  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  acknowledged_at?: Date;

  @IsOptional()
  @IsBoolean()
  resolved?: boolean;

  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  resolved_at?: Date;

  constructor(data?: Partial<Alert>) {
    if (data) {
      Object.assign(this, data);
      // Set defaults
      if (this.severity === undefined) {
        this.severity = 'warning';
      }
      if (this.acknowledged === undefined) {
        this.acknowledged = false;
      }
      if (this.resolved === undefined) {
        this.resolved = false;
      }
      if (this.generated_at === undefined) {
        this.generated_at = new Date();
      }
    }
  }

  /**
   * Validates the alert instance
   * @returns Promise<ValidationError[]> - Array of validation errors, empty if valid
   */
  async validate(): Promise<ValidationError[]> {
    const errors = await validate(this);

    // Custom validation for acknowledgment logic
    if (this.acknowledged && !this.acknowledged_at) {
      const error = new ValidationError();
      error.property = 'acknowledged_at';
      error.constraints = {
        acknowledgmentTimestamp: 'Acknowledged alerts must have acknowledgment timestamp'
      };
      errors.push(error);
    }

    // Custom validation for resolution logic
    if (this.resolved && !this.resolved_at) {
      const error = new ValidationError();
      error.property = 'resolved_at';
      error.constraints = {
        resolutionTimestamp: 'Resolved alerts must have resolution timestamp'
      };
      errors.push(error);
    }

    // Resolution should not happen before acknowledgment
    if (this.resolved && this.acknowledged && this.resolved_at && this.acknowledged_at) {
      if (this.resolved_at < this.acknowledged_at) {
        const error = new ValidationError();
        error.property = 'resolved_at';
        error.constraints = {
          resolutionOrder: 'Resolution timestamp cannot be before acknowledgment timestamp'
        };
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * Acknowledges the alert
   */
  acknowledge(): void {
    this.acknowledged = true;
    this.acknowledged_at = new Date();
  }

  /**
   * Resolves the alert
   */
  resolve(): void {
    if (!this.acknowledged) {
      this.acknowledge();
    }
    this.resolved = true;
    this.resolved_at = new Date();
  }

  /**
   * Gets the priority score for sorting alerts
   * @returns Priority score (higher = more urgent)
   */
  getPriorityScore(): number {
    const severityScores = {
      'critical': 100,
      'warning': 50,
      'info': 25
    };

    const typeScores = {
      'health_score': 20,
      'ndvi_decline': 18,
      'soil_moisture': 15,
      'weather': 10,
      'sensor': 5
    };

    let score = severityScores[this.severity] + typeScores[this.alert_type];

    // Boost score for unacknowledged alerts
    if (!this.acknowledged) {
      score += 25;
    }

    // Reduce score for older alerts (decay over time)
    if (this.generated_at) {
      const ageInHours = (Date.now() - this.generated_at.getTime()) / (1000 * 60 * 60);
      score = Math.max(0, score - (ageInHours * 0.5));
    }

    return score;
  }

  /**
   * Checks if the alert is still active
   * @param maxAgeInHours - Maximum age in hours for active status (default: 24)
   * @returns True if alert is still active
   */
  isActive(maxAgeInHours: number = 24): boolean {
    if (this.resolved) {
      return false;
    }

    if (!this.generated_at) {
      return true; // Assume active if no generation date
    }

    const ageInHours = (Date.now() - this.generated_at.getTime()) / (1000 * 60 * 60);
    return ageInHours <= maxAgeInHours;
  }

  /**
   * Gets the status of the alert
   * @returns Status string
   */
  getStatus(): string {
    if (this.resolved) {
      return 'Resolved';
    }
    if (this.acknowledged) {
      return 'Acknowledged';
    }
    return 'Active';
  }

  /**
   * Gets a human-readable severity description
   * @returns Severity description
   */
  getSeverityDescription(): string {
    const descriptions = {
      'critical': 'Critical - Immediate attention required',
      'warning': 'Warning - Action recommended',
      'info': 'Information - For your awareness'
    };

    return descriptions[this.severity];
  }

  /**
   * Serializes the alert instance to a plain object
   * @returns Plain object representation
   */
  toJSON(): Record<string, any> {
    return classToPlain(this, {
      excludeExtraneousValues: false,
      exposeDefaultValues: true,
    });
  }

  /**
   * Creates an Alert instance from a plain object
   * @param data - Plain object data
   * @returns Alert instance
   */
  static fromJSON(data: Record<string, any>): Alert {
    return plainToClass(Alert, data, {
      enableImplicitConversion: true,
    });
  }

  /**
   * Creates an Alert instance from database row
   * @param row - Database row object
   * @returns Alert instance
   */
  static fromDatabaseRow(row: any): Alert {
    const alert = new Alert();
    alert.id = row.id;
    alert.field_id = row.field_id;
    alert.alert_type = row.alert_type as AlertType;
    alert.severity = row.severity as SeverityLevel;
    alert.title = row.title;
    alert.message = row.message;
    alert.threshold_value = row.threshold_value;
    alert.current_value = row.current_value;
    if (row.generated_at) alert.generated_at = new Date(row.generated_at);
    alert.acknowledged = Boolean(row.acknowledged);
    if (row.acknowledged_at) alert.acknowledged_at = new Date(row.acknowledged_at);
    alert.resolved = Boolean(row.resolved);
    if (row.resolved_at) alert.resolved_at = new Date(row.resolved_at);

    return alert;
  }

  /**
   * Converts Alert instance to database row format
   * @returns Database row object
   */
  toDatabaseRow(): Record<string, any> {
    return {
      id: this.id,
      field_id: this.field_id,
      alert_type: this.alert_type,
      severity: this.severity,
      title: this.title,
      message: this.message,
      threshold_value: this.threshold_value,
      current_value: this.current_value,
      generated_at: this.generated_at?.toISOString(),
      acknowledged: this.acknowledged ? 1 : 0,
      acknowledged_at: this.acknowledged_at?.toISOString(),
      resolved: this.resolved ? 1 : 0,
      resolved_at: this.resolved_at?.toISOString(),
    };
  }

  /**
   * Creates a health score alert
   * @param fieldId - Field ID
   * @param currentScore - Current health score
   * @param threshold - Threshold that was crossed
   * @returns Health score alert instance
   */
  static createHealthScoreAlert(
    fieldId: number,
    currentScore: number,
    threshold: number
  ): Alert {
    const severity: SeverityLevel = currentScore < 20 ? 'critical' : 'warning';

    return new Alert({
      field_id: fieldId,
      alert_type: 'health_score',
      severity,
      title: 'Field Health Score Alert',
      message: `Field health score has dropped to ${currentScore.toFixed(1)}, below the threshold of ${threshold}`,
      threshold_value: threshold,
      current_value: currentScore,
      generated_at: new Date(),
    });
  }

  /**
   * Creates an NDVI decline alert
   * @param fieldId - Field ID
   * @param declinePercentage - Percentage decline in NDVI
   * @param threshold - Threshold percentage
   * @returns NDVI decline alert instance
   */
  static createNDVIDeclineAlert(
    fieldId: number,
    declinePercentage: number,
    threshold: number
  ): Alert {
    const severity: SeverityLevel = declinePercentage > 25 ? 'critical' : 'warning';

    return new Alert({
      field_id: fieldId,
      alert_type: 'ndvi_decline',
      severity,
      title: 'NDVI Decline Detected',
      message: `NDVI has declined by ${declinePercentage.toFixed(1)}% over the past 7 days, exceeding the ${threshold}% threshold`,
      threshold_value: threshold,
      current_value: declinePercentage,
      generated_at: new Date(),
    });
  }

  /**
   * Creates a soil moisture alert
   * @param fieldId - Field ID
   * @param currentMoisture - Current soil moisture percentage
   * @param threshold - Critical moisture threshold
   * @returns Soil moisture alert instance
   */
  static createSoilMoistureAlert(
    fieldId: number,
    currentMoisture: number,
    threshold: number
  ): Alert {
    return new Alert({
      field_id: fieldId,
      alert_type: 'soil_moisture',
      severity: 'critical',
      title: 'Critical Soil Moisture Level',
      message: `Soil moisture has dropped to ${currentMoisture.toFixed(1)}%, below the critical threshold of ${threshold}%`,
      threshold_value: threshold,
      current_value: currentMoisture,
      generated_at: new Date(),
    });
  }
}