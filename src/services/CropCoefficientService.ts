import { logger } from '../utils/logger';
import { CropType, GrowthStage } from '../models/types';

export interface CropCoefficientData {
  cropType: CropType;
  growthStage: GrowthStage;
  coefficient: number;
  description?: string;
}

export class CropCoefficientService {
  private coefficients: Map<string, CropCoefficientData> = new Map();

  constructor() {
    this.initializeDefaultCoefficients();
  }

  /**
   * Initialize FAO-approved crop coefficients
   */
  private initializeDefaultCoefficients(): void {
    const defaultCoefficients: CropCoefficientData[] = [
      // Wheat
      { cropType: 'wheat', growthStage: 'initial', coefficient: 0.4, description: 'Wheat initial stage' },
      { cropType: 'wheat', growthStage: 'development', coefficient: 0.7, description: 'Wheat development stage' },
      { cropType: 'wheat', growthStage: 'mid_season', coefficient: 1.15, description: 'Wheat mid-season stage' },
      { cropType: 'wheat', growthStage: 'late_season', coefficient: 0.4, description: 'Wheat late season stage' },

      // Rice
      { cropType: 'rice', growthStage: 'initial', coefficient: 1.05, description: 'Rice initial stage' },
      { cropType: 'rice', growthStage: 'development', coefficient: 1.10, description: 'Rice development stage' },
      { cropType: 'rice', growthStage: 'mid_season', coefficient: 1.20, description: 'Rice mid-season stage' },
      { cropType: 'rice', growthStage: 'late_season', coefficient: 0.90, description: 'Rice late season stage' },

      // Maize
      { cropType: 'maize', growthStage: 'initial', coefficient: 0.3, description: 'Maize initial stage' },
      { cropType: 'maize', growthStage: 'development', coefficient: 0.7, description: 'Maize development stage' },
      { cropType: 'maize', growthStage: 'mid_season', coefficient: 1.20, description: 'Maize mid-season stage' },
      { cropType: 'maize', growthStage: 'late_season', coefficient: 0.6, description: 'Maize late season stage' },

      // Cotton
      { cropType: 'cotton', growthStage: 'initial', coefficient: 0.35, description: 'Cotton initial stage' },
      { cropType: 'cotton', growthStage: 'development', coefficient: 0.75, description: 'Cotton development stage' },
      { cropType: 'cotton', growthStage: 'mid_season', coefficient: 1.15, description: 'Cotton mid-season stage' },
      { cropType: 'cotton', growthStage: 'late_season', coefficient: 0.8, description: 'Cotton late season stage' },

      // Soybean
      { cropType: 'soybean', growthStage: 'initial', coefficient: 0.4, description: 'Soybean initial stage' },
      { cropType: 'soybean', growthStage: 'development', coefficient: 0.8, description: 'Soybean development stage' },
      { cropType: 'soybean', growthStage: 'mid_season', coefficient: 1.15, description: 'Soybean mid-season stage' },
      { cropType: 'soybean', growthStage: 'late_season', coefficient: 0.5, description: 'Soybean late season stage' }
    ];

    defaultCoefficients.forEach(coeff => {
      const key = this.getCoefficientKey(coeff.cropType, coeff.growthStage);
      this.coefficients.set(key, coeff);
    });

    logger.info('Initialized crop coefficients', { count: defaultCoefficients.length });
  }

  /**
   * Get crop coefficient for specific crop and growth stage
   */
  getCropCoefficient(cropType: CropType, growthStage: GrowthStage): number {
    const key = this.getCoefficientKey(cropType, growthStage);
    const coefficient = this.coefficients.get(key);

    if (!coefficient) {
      logger.warn('Crop coefficient not found, using default', { cropType, growthStage });
      return 1.0; // Default coefficient
    }

    return coefficient.coefficient;
  }

  /**
   * Set custom crop coefficient
   */
  setCropCoefficient(cropType: CropType, growthStage: GrowthStage, coefficient: number, description?: string): void {
    if (!this.validateCoefficient(coefficient)) {
      throw new Error('Crop coefficient must be between 0 and 3.0 and be a finite number');
    }

    const key = this.getCoefficientKey(cropType, growthStage);
    const coefficientData: CropCoefficientData = {
      cropType,
      growthStage,
      coefficient,
      description: description || `Custom coefficient for ${cropType} ${growthStage}`
    };

    this.coefficients.set(key, coefficientData);
    logger.info('Set custom crop coefficient', { cropType, growthStage, coefficient });
  }

  /**
   * Get all coefficients for a crop
   */
  getCropCoefficients(cropType: CropType): Record<GrowthStage, number> {
    const stages: GrowthStage[] = ['initial', 'development', 'mid_season', 'late_season'];
    const result = {} as Record<GrowthStage, number>;

    stages.forEach(stage => {
      result[stage] = this.getCropCoefficient(cropType, stage);
    });

    return result;
  }

  /**
   * Get coefficient data with metadata
   */
  getCoefficientData(cropType: CropType, growthStage: GrowthStage): CropCoefficientData | null {
    const key = this.getCoefficientKey(cropType, growthStage);
    return this.coefficients.get(key) || null;
  }

  /**
   * Get all available crop types
   */
  getAvailableCrops(): CropType[] {
    return ['wheat', 'rice', 'maize', 'cotton', 'soybean'];
  }

  /**
   * Get all growth stages
   */
  getGrowthStages(): GrowthStage[] {
    return ['initial', 'development', 'mid_season', 'late_season'];
  }

  /**
   * Validate crop coefficient value
   */
  validateCoefficient(coefficient: number): boolean {
    return coefficient >= 0 && coefficient <= 3.0 && isFinite(coefficient);
  }

  /**
   * Reset to default coefficients
   */
  resetToDefaults(): void {
    this.coefficients.clear();
    this.initializeDefaultCoefficients();
    logger.info('Reset crop coefficients to defaults');
  }

  /**
   * Get coefficient statistics
   */
  getStatistics(): { totalCoefficients: number; cropCount: number; averageCoefficient: number } {
    const coefficientValues = Array.from(this.coefficients.values()).map(c => c.coefficient);
    const uniqueCrops = new Set(Array.from(this.coefficients.values()).map(c => c.cropType));

    return {
      totalCoefficients: coefficientValues.length,
      cropCount: uniqueCrops.size,
      averageCoefficient: coefficientValues.reduce((sum, val) => sum + val, 0) / coefficientValues.length
    };
  }

  private getCoefficientKey(cropType: CropType, growthStage: GrowthStage): string {
    return `${cropType}_${growthStage}`;
  }
}