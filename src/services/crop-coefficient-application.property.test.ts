import { CropCoefficientService } from './CropCoefficientService';
import { CropType, GrowthStage } from '../models/types';

// Feature: agrimonitor-lite, Property 10: Crop Coefficient Application
// **Validates: Requirements 4.1**

describe('Crop Coefficient Application Property Tests', () => {
  let cropService: CropCoefficientService;

  beforeEach(() => {
    cropService = new CropCoefficientService();
  });

  test('Property 10: Crop Coefficient Application - All supported crops should have valid coefficients for all growth stages', () => {
    const supportedCrops: CropType[] = ['wheat', 'rice', 'maize', 'cotton', 'soybean'];
    const growthStages: GrowthStage[] = ['initial', 'development', 'mid_season', 'late_season'];

    supportedCrops.forEach(crop => {
      growthStages.forEach(stage => {
        const coefficient = cropService.getCropCoefficient(crop, stage);

        // Coefficient should be valid
        expect(coefficient).toBeGreaterThan(0);
        expect(coefficient).toBeLessThanOrEqual(3.0);
        expect(isFinite(coefficient)).toBe(true);

        // Verify coefficient data exists
        const coefficientData = cropService.getCoefficientData(crop, stage);
        expect(coefficientData).not.toBeNull();
        expect(coefficientData!.cropType).toBe(crop);
        expect(coefficientData!.growthStage).toBe(stage);
        expect(coefficientData!.coefficient).toBe(coefficient);
      });
    });
  });

  test('Property 10: Crop Coefficient Consistency - Getting coefficients multiple times should return same values', () => {
    const testCases = [
      { crop: 'wheat' as CropType, stage: 'mid_season' as GrowthStage },
      { crop: 'rice' as CropType, stage: 'initial' as GrowthStage },
      { crop: 'maize' as CropType, stage: 'development' as GrowthStage },
      { crop: 'cotton' as CropType, stage: 'late_season' as GrowthStage },
      { crop: 'soybean' as CropType, stage: 'mid_season' as GrowthStage }
    ];

    testCases.forEach(({ crop, stage }) => {
      const coefficient1 = cropService.getCropCoefficient(crop, stage);
      const coefficient2 = cropService.getCropCoefficient(crop, stage);
      const coefficient3 = cropService.getCropCoefficient(crop, stage);

      // All calls should return identical values
      expect(coefficient1).toBe(coefficient2);
      expect(coefficient2).toBe(coefficient3);
    });
  });

  test('Property 10: Custom Coefficient Setting - Setting and getting custom coefficients should work correctly', () => {
    const testCases = [
      { crop: 'wheat' as CropType, stage: 'initial' as GrowthStage, newCoeff: 0.5 },
      { crop: 'rice' as CropType, stage: 'mid_season' as GrowthStage, newCoeff: 1.3 },
      { crop: 'maize' as CropType, stage: 'development' as GrowthStage, newCoeff: 0.8 }
    ];

    testCases.forEach(({ crop, stage, newCoeff }) => {
      // Get original coefficient
      const originalCoeff = cropService.getCropCoefficient(crop, stage);

      // Set custom coefficient
      cropService.setCropCoefficient(crop, stage, newCoeff, 'Test coefficient');

      // Verify new coefficient is returned
      const updatedCoeff = cropService.getCropCoefficient(crop, stage);
      expect(updatedCoeff).toBe(newCoeff);
      expect(updatedCoeff).not.toBe(originalCoeff);

      // Verify coefficient data is updated
      const coeffData = cropService.getCoefficientData(crop, stage);
      expect(coeffData!.coefficient).toBe(newCoeff);
      expect(coeffData!.description).toBe('Test coefficient');
    });
  });

  test('Property 10: Coefficient Validation - Invalid coefficients should be rejected', () => {
    const invalidCoefficients = [-0.1, -1, 3.1, 5, NaN, Infinity, -Infinity];

    invalidCoefficients.forEach(invalidCoeff => {
      expect(() => {
        cropService.setCropCoefficient('wheat', 'initial', invalidCoeff);
      }).toThrow();

      // Validation method should also reject invalid values
      expect(cropService.validateCoefficient(invalidCoeff)).toBe(false);
    });

    // Valid coefficients should be accepted
    const validCoefficients = [0, 0.1, 0.5, 1.0, 1.5, 2.0, 3.0];
    validCoefficients.forEach(validCoeff => {
      expect(() => {
        cropService.setCropCoefficient('wheat', 'initial', validCoeff);
      }).not.toThrow();

      expect(cropService.validateCoefficient(validCoeff)).toBe(true);
    });
  });

  test('Property 10: Crop Coefficients Retrieval - Getting all coefficients for a crop should return complete set', () => {
    const supportedCrops: CropType[] = ['wheat', 'rice', 'maize', 'cotton', 'soybean'];

    supportedCrops.forEach(crop => {
      const coefficients = cropService.getCropCoefficients(crop);

      // Should have all growth stages
      expect(coefficients.initial).toBeDefined();
      expect(coefficients.development).toBeDefined();
      expect(coefficients.mid_season).toBeDefined();
      expect(coefficients.late_season).toBeDefined();

      // All coefficients should be valid
      Object.values(coefficients).forEach(coeff => {
        expect(coeff).toBeGreaterThan(0);
        expect(coeff).toBeLessThanOrEqual(3.0);
        expect(isFinite(coeff)).toBe(true);
      });
    });
  });

  test('Property 10: Reset Functionality - Reset should restore default coefficients', () => {
    // Modify some coefficients
    cropService.setCropCoefficient('wheat', 'initial', 0.9);
    cropService.setCropCoefficient('rice', 'mid_season', 1.5);

    // Verify they are changed
    expect(cropService.getCropCoefficient('wheat', 'initial')).toBe(0.9);
    expect(cropService.getCropCoefficient('rice', 'mid_season')).toBe(1.5);

    // Reset to defaults
    cropService.resetToDefaults();

    // Verify original values are restored
    expect(cropService.getCropCoefficient('wheat', 'initial')).toBe(0.4);
    expect(cropService.getCropCoefficient('rice', 'mid_season')).toBe(1.20);
  });

  test('Property 10: Statistics - Statistics should reflect current coefficient state', () => {
    const stats = cropService.getStatistics();

    // Should have coefficients for all supported crops and stages
    expect(stats.totalCoefficients).toBe(20); // 5 crops × 4 stages
    expect(stats.cropCount).toBe(5);
    expect(stats.averageCoefficient).toBeGreaterThan(0);
    expect(stats.averageCoefficient).toBeLessThanOrEqual(3.0);

    // Add a custom coefficient and verify stats update
    cropService.setCropCoefficient('wheat', 'initial', 2.0);
    const updatedStats = cropService.getStatistics();

    // Total count should remain the same (replacement, not addition)
    expect(updatedStats.totalCoefficients).toBe(20);
    expect(updatedStats.cropCount).toBe(5);

    // Average should change due to the new coefficient
    expect(updatedStats.averageCoefficient).not.toBe(stats.averageCoefficient);
  });

  test('Property 10: Available Crops and Stages - Should return correct lists', () => {
    const availableCrops = cropService.getAvailableCrops();
    const growthStages = cropService.getGrowthStages();

    // Verify expected crops
    expect(availableCrops).toEqual(['wheat', 'rice', 'maize', 'cotton', 'soybean']);
    expect(availableCrops.length).toBe(5);

    // Verify expected growth stages
    expect(growthStages).toEqual(['initial', 'development', 'mid_season', 'late_season']);
    expect(growthStages.length).toBe(4);

    // All returned crops should have coefficients
    availableCrops.forEach(crop => {
      growthStages.forEach(stage => {
        const coeff = cropService.getCropCoefficient(crop, stage);
        expect(coeff).toBeGreaterThan(0);
      });
    });
  });
});