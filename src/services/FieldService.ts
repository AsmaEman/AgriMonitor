import { Database } from 'sqlite';
import { Field } from '../models/Field';
import { dbManager } from '../database';
import { logger } from '../utils/logger';
import { CropType, GrowthStage } from '../models/types';

export interface FieldCreateData {
  name: string;
  crop_type: CropType;
  area_hectares: number;
  geometry: any; // GeoJSON polygon
  field_capacity?: number | undefined;
  wilting_point?: number | undefined;
  planting_date?: string | undefined;
  growth_stage?: GrowthStage | undefined;
}

export interface FieldUpdateData extends Partial<FieldCreateData> {
  id: number;
}

export interface FieldQueryOptions {
  crop_type?: CropType;
  limit?: number;
  offset?: number;
  sort_by?: 'name' | 'created_at' | 'area_hectares';
  sort_order?: 'ASC' | 'DESC';
}

export class FieldService {
  private db: Database;

  constructor() {
    this.db = dbManager.getDatabase();
  }

  /**
   * Create a new field with validation
   * @param fieldData - Field creation data
   * @returns Promise<Field> - Created field instance
   * @throws Error if validation fails or database operation fails
   */
  async createField(fieldData: FieldCreateData): Promise<Field> {
    logger.info('Creating new field:', { name: fieldData.name, crop_type: fieldData.crop_type });

    // Create field instance for validation
    const field = new Field({
      ...fieldData,
      created_at: new Date(),
      updated_at: new Date()
    });

    // Validate field data
    const validationErrors = await field.validate();
    if (validationErrors.length > 0) {
      const errorMessages = validationErrors.map(error =>
        Object.values(error.constraints || {}).join(', ')
      ).join('; ');
      throw new Error(`Field validation failed: ${errorMessages}`);
    }

    try {
      // Insert field into database
      const result = await this.db.run(
        `INSERT INTO fields (
          name, crop_type, area_hectares, geometry, field_capacity, 
          wilting_point, planting_date, growth_stage, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          field.name,
          field.crop_type,
          field.area_hectares,
          JSON.stringify(field.geometry),
          field.field_capacity,
          field.wilting_point,
          field.planting_date,
          field.growth_stage || 'initial',
          field.created_at?.toISOString(),
          field.updated_at?.toISOString()
        ]
      );

      if (!result.lastID) {
        throw new Error('Failed to create field: No ID returned');
      }

      // Retrieve and return the created field
      const createdField = await this.getFieldById(result.lastID);
      if (!createdField) {
        throw new Error('Failed to retrieve created field');
      }

      logger.info('Field created successfully:', { id: result.lastID, name: field.name });
      return createdField;

    } catch (error) {
      logger.error('Failed to create field:', error);
      throw new Error(`Failed to create field: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve a field by ID
   * @param id - Field ID
   * @returns Promise<Field | null> - Field instance or null if not found
   */
  async getFieldById(id: number): Promise<Field | null> {
    try {
      const row = await this.db.get(
        'SELECT * FROM fields WHERE id = ?',
        [id]
      );

      if (!row) {
        return null;
      }

      return Field.fromDatabaseRow(row);

    } catch (error) {
      logger.error('Failed to retrieve field by ID:', error);
      throw new Error(`Failed to retrieve field: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve all fields with optional filtering and pagination
   * @param options - Query options for filtering and pagination
   * @returns Promise<Field[]> - Array of field instances
   */
  async getFields(options: FieldQueryOptions = {}): Promise<Field[]> {
    try {
      let query = 'SELECT * FROM fields';
      const params: any[] = [];
      const conditions: string[] = [];

      // Add crop type filter
      if (options.crop_type) {
        conditions.push('crop_type = ?');
        params.push(options.crop_type);
      }

      // Add WHERE clause if conditions exist
      if (conditions.length > 0) {
        query += ' WHERE ' + conditions.join(' AND ');
      }

      // Add sorting
      const sortBy = options.sort_by || 'created_at';
      const sortOrder = options.sort_order || 'DESC';
      query += ` ORDER BY ${sortBy} ${sortOrder}`;

      // Add pagination
      if (options.limit) {
        query += ' LIMIT ?';
        params.push(options.limit);

        if (options.offset) {
          query += ' OFFSET ?';
          params.push(options.offset);
        }
      }

      const rows = await this.db.all(query, params);
      return rows.map(row => Field.fromDatabaseRow(row));

    } catch (error) {
      logger.error('Failed to retrieve fields:', error);
      throw new Error(`Failed to retrieve fields: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an existing field
   * @param updateData - Field update data including ID
   * @returns Promise<Field | null> - Updated field instance or null if not found
   * @throws Error if validation fails or database operation fails
   */
  async updateField(updateData: FieldUpdateData): Promise<Field | null> {
    logger.info('Updating field:', { id: updateData.id });

    // First, get the existing field
    const existingField = await this.getFieldById(updateData.id);
    if (!existingField) {
      return null;
    }

    // Create updated field instance for validation
    const updatedField = new Field({
      ...existingField,
      ...updateData,
      updated_at: new Date()
    });

    // Validate updated field data
    const validationErrors = await updatedField.validate();
    if (validationErrors.length > 0) {
      const errorMessages = validationErrors.map(error =>
        Object.values(error.constraints || {}).join(', ')
      ).join('; ');
      throw new Error(`Field validation failed: ${errorMessages}`);
    }

    try {
      // Build dynamic update query
      const updateFields: string[] = [];
      const params: any[] = [];

      if (updateData.name !== undefined) {
        updateFields.push('name = ?');
        params.push(updateData.name);
      }
      if (updateData.crop_type !== undefined) {
        updateFields.push('crop_type = ?');
        params.push(updateData.crop_type);
      }
      if (updateData.area_hectares !== undefined) {
        updateFields.push('area_hectares = ?');
        params.push(updateData.area_hectares);
      }
      if (updateData.geometry !== undefined) {
        updateFields.push('geometry = ?');
        params.push(JSON.stringify(updateData.geometry));
      }
      if (updateData.field_capacity !== undefined) {
        updateFields.push('field_capacity = ?');
        params.push(updateData.field_capacity);
      }
      if (updateData.wilting_point !== undefined) {
        updateFields.push('wilting_point = ?');
        params.push(updateData.wilting_point);
      }
      if (updateData.planting_date !== undefined) {
        updateFields.push('planting_date = ?');
        params.push(updateData.planting_date);
      }
      if (updateData.growth_stage !== undefined) {
        updateFields.push('growth_stage = ?');
        params.push(updateData.growth_stage);
      }

      // Always update the updated_at timestamp
      updateFields.push('updated_at = ?');
      params.push(updatedField.updated_at?.toISOString());

      // Add ID parameter for WHERE clause
      params.push(updateData.id);

      const query = `UPDATE fields SET ${updateFields.join(', ')} WHERE id = ?`;

      const result = await this.db.run(query, params);

      if (result.changes === 0) {
        return null;
      }

      // Retrieve and return the updated field
      const field = await this.getFieldById(updateData.id);
      logger.info('Field updated successfully:', { id: updateData.id });
      return field;

    } catch (error) {
      logger.error('Failed to update field:', error);
      throw new Error(`Failed to update field: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a field by ID
   * @param id - Field ID
   * @returns Promise<boolean> - True if field was deleted, false if not found
   * @throws Error if database operation fails
   */
  async deleteField(id: number): Promise<boolean> {
    logger.info('Deleting field:', { id });

    try {
      const result = await this.db.run(
        'DELETE FROM fields WHERE id = ?',
        [id]
      );

      const deleted = result.changes! > 0;
      if (deleted) {
        logger.info('Field deleted successfully:', { id });
      } else {
        logger.warn('Field not found for deletion:', { id });
      }

      return deleted;

    } catch (error) {
      logger.error('Failed to delete field:', error);
      throw new Error(`Failed to delete field: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get field count with optional filtering
   * @param options - Query options for filtering
   * @returns Promise<number> - Total count of fields
   */
  async getFieldCount(options: Pick<FieldQueryOptions, 'crop_type'> = {}): Promise<number> {
    try {
      let query = 'SELECT COUNT(*) as count FROM fields';
      const params: any[] = [];

      if (options.crop_type) {
        query += ' WHERE crop_type = ?';
        params.push(options.crop_type);
      }

      const result = await this.db.get(query, params);
      return result?.count || 0;

    } catch (error) {
      logger.error('Failed to get field count:', error);
      throw new Error(`Failed to get field count: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if a field exists by ID
   * @param id - Field ID
   * @returns Promise<boolean> - True if field exists
   */
  async fieldExists(id: number): Promise<boolean> {
    try {
      const result = await this.db.get(
        'SELECT 1 FROM fields WHERE id = ?',
        [id]
      );
      return !!result;

    } catch (error) {
      logger.error('Failed to check field existence:', error);
      throw new Error(`Failed to check field existence: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get fields by crop type
   * @param cropType - Crop type to filter by
   * @returns Promise<Field[]> - Array of fields with specified crop type
   */
  async getFieldsByCropType(cropType: CropType): Promise<Field[]> {
    return this.getFields({ crop_type: cropType });
  }

  /**
   * Validate GeoJSON geometry format
   * @param geometry - GeoJSON geometry object
   * @returns boolean - True if geometry is valid
   */
  validateGeoJSONGeometry(geometry: any): boolean {
    try {
      // Basic GeoJSON polygon validation
      if (!geometry || typeof geometry !== 'object') {
        return false;
      }

      if (geometry.type !== 'Polygon') {
        return false;
      }

      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) {
        return false;
      }

      // Validate coordinate structure
      for (const ring of geometry.coordinates) {
        if (!Array.isArray(ring) || ring.length < 4) {
          return false; // Polygon rings must have at least 4 coordinates
        }

        for (const coord of ring) {
          if (!Array.isArray(coord) || coord.length !== 2) {
            return false;
          }

          const [longitude, latitude] = coord;
          if (typeof longitude !== 'number' || typeof latitude !== 'number') {
            return false;
          }

          // Validate coordinate bounds
          if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
            return false;
          }
        }

        // Check if polygon is closed (first and last coordinates should be the same)
        const firstCoord = ring[0];
        const lastCoord = ring[ring.length - 1];
        if (firstCoord[0] !== lastCoord[0] || firstCoord[1] !== lastCoord[1]) {
          return false;
        }
      }

      return true;

    } catch (error) {
      logger.error('Error validating GeoJSON geometry:', error);
      return false;
    }
  }
}