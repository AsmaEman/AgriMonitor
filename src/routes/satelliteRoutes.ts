import { Router, Request, Response } from 'express';
import { SatelliteService } from '../services/SatelliteService';
import { FieldService } from '../services/FieldService';
import { asyncHandler, validateRequired, validateNumber } from '../middleware/errorHandler';

const router = Router();
const satelliteService = new SatelliteService();
const fieldService = new FieldService();

/**
 * Satellite Data Routes
 * Base path: /api/satellite
 */

// Process satellite data for a field
router.post('/field/:fieldId/process', asyncHandler(async (req: Request, res: Response) => {
  const { fieldId } = req.params;

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

  // Process satellite data for the field
  const result = await satelliteService.processFieldSatelliteData(field);

  return res.json({
    success: true,
    data: result,
    message: 'Satellite data processing completed'
  });
}));

// Get satellite data summary
router.get('/summary', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      message: 'Satellite service is operational',
      supportedIndices: ['NDVI', 'NDWI', 'GNDVI'],
      dataSource: 'Google Earth Engine (Sentinel-2)'
    }
  });
}));

export default router;