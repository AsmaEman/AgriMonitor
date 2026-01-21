import 'reflect-metadata';
import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsIn,
  IsNotEmpty,
  Min,
  validate,
  ValidationError,
} from 'class-validator';
import { Transform, plainToClass, classToPlain } from 'class-transformer';
import { BaseModel, RecommendationType, UrgencyLevel } from './types';

export class Recommendation implements BaseModel {
  @IsOptional()
  @IsNumber()
  id?: number;

  @IsNumber()
  field_id!: number;

  @IsString()
  @IsIn(['irrigation', 'fertilization', 'scouting', 'harvesting'])
  recommendation_type!: RecommendationType;

  @IsString()
  @IsIn(['low', 'medium', 'high', 'critical'])
  urgency!: UrgencyLevel;

  @IsString()
  @IsNotEmpty()
  action_text!: string;

  @IsString()
  @IsNotEmpty()
  reasoning!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimated_cost?: number;

  @IsOptional()
  @IsString()
  expected_benefit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount_mm?: number; // For irrigation recommendations

  @IsOptional()
  @IsString()
  timing?: string;

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
  executed?: boolean;

  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  executed_at?: Date;

  constructor(data?: Partial<Recommendation>) {
    if (data) {
      Object.assign(this, data);
      // Set defaults
      if (this.urgency === undefined) {
        this.urgency = 'medium';
      }
      if (this.acknowledged === undefined) {
        this.acknowledged = false;
      }
      if (this.executed === undefined) {
        this.executed = false;
      }
      if (this.generated_at === undefined) {
        this.generated_at = new Date();
      }
    }
  }

  /**
   * Validates the recommendation instance
   * @returns Promise<ValidationError[]> - Array of validation errors, empty if valid
   */
  async validate(): Promise<ValidationError[]> {
    const errors = await validate(this);

    // Custom validation for irrigation-specific fields
    if (this.recommendation_type === 'irrigation') {
      if (this.amount_mm === undefined || this.amount_mm <= 0) {
        const error = new ValidationError();
        error.property = 'amount_mm';
        error.constraints = {
          irrigationAmount: 'Irrigation recommendations must specify amount in mm'
        };
        errors.push(error);
      }
    }

    // Custom validation for acknowledgment logic
    if (this.acknowledged && !this.acknowledged_at) {
      const error = new ValidationError();
      error.property = 'acknowledged_at';
      error.constraints = {
        acknowledgmentTimestamp: 'Acknowledged recommendations must have acknowledgment timestamp'
      };
      errors.push(error);
    }

    // Custom validation for execution logic
    if (this.executed && !this.executed_at) {
      const error = new ValidationError();
      error.property = 'executed_at';
      error.constraints = {
        executionTimestamp: 'Executed recommendations must have execution timestamp'
      };
      errors.push(error);
    }

    // Execution should not happen before acknowledgment
    if (this.executed && this.acknowledged && this.executed_at && this.acknowledged_at) {
      if (this.executed_at < this.acknowledged_at) {
        const error = new ValidationError();
        error.property = 'executed_at';
        error.constraints = {
          executionOrder: 'Execution timestamp cannot be before acknowledgment timestamp'
        };
        errors.push(error);
      }
    }

    return errors;
  }

  /**
   * Acknowledges the recommendation
   */
  acknowledge(): void {
    this.acknowledged = true;
    this.acknowledged_at = new Date();
  }

  /**
   * Marks the recommendation as executed
   */
  markAsExecuted(): void {
    if (!this.acknowledged) {
      this.acknowledge();
    }
    this.executed = true;
    this.executed_at = new Date();
  }

  /**
   * Gets the priority score for sorting recommendations
   * @returns Priority score (higher = more urgent)
   */
  getPriorityScore(): number {
    const urgencyScores = {
      'critical': 100,
      'high': 75,
      'medium': 50,
      'low': 25
    };

    const typeScores = {
      'irrigation': 20,
      'scouting': 15,
      'fertilization': 10,
      'harvesting': 5
    };

    let score = urgencyScores[this.urgency] + typeScores[this.recommendation_type];

    // Boost score for unacknowledged recommendations
    if (!this.acknowledged) {
      score += 10;
    }

    // Reduce score for older recommendations (decay over time)
    if (this.generated_at) {
      const ageInDays = (Date.now() - this.generated_at.getTime()) / (1000 * 60 * 60 * 24);
      score = Math.max(0, score - (ageInDays * 2));
    }

    return score;
  }

  /**
   * Checks if the recommendation is still relevant
   * @param maxAgeInDays - Maximum age in days for relevance (default: 7)
   * @returns True if recommendation is still relevant
   */
  isRelevant(maxAgeInDays: number = 7): boolean {
    if (!this.generated_at) {
      return true; // Assume relevant if no generation date
    }

    const ageInDays = (Date.now() - this.generated_at.getTime()) / (1000 * 60 * 60 * 24);
    return ageInDays <= maxAgeInDays;
  }

