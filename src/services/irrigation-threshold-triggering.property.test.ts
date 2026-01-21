import { IrrigationService, SoilData } from './IrrigationService';
import { CropType, GrowthStage } from '../models/types';

// Feature: agrimonitor-lite, Property 9: Irrigation Threshold Triggering
// **Validates: Requirements 4.3, 4.4**

describe('Irrigation Threshold Triggering Property Tests', () => {
  let irrigationService: IrrigationService;

  beforeEach(() => {
    irrigationService = new IrrigationService();
  });

  test('Property 9: Irrigation Threshold - Should trigger irrigation when soil moisture drops below 50% AWC', async () => {
    const testCases = [
      { currentWaterLevel: 60, shouldIrrigate: false },
      { currentWaterLevel: 50, shouldIrrigate: true },
      { currentWaterLevel: 40, shouldIrrigate: true },
      { currentWaterLevel: 30, shouldIrrigate: true },
      { currentWaterLevel: 15, shouldIrrigate: true },
      { currentWaterLevel: 5, shouldIrrigate: true }
    ];

    for (const testCase of testCases) {
      const soilData: SoilData = {
        fieldCapacity: 100,
        wiltingPoint: 20,
        currentMoisture: 20 + (80 * testCase.currentWaterLevel / 100), // Calculate moisture based on AWC percentage
        depth: 30,
        texture: 'loam'
      };

      const recommendation = await irrigationService.generateRecommendation(
        'test-field',
        'wheat',
        'mid_season',
        soilData,
        40.7128,
        -74.0060
      );

      expect(recommendation.shouldIrrigate).toBe(testCase.shouldIrrigate);
      expect(recommendation.currentWaterLevel).toBeCloseTo(testCase.currentWaterLevel, 1);
    }
  });

  test('Property 9: Urgency Levels - Should assign correct urgency based on water level', async () => {
    const testCases = [
      { currentWaterLevel: 60, expectedUrgency: 'low' },
      { currentWaterLevel: 45, expectedUrgency: 'medium' },
      { currentWaterLevel: 25, expectedUrgency: 'high' },
      { currentWaterLevel: 10, expectedUrgency: 'critical' }
    ];

    for (const testCase of testCases) {
      const soilData: SoilData = {
        fieldCapacity: 100,
        wiltingPoint: 20,
        currentMoisture: 20 + (80 * testCase.currentWaterLevel / 100),
        depth: 30,
        texture: 'loam'
      };

      const recommendation = await irrigationService.generateRecommendation(
        'test-field',
        'maize',
        'development',
        soilData,
        40.7128,
        -74.0060
      );

      expect(recommendation.urgency).toBe(testCase.expectedUrgency);
    }
  });

  test('Property 9: Water Amount Calculation - Should calculate appropriate water amounts', async () => {
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 40, // 25% AWC (below 50% threshold)
      depth: 30,
      texture: 'loam'
    };

    const recommendation = await irrigationService.generateRecommendation(
      'test-field',
      'rice',
      'mid_season',
      soilData,
      40.7128,
      -74.0060
    );

    // Should recommend irrigation
    expect(recommendation.shouldIrrigate).toBe(true);

    // Water amount should be reasonable (10-50mm range)
    expect(recommendation.waterAmount).toBeGreaterThanOrEqual(10);
    expect(recommendation.waterAmount).toBeLessThanOrEqual(50);

    // Should account for soil moisture deficit
    expect(recommendation.soilMoistureDeficit).toBeGreaterThan(0);

    // Should have positive crop water requirement
    expect(recommendation.cropWaterRequirement).toBeGreaterThan(0);
  });

  test('Property 9: Consistency - Multiple calls with same inputs should return consistent results', async () => {
    const soilData: SoilData = {
      fieldCapacity: 80,
      wiltingPoint: 15,
      currentMoisture: 35, // ~30% AWC
      depth: 40,
      texture: 'clay'
    };

    const recommendations = [];
    for (let i = 0; i < 5; i++) {
      const recommendation = await irrigationService.generateRecommendation(
        'test-field',
        'cotton',
        'initial',
        soilData,
        35.0,
        -80.0
      );
      recommendations.push(recommendation);
    }

    // All recommendations should have same irrigation decision
    const shouldIrrigate = recommendations[0].shouldIrrigate;
    recommendations.forEach(rec => {
      expect(rec.shouldIrrigate).toBe(shouldIrrigate);
    });

    // All recommendations should have same urgency
    const urgency = recommendations[0].urgency;
    recommendations.forEach(rec => {
      expect(rec.urgency).toBe(urgency);
    });

    // Water amounts should be similar (within 5mm)
    const baseWaterAmount = recommendations[0].waterAmount;
    recommendations.forEach(rec => {
      expect(Math.abs(rec.waterAmount - baseWaterAmount)).toBeLessThanOrEqual(5);
    });
  });

  test('Property 9: Crop-Specific Recommendations - Different crops should have different water requirements', async () => {
    const soilData: SoilData = {
      fieldCapacity: 90,
      wiltingPoint: 25,
      currentMoisture: 45, // ~30% AWC
      depth: 35,
      texture: 'silt'
    };

    const crops: CropType[] = ['wheat', 'rice', 'maize', 'cotton', 'soybean'];
    const recommendations = [];

    for (const crop of crops) {
      const recommendation = await irrigationService.generateRecommendation(
        'test-field',
        crop,
        'mid_season',
        soilData,
        40.0,
        -100.0
      );
      recommendations.push({ crop, recommendation });
    }

    // All should trigger irrigation (below 50% AWC)
    recommendations.forEach(({ recommendation }) => {
      expect(recommendation.shouldIrrigate).toBe(true);
    });

    // Should have different crop water requirements
    const waterRequirements = recommendations.map(r => r.recommendation.cropWaterRequirement);
    const uniqueRequirements = new Set(waterRequirements);
    expect(uniqueRequirements.size).toBeGreaterThan(1);

    // Rice should have higher water requirement than wheat
    const riceRec = recommendations.find(r => r.crop === 'rice')!.recommendation;
    const wheatRec = recommendations.find(r => r.crop === 'wheat')!.recommendation;
    expect(riceRec.cropWaterRequirement).toBeGreaterThan(wheatRec.cropWaterRequirement);
  });

  test('Property 9: Growth Stage Impact - Different growth stages should affect recommendations', async () => {
    const soilData: SoilData = {
      fieldCapacity: 85,
      wiltingPoint: 20,
      currentMoisture: 40, // ~30% AWC
      depth: 30,
      texture: 'loam'
    };

    const stages: GrowthStage[] = ['initial', 'development', 'mid_season', 'late_season'];
    const recommendations = [];

    for (const stage of stages) {
      const recommendation = await irrigationService.generateRecommendation(
        'test-field',
        'maize',
        stage,
        soilData,
        42.0,
        -85.0
      );
      recommendations.push({ stage, recommendation });
    }

    // All should trigger irrigation
    recommendations.forEach(({ recommendation }) => {
      expect(recommendation.shouldIrrigate).toBe(true);
    });

    // Mid-season should have highest water requirement
    const midSeasonRec = recommendations.find(r => r.stage === 'mid_season')!.recommendation;
    const initialRec = recommendations.find(r => r.stage === 'initial')!.recommendation;
    expect(midSeasonRec.cropWaterRequirement).toBeGreaterThan(initialRec.cropWaterRequirement);
  });

  test('Property 9: Soil Texture Impact - Different soil textures should affect water holding capacity', async () => {
    const baseData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 40, // 25% AWC
      depth: 30
    };

    const textures: Array<'clay' | 'loam' | 'sand' | 'silt'> = ['clay', 'loam', 'sand', 'silt'];
    const recommendations = [];

    for (const texture of textures) {
      const soilData: SoilData = { ...baseData, texture };
      const recommendation = await irrigationService.generateRecommendation(
        'test-field',
        'soybean',
        'development',
        soilData,
        39.0,
        -95.0
      );
      recommendations.push({ texture, recommendation });
    }

    // All should trigger irrigation
    recommendations.forEach(({ recommendation }) => {
      expect(recommendation.shouldIrrigate).toBe(true);
    });

    // Should have consistent AWC calculations
    recommendations.forEach(({ recommendation }) => {
      expect(recommendation.availableWaterCapacity).toBe(80); // 100 - 20
      expect(recommendation.currentWaterLevel).toBeCloseTo(25, 1); // (40-20)/80 * 100
    });
  });

  test('Property 9: Reasoning Generation - Should provide meaningful reasoning text', async () => {
    const testCases = [
      {
        soilData: {
          fieldCapacity: 100,
          wiltingPoint: 20,
          currentMoisture: 70, // 62.5% AWC - no irrigation needed
          depth: 30,
          texture: 'loam' as const
        },
        shouldContain: ['adequate', 'monitoring']
      },
      {
        soilData: {
          fieldCapacity: 100,
          wiltingPoint: 20,
          currentMoisture: 30, // 12.5% AWC - critical
          depth: 30,
          texture: 'loam' as const
        },
        shouldContain: ['CRITICAL', 'immediate', 'wilting']
      }
    ];

    for (const testCase of testCases) {
      const recommendation = await irrigationService.generateRecommendation(
        'test-field',
        'wheat',
        'mid_season',
        testCase.soilData,
        40.0,
        -75.0
      );

      // Reasoning should contain expected keywords
      testCase.shouldContain.forEach(keyword => {
        expect(recommendation.reasoning.toLowerCase()).toContain(keyword.toLowerCase());
      });

      // Reasoning should be substantial
      expect(recommendation.reasoning.length).toBeGreaterThan(50);
    }
  });

  test('Property 9: Next Check Date - Should set appropriate next check dates', async () => {
    const testCases = [
      {
        currentMoisture: 70, // No irrigation needed
        expectedDaysAhead: 2
      },
      {
        currentMoisture: 30, // Irrigation needed
        expectedDaysAhead: 1
      }
    ];

    for (const testCase of testCases) {
      const soilData: SoilData = {
        fieldCapacity: 100,
        wiltingPoint: 20,
        currentMoisture: testCase.currentMoisture,
        depth: 30,
        texture: 'loam'
      };

      const recommendation = await irrigationService.generateRecommendation(
        'test-field',
        'cotton',
        'development',
        soilData,
        35.0,
        -80.0
      );

      const daysDifference = Math.round(
        (recommendation.nextCheckDate.getTime() - recommendation.recommendationDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      expect(daysDifference).toBe(testCase.expectedDaysAhead);
    }
  });

  test('Property 9: Soil Data Validation - Should validate soil data inputs', () => {
    const validSoilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 60,
      depth: 30,
      texture: 'loam'
    };

    const invalidCases = [
      { ...validSoilData, fieldCapacity: 15, wiltingPoint: 20 }, // FC <= WP
      { ...validSoilData, currentMoisture: -5 }, // Negative moisture
      { ...validSoilData, currentMoisture: 150 }, // Moisture > FC * 1.2
      { ...validSoilData, depth: 0 }, // Zero depth
      { ...validSoilData, depth: 250 } // Excessive depth
    ];

    // Valid data should pass
    expect(irrigationService.validateSoilData(validSoilData)).toBe(true);

    // Invalid data should fail
    invalidCases.forEach(invalidData => {
      expect(irrigationService.validateSoilData(invalidData)).toBe(false);
    });
  });
});