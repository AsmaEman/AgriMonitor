import { Router, Request, Response } from 'express';
import { AlertService } from '../services/AlertService';
import { FieldService } from '../services/FieldService';
import { asyncHandler, validateRequired, validateNumber, validateString } from '../middleware/errorHandler';
import { CropType, GrowthStage } from '../models/types';

const router = Router();
const alertService = new AlertService();
const fieldService = new FieldService();

/**
 * Alert Management Routes
 * Base path: /api/alerts
 */

// Get all active alerts
router.get('/', asyncHandler(async (req: Request, res: Response) => {
  const { fieldId } = req.query;

  let alerts;
  if (fieldId) {
    validateNumber(parseInt(fieldId as string), 'fieldId', 1);
    alerts = alertService.getFieldAlerts(fieldId as string, false); // false = only active alerts
  } else {
    alerts = alertService.getActiveAlerts();
  }

  res.json({
    success: true,
    data: alerts,
    metadata: {
      fieldId: fieldId || 'all',
      alertCount: alerts.length
    }
  });
}));

// Get alerts for a specific field
router.get('/field/:fieldId', asyncHandler(async (req: Request, res: Response) => {
  const { fieldId } = req.params;

  validateRequired(fieldId, 'fieldId');
  validateNumber(parseInt(fieldId), 'fieldId', 1);

  const alerts = alertService.getFieldAlerts(fieldId, false); // false = only active alerts

  res.json({
    success: true,
    data: alerts,
    metadata: {
      fieldId: parseInt(fieldId),
      alertCount: alerts.length
    }
  });
}));

// Acknowledge an alert
router.patch('/:alertId/acknowledge', asyncHandler(async (req: Request, res: Response) => {
  const { alertId } = req.params;
  const { acknowledgedBy } = req.body;

  validateRequired(alertId, 'alertId');
  validateRequired(acknowledgedBy, 'acknowledgedBy');
  validateString(acknowledgedBy, 'acknowledgedBy');

  const result = alertService.acknowledgeAlert(alertId, acknowledgedBy);

  if (!result) {
    return res.status(404).json({
      success: false,
      error: 'Alert not found'
    });
  }

  return res.json({
    success: true,
    data: { alertId, acknowledgedBy },
    message: 'Alert acknowledged successfully'
  });
}));

// Get alert statistics
router.get('/stats/summary', asyncHandler(async (_req: Request, res: Response) => {
  const stats = alertService.getAlertStatistics();

  res.json({
    success: true,
    data: stats,
    metadata: {
      generatedAt: new Date().toISOString()
    }
  });
}));

// Generate alerts for a field (trigger alert processing)
router.post('/field/:fieldId/generate', asyncHandler(async (req: Request, res: Response) => {
  const { fieldId } = req.params;
  const { cropType = 'wheat', growthStage = 'vegetative', soilData } = req.body;

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
  const defaultSoilData = soilData || {
    currentMoisture: 25,
    fieldCapacity: 35,
    wiltingPoint: 15,
    soilType: 'loam'
  };

  // Generate alerts for the field
  const centerPoint = field.getCenterPoint();
  if (!centerPoint) {
    return res.status(400).json({
      success: false,
      error: 'Invalid field geometry - cannot determine coordinates'
    });
  }

  const [longitude, latitude] = centerPoint;

  const alerts = await alertService.generateAlerts(
    fieldId,
    cropType as CropType,
    growthStage as GrowthStage,
    defaultSoilData,
    latitude,
    longitude
  );

  return res.json({
    success: true,
    data: alerts,
    message: 'Alerts generated successfully',
    metadata: {
      fieldId: parseInt(fieldId),
      alertsGenerated: alerts.length
    }
  });
}));

// Get alert configuration
router.get('/config', asyncHandler(async (_req: Request, res: Response) => {
  const config = alertService.getConfiguration();

  res.json({
    success: true,
    data: config
  });
}));

// Update alert configuration
router.put('/config', asyncHandler(async (req: Request, res: Response) => {
  const { configuration } = req.body;

  validateRequired(configuration, 'configuration');

  alertService.updateConfiguration(configuration);

  res.json({
    success: true,
    message: 'Alert configuration updated successfully'
  });
}));

// Clear expired alerts
router.delete('/expired', asyncHandler(async (_req: Request, res: Response) => {
  const clearedCount = alertService.clearExpiredAlerts();

  res.json({
    success: true,
    data: { clearedCount },
    message: `Cleared ${clearedCount} expired alerts`
  });
}));

export default router;