  /**
   * Gets the status of the recommendation
   * @returns Status string
   */
  getStatus(): string {
    if (this.executed) {
      return 'Executed';
    }
    if (this.acknowledged) {
      return 'Acknowledged';
    }
    return 'Pending';
  }

  /**
   * Gets a human-readable urgency description
   * @returns Urgency description
   */
  getUrgencyDescription(): string {
    const descriptions = {
      'critical': 'Immediate action required',
      'high': 'Action needed within 24 hours',
      'medium': 'Action needed within 3 days',
      'low': 'Action can be scheduled'
    };

    return descriptions[this.urgency];
  }

  /**
   * Serializes the recommendation instance to a plain object
   * @returns Plain object representation
   */
  toJSON(): Record<string, any> {
    return classToPlain(this, {
      excludeExtraneousValues: false,
      exposeDefaultValues: true,
    });
  }

  /**
   * Creates a Recommendation instance from a plain object
   * @param data - Plain object data
   * @returns Recommendation instance
   */
  static fromJSON(data: Record<string, any>): Recommendation {
    return plainToClass(Recommendation, data, {
      enableImplicitConversion: true,
    });
  }

  /**
   * Creates a Recommendation instance from database row
   * @param row - Database row object
   * @returns Recommendation instance
   */
  static fromDatabaseRow(row: any): Recommendation {
    const recommendation = new Recommendation();
    recommendation.id = row.id;
    recommendation.field_id = row.field_id;
    recommendation.recommendation_type = row.recommendation_type as RecommendationType;
    recommendation.urgency = row.urgency as UrgencyLevel;
    recommendation.action_text = row.action_text;
    recommendation.reasoning = row.reasoning;
    recommendation.estimated_cost = row.estimated_cost;
    recommendation.expected_benefit = row.expected_benefit;
    recommendation.amount_mm = row.amount_mm;
    recommendation.timing = row.timing;
    if (row.generated_at) recommendation.generated_at = new Date(row.generated_at);
    recommendation.acknowledged = Boolean(row.acknowledged);
    if (row.acknowledged_at) recommendation.acknowledged_at = new Date(row.acknowledged_at);
    recommendation.executed = Boolean(row.executed);
    if (row.executed_at) recommendation.executed_at = new Date(row.executed_at);

    return recommendation;
  }

  /**
   * Converts Recommendation instance to database row format
   * @returns Database row object
   */
  toDatabaseRow(): Record<string, any> {
    return {
      id: this.id,
      field_id: this.field_id,
      recommendation_type: this.recommendation_type,
      urgency: this.urgency,
      action_text: this.action_text,
      reasoning: this.reasoning,
      estimated_cost: this.estimated_cost,
      expected_benefit: this.expected_benefit,
      amount_mm: this.amount_mm,
      timing: this.timing,
      generated_at: this.generated_at?.toISOString(),
      acknowledged: this.acknowledged ? 1 : 0,
      acknowledged_at: this.acknowledged_at?.toISOString(),
      executed: this.executed ? 1 : 0,
      executed_at: this.executed_at?.toISOString(),
    };
  }

  /**
   * Creates an irrigation recommendation
   * @param fieldId - Field ID
   * @param amountMm - Irrigation amount in mm
   * @param reasoning - Reasoning for the recommendation
   * @param urgency - Urgency level
   * @returns Irrigation recommendation instance
   */
  static createIrrigationRecommendation(
    fieldId: number,
    amountMm: number,
    reasoning: string,
    urgency: UrgencyLevel = 'medium'
  ): Recommendation {
    return new Recommendation({
      field_id: fieldId,
      recommendation_type: 'irrigation',
      urgency,
      action_text: `Apply ${amountMm}mm of irrigation`,
      reasoning,
      amount_mm: amountMm,
      timing: 'Early morning or evening for best efficiency',
      generated_at: new Date(),
    });
  }

  /**
   * Creates a scouting recommendation
   * @param fieldId - Field ID
   * @param issue - Issue to scout for
   * @param reasoning - Reasoning for the recommendation
   * @param urgency - Urgency level
   * @returns Scouting recommendation instance
   */
  static createScoutingRecommendation(
    fieldId: number,
    issue: string,
    reasoning: string,
    urgency: UrgencyLevel = 'medium'
  ): Recommendation {
    return new Recommendation({
      field_id: fieldId,
      recommendation_type: 'scouting',
      urgency,
      action_text: `Scout field for ${issue}`,
      reasoning,
      timing: 'Within next 2-3 days',
      generated_at: new Date(),
    });
  }
}