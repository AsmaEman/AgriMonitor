import { logger } from '../utils/logger';
import { Field } from '../models/Field';
import { SatelliteObservation } from '../models/SatelliteObservation';
import { dbManager } from '../database';

export interface VegetationIndices {
  ndvi: number;
  ndwi: number;
  gndvi: number;
}

export interface SatelliteData {
  fieldId: number;
  observationDate: Date;
  indices: VegetationIndices;
  healthScore: number;
  cloudCover: number;
}

export class SatelliteService {
  private get db() {
    return dbManager.getDatabase();
  }

  /**
   * Calculate NDVI from red and NIR bands
   */
  calculateNDVI(red: number, nir: number): number {
    if (!isFinite(red) || !isFinite(nir) || red + nir === 0) return 0;
    return (nir - red) / (nir + red);
  }

  /**
   * Calculate NDWI from green and NIR bands
   */
  calculateNDWI(green: number, nir: number): number {
    if (!isFinite(green) || !isFinite(nir) || green + nir === 0) return 0;
    return (green - nir) / (green + nir);
  }

  /**
   * Calculate GNDVI from green and NIR bands
   */
  calculateGNDVI(green: number, nir: number): number {
    if (!isFinite(green) || !isFinite(nir) || green + nir === 0) return 0;
    return (nir - green) / (nir + green);
  }

  /**
   * Calculate health score from vegetation indices
   * Formula: NDVI (40%) + NDWI (30%) + GNDVI (30%)
   */
  calculateHealthScore(indices: VegetationIndices): number {
    const { ndvi, ndwi, gndvi } = indices;

    // Handle NaN or invalid values
    if (!isFinite(ndvi) || !isFinite(ndwi) || !isFinite(gndvi)) {
      return 0;
    }

    // Validate indices are within bounds
    if (ndvi < -1 || ndvi > 1 || ndwi < -1 || ndwi > 1 || gndvi < -1 || gndvi > 1) {
      throw new Error('Vegetation indices must be between -1 and 1');
    }

    // Normalize indices to 0-100 scale
    const normalizedNDVI = ((ndvi + 1) / 2) * 100;
    const normalizedNDWI = ((ndwi + 1) / 2) * 100;
    const normalizedGNDVI = ((gndvi + 1) / 2) * 100;

    const healthScore = (normalizedNDVI * 0.4) + (normalizedNDWI * 0.3) + (normalizedGNDVI * 0.3);

    return Math.max(0, Math.min(100, healthScore));
  }

  /**
   * Mock Google Earth Engine integration
   */
  async processFieldSatelliteData(field: Field): Promise<SatelliteData> {
    logger.info('Processing satellite data for field:', { fieldId: field.id, name: field.name });

    const mockIndices = this.generateMockVegetationIndices();
    const healthScore = this.calculateHealthScore(mockIndices);

    const satelliteData: SatelliteData = {
      fieldId: field.id!,
      observationDate: new Date(),
      indices: mockIndices,
      healthScore,
      cloudCover: Math.random() * 20
    };

    await this.storeSatelliteObservation(satelliteData);
    return satelliteData;
  }

  private generateMockVegetationIndices(): VegetationIndices {
    return {
      ndvi: Math.random() * 2 - 1,
      ndwi: Math.random() * 2 - 1,
      gndvi: Math.random() * 2 - 1
    };
  }

  private async storeSatelliteObservation(data: SatelliteData): Promise<void> {
    const observation = new SatelliteObservation();
    observation.field_id = data.fieldId;
    observation.observation_date = data.observationDate.toISOString().split('T')[0];
    observation.ndvi = data.indices.ndvi;
    observation.ndwi = data.indices.ndwi;
    observation.gndvi = data.indices.gndvi;
    observation.health_score = data.healthScore;
    observation.cloud_cover = data.cloudCover;
    observation.image_source = 'Sentinel-2';

    await this.db.run(
      `INSERT OR REPLACE INTO satellite_observations 
       (field_id, observation_date, ndvi, ndwi, gndvi, health_score, cloud_cover, image_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        observation.field_id,
        observation.observation_date,
        observation.ndvi,
        observation.ndwi,
        observation.gndvi,
        observation.health_score,
        observation.cloud_cover,
        observation.image_source
      ]
    );
  }

  async getLatestObservation(fieldId: number): Promise<SatelliteObservation | null> {
    const row = await this.db.get(
      `SELECT * FROM satellite_observations 
       WHERE field_id = ? 
       ORDER BY observation_date DESC 
       LIMIT 1`,
      [fieldId]
    );

    return row ? SatelliteObservation.fromDatabaseRow(row) : null;
  }

  async getObservations(fieldId: number, startDate?: string, endDate?: string): Promise<SatelliteObservation[]> {
    let query = 'SELECT * FROM satellite_observations WHERE field_id = ?';
    const params: any[] = [fieldId];

    if (startDate) {
      query += ' AND observation_date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND observation_date <= ?';
      params.push(endDate);
    }

    query += ' ORDER BY observation_date DESC';

    const rows = await this.db.all(query, params);
    return rows.map(row => SatelliteObservation.fromDatabaseRow(row));
  }
}