import { Request, Response } from 'express';
import { FieldService, FieldCreateData, FieldUpdateData, FieldQueryOptions } from '../services/FieldService';
import { logger } from '../utils/logger';

export class FieldController {
  private fieldService: FieldService;

  constructor() {
    this.fieldService = new FieldService();
  }

  /**
   * Create a new field
   * POST /api/fields
   */
  async createField(req: Request, res: Response): Promise<void> {
    try {
      logger.info('Creating new field', { body: req.body });

      const fieldData: FieldCreateData = req.body;

      // Validate required fields
      if (!fieldData.name || !fieldData.crop_type || !fieldData.area_hectares || !fieldData.geometry) {
        res.status(400).json({
          error: 'Missing required fields',
          message: 'name, crop_type, area_hectares, and geometry are required',
          required_fields: ['name', 'crop_type', 'area_hectares', 'geometry']
        });
        return;
      }

      // Validate crop type
      const validCropTypes = ['wheat', 'rice', 'maize', 'cotton', 'soybean'];
      if (!validCropTypes.includes(fieldData.crop_type)) {
        res.status(400).json({
          error: 'Invalid crop type',
          message: `crop_type must be one of: ${validCropTypes.join(', ')}`,
          provided: fieldData.crop_type
        });
        return;
      }

      // Validate area
      if (typeof fieldData.area_hectares !== 'number' || fieldData.area_hectares <= 0) {
        res.status(400).json({
          error: 'Invalid area',
          message: 'area_hectares must be a positive number',
          provided: fieldData.area_hectares
        });
        return;
      }

      // Validate geometry using service method
      if (!this.fieldService.validateGeoJSONGeometry(fieldData.geometry)) {
        res.status(400).json({
          error: 'Invalid geometry',
          message: 'geometry must be a valid GeoJSON Polygon with coordinates within valid geographic ranges',
          provided_type: fieldData.geometry?.type
        });
        return;
      }

      const field = await this.fieldService.createField(fieldData);

      logger.info('Field created successfully', { fieldId: field.id, name: field.name });

      res.status(201).json({
        success: true,
        message: 'Field created successfully',
        data: field
      });

    } catch (error) {
      logger.error('Error creating field:', error);

      if (error instanceof Error && error.message.includes('validation failed')) {
        res.status(400).json({
          error: 'Validation error',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to create field'
      });
    }
  }

  /**
   * Get all fields with optional filtering and pagination
   * GET /api/fields
   */
  async getFields(req: Request, res: Response): Promise<void> {
    try {
      const options: FieldQueryOptions = {};

      // Parse query parameters
      if (req.query.crop_type && typeof req.query.crop_type === 'string') {
        const validCropTypes = ['wheat', 'rice', 'maize', 'cotton', 'soybean'];
        if (validCropTypes.includes(req.query.crop_type)) {
          options.crop_type = req.query.crop_type as any;
        } else {
          res.status(400).json({
            error: 'Invalid crop_type filter',
            message: `crop_type must be one of: ${validCropTypes.join(', ')}`,
            provided: req.query.crop_type
          });
          return;
        }
      }

      if (req.query.limit) {
        const limit = parseInt(req.query.limit as string);
        if (isNaN(limit) || limit <= 0 || limit > 1000) {
          res.status(400).json({
            error: 'Invalid limit',
            message: 'limit must be a positive integer between 1 and 1000',
            provided: req.query.limit
          });
          return;
        }
        options.limit = limit;
      }

      if (req.query.offset) {
        const offset = parseInt(req.query.offset as string);
        if (isNaN(offset) || offset < 0) {
          res.status(400).json({
            error: 'Invalid offset',
            message: 'offset must be a non-negative integer',
            provided: req.query.offset
          });
          return;
        }
        options.offset = offset;
      }

      if (req.query.sort_by && typeof req.query.sort_by === 'string') {
        const validSortFields = ['name', 'created_at', 'area_hectares'];
        if (validSortFields.includes(req.query.sort_by)) {
          options.sort_by = req.query.sort_by as any;
        } else {
          res.status(400).json({
            error: 'Invalid sort_by field',
            message: `sort_by must be one of: ${validSortFields.join(', ')}`,
            provided: req.query.sort_by
          });
          return;
        }
      }

      if (req.query.sort_order && typeof req.query.sort_order === 'string') {
        const validSortOrders = ['ASC', 'DESC'];
        if (validSortOrders.includes(req.query.sort_order.toUpperCase())) {
          options.sort_order = req.query.sort_order.toUpperCase() as any;
        } else {
          res.status(400).json({
            error: 'Invalid sort_order',
            message: `sort_order must be one of: ${validSortOrders.join(', ')}`,
            provided: req.query.sort_order
          });
          return;
        }
      }

      const fields = await this.fieldService.getFields(options);
      const totalCount = await this.fieldService.getFieldCount(
        options.crop_type ? { crop_type: options.crop_type } : {}
      );

      logger.info('Fields retrieved successfully', {
        count: fields.length,
        totalCount,
        filters: options
      });

      res.status(200).json({
        success: true,
        message: 'Fields retrieved successfully',
        data: fields,
        pagination: {
          total: totalCount,
          count: fields.length,
          limit: options.limit || null,
          offset: options.offset || 0
        }
      });

    } catch (error) {
      logger.error('Error retrieving fields:', error);

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve fields'
      });
    }
  }

  /**
   * Get a specific field by ID
   * GET /api/fields/:id
   */
  async getFieldById(req: Request, res: Response): Promise<void> {
    try {
      const fieldId = parseInt(req.params.id);

      if (isNaN(fieldId) || fieldId <= 0) {
        res.status(400).json({
          error: 'Invalid field ID',
          message: 'Field ID must be a positive integer',
          provided: req.params.id
        });
        return;
      }

      const field = await this.fieldService.getFieldById(fieldId);

      if (!field) {
        res.status(404).json({
          error: 'Field not found',
          message: `Field with ID ${fieldId} does not exist`,
          field_id: fieldId
        });
        return;
      }

      logger.info('Field retrieved successfully', { fieldId: field.id, name: field.name });

      res.status(200).json({
        success: true,
        message: 'Field retrieved successfully',
        data: field
      });

    } catch (error) {
      logger.error('Error retrieving field by ID:', error);

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve field'
      });
    }
  }

  /**
   * Update an existing field
   * PUT /api/fields/:id
   */
  async updateField(req: Request, res: Response): Promise<void> {
    try {
      const fieldId = parseInt(req.params.id);

      if (isNaN(fieldId) || fieldId <= 0) {
        res.status(400).json({
          error: 'Invalid field ID',
          message: 'Field ID must be a positive integer',
          provided: req.params.id
        });
        return;
      }

      const updateData: FieldUpdateData = {
        id: fieldId,
        ...req.body
      };

      // Validate crop type if provided
      if (updateData.crop_type) {
        const validCropTypes = ['wheat', 'rice', 'maize', 'cotton', 'soybean'];
        if (!validCropTypes.includes(updateData.crop_type)) {
          res.status(400).json({
            error: 'Invalid crop type',
            message: `crop_type must be one of: ${validCropTypes.join(', ')}`,
            provided: updateData.crop_type
          });
          return;
        }
      }

      // Validate area if provided
      if (updateData.area_hectares !== undefined) {
        if (typeof updateData.area_hectares !== 'number' || updateData.area_hectares <= 0) {
          res.status(400).json({
            error: 'Invalid area',
            message: 'area_hectares must be a positive number',
            provided: updateData.area_hectares
          });
          return;
        }
      }

      // Validate geometry if provided
      if (updateData.geometry && !this.fieldService.validateGeoJSONGeometry(updateData.geometry)) {
        res.status(400).json({
          error: 'Invalid geometry',
          message: 'geometry must be a valid GeoJSON Polygon with coordinates within valid geographic ranges',
          provided_type: updateData.geometry?.type
        });
        return;
      }

      const updatedField = await this.fieldService.updateField(updateData);

      if (!updatedField) {
        res.status(404).json({
          error: 'Field not found',
          message: `Field with ID ${fieldId} does not exist`,
          field_id: fieldId
        });
        return;
      }

      logger.info('Field updated successfully', { fieldId: updatedField.id, name: updatedField.name });

      res.status(200).json({
        success: true,
        message: 'Field updated successfully',
        data: updatedField
      });

    } catch (error) {
      logger.error('Error updating field:', error);

      if (error instanceof Error && error.message.includes('validation failed')) {
        res.status(400).json({
          error: 'Validation error',
          message: error.message
        });
        return;
      }

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to update field'
      });
    }
  }

  /**
   * Delete a field by ID
   * DELETE /api/fields/:id
   */
  async deleteField(req: Request, res: Response): Promise<void> {
    try {
      const fieldId = parseInt(req.params.id);

      if (isNaN(fieldId) || fieldId <= 0) {
        res.status(400).json({
          error: 'Invalid field ID',
          message: 'Field ID must be a positive integer',
          provided: req.params.id
        });
        return;
      }

      const deleted = await this.fieldService.deleteField(fieldId);

      if (!deleted) {
        res.status(404).json({
          error: 'Field not found',
          message: `Field with ID ${fieldId} does not exist`,
          field_id: fieldId
        });
        return;
      }

      logger.info('Field deleted successfully', { fieldId });

      res.status(200).json({
        success: true,
        message: 'Field deleted successfully',
        field_id: fieldId
      });

    } catch (error) {
      logger.error('Error deleting field:', error);

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to delete field'
      });
    }
  }

  /**
   * Get field health status (placeholder for future implementation)
   * GET /api/fields/:id/health
   */
  async getFieldHealth(req: Request, res: Response): Promise<void> {
    try {
      const fieldId = parseInt(req.params.id);

      if (isNaN(fieldId) || fieldId <= 0) {
        res.status(400).json({
          error: 'Invalid field ID',
          message: 'Field ID must be a positive integer',
          provided: req.params.id
        });
        return;
      }

      // Check if field exists
      const field = await this.fieldService.getFieldById(fieldId);
      if (!field) {
        res.status(404).json({
          error: 'Field not found',
          message: `Field with ID ${fieldId} does not exist`,
          field_id: fieldId
        });
        return;
      }

      // Placeholder response - will be implemented with satellite data processing
      res.status(200).json({
        success: true,
        message: 'Field health status retrieved successfully',
        data: {
          field_id: fieldId,
          field_name: field.name,
          health_score: null,
          ndvi: null,
          ndwi: null,
          gndvi: null,
          last_observation: null,
          status: 'No satellite data available yet'
        }
      });

    } catch (error) {
      logger.error('Error retrieving field health:', error);

      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to retrieve field health status'
      });
    }
  }
}