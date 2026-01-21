import { Router, Request, Response } from 'express';
import { IrrigationService } from '../services/IrrigationService';
import { CropCoefficientService } from '../services/CropCoefficientService';
import { FieldService } from '../services/FieldService';
import { asyncHandler, validateRequired, validateNumber, validateString } from '../middleware/errorHandler';
import { CropType, GrowthStage } from '../models/types';

const router = Router();
const irrigationService = new IrrigationService();
const cropCoefficientService = new CropCoefficientService();
const fieldService = new FieldService();

/**
 * Recommendation Routes
 * Base path: /api/recommendations
 */

// Get irrigation recommendation for a field
router.get('/irrigation/field/:fieldId', asyncHandler(async (req: Request, res: Response) => {
  const { fieldId } = req.params;
  const { cropType = 'wheat', growthStage = 'vegetative', soilData } = req.query;

  validateRequired(fieldId, 'fieldId');
  validateNumber(parseInt(fieldId), 'fieldId', 1);

  // Get field data first
  const field = await fieldService.getFieldById(parseInt(fieldId));
  if (!field) {
    return res.status(404).json({
      success: false,
      error: 'Field not found'
    });
  }

  // Default soil data if not provided
  const defaultSoilData = soilData ? JSON.parse(soilData as string) : {
    currentMoisture: 25,
    fieldCapacity: 35,
    wiltingPoint: 15,
    depth: 100,
    soilType: 'loam'
  };

  // Generate irrigation recommendation
  const centerPoint = field.getCenterPoint();
  if (!centerPoint) {
    return res.status(400).json({
      success: false,
      error: 'Invalid field geometry - cannot determine coordinates'
    });
  }

  const [longitude, latitude] = centerPoint;

  const recommendation = await irrigationService.generateRecommendation(
    fieldId,
    cropType as CropType,
    growthStage as GrowthStage,
    defaultSoilData,
    latitude,
    longitude
  );

  return res.json({
    success: true,
    data: recommendation,
    metadata: {
      fieldId: parseInt(fieldId),
      cropType,
      growthStage,
      generatedAt: new Date().toISOString()
    }
  });
}));

// Get crop coefficient for a crop type
router.get('/crop-coefficients/:cropType', asyncHandler(async (req: Request, res: Response) => {
  const { cropType } = req.params;

  validateRequired(cropType, 'cropType');
  validateString(cropType, 'cropType');

  const coefficients = cropCoefficientService.getCropCoefficients(cropType as CropType);

  res.json({
    success: true,
    data: coefficients,
    metadata: {
      cropType
    }
  });
}));

// Get all supported crop types
router.get('/crop-types', asyncHandler(async (_req: Request, res: Response) => {
  const cropTypes = cropCoefficientService.getAvailableCrops();

  res.json({
    success: true,
    data: cropTypes,
    metadata: {
      count: cropTypes.length
    }
  });
}));

// Get growth stages
router.get('/growth-stages', asyncHandler(async (_req: Request, res: Response) => {
  const growthStages = cropCoefficientService.getGrowthStages();

  res.json({
    success: true,
    data: growthStages,
    metadata: {
      stageCount: growthStages.length
    }
  });
}));

// Get crop coefficient statistics
router.get('/stats', asyncHandler(async (_req: Request, res: Response) => {
  const stats = cropCoefficientService.getStatistics();

  res.json({
    success: true,
    data: stats
  });
}));

// Get irrigation timing recommendations
router.get('/irrigation/timing', asyncHandler(async (req: Request, res: Response) => {
  const { season = 'summer' } = req.query;

  const timing = irrigationService.getIrrigationTiming(season as 'spring' | 'summer' | 'fall' | 'winter');

  res.json({
    success: true,
    data: timing,
    metadata: {
      season
    }
  });
}));

// Get recommendation service status
router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      message: 'Recommendation service is operational',
      features: ['Irrigation Recommendations', 'Crop Coefficients', 'Growth Stage Management']
    }
  });
}));

export default router;