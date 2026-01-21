// Common types and enums used across models

export type CropType = 'wheat' | 'rice' | 'maize' | 'cotton' | 'soybean';

export type GrowthStage = 'initial' | 'development' | 'mid_season' | 'late_season';

export type RecommendationType = 'irrigation' | 'fertilization' | 'scouting' | 'harvesting';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export type AlertType = 'health_score' | 'ndvi_decline' | 'soil_moisture' | 'weather' | 'sensor';

export type SeverityLevel = 'info' | 'warning' | 'critical';

// GeoJSON types for field geometry
export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [longitude, latitude]
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // Array of linear rings
}

export interface GeoJSONGeometry {
  type: 'Point' | 'Polygon';
  coordinates: number[] | number[][] | number[][][];
}

// Base interface for all models
export interface BaseModel {
  id?: number;
  created_at?: Date;
  updated_at?: Date;
}

// Validation constraints
export const VALIDATION_CONSTRAINTS = {
  LATITUDE_MIN: -90,
  LATITUDE_MAX: 90,
  LONGITUDE_MIN: -180,
  LONGITUDE_MAX: 180,
  NDVI_MIN: -1,
  NDVI_MAX: 1,
  HEALTH_SCORE_MIN: 0,
  HEALTH_SCORE_MAX: 100,
  PERCENTAGE_MIN: 0,
  PERCENTAGE_MAX: 100,
  AREA_MIN: 0.01, // Minimum field area in hectares
} as const;