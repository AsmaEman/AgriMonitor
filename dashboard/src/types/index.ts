// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  metadata?: Record<string, any>;
}

// Field Types
export interface Field {
  id: number;
  name: string;
  crop_type: 'wheat' | 'rice' | 'maize' | 'cotton' | 'soybean';
  area_hectares: number;
  geometry: GeoJSONPolygon;
  field_capacity?: number;
  wilting_point?: number;
  planting_date?: string;
  growth_stage?: 'initial' | 'development' | 'mid_season' | 'late_season';
  created_at?: string;
  updated_at?: string;
}

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

// Satellite Data Types
export interface SatelliteData {
  ndvi: number;
  ndwi: number;
  gndvi: number;
  healthScore: number;
  date: string;
  cloudCover: number;
}

// Weather Data Types
export interface WeatherData {
  temperature: number;
  humidity: number;
  windSpeed: number;
  precipitation: number;
  pressure: number;
  timestamp: string;
}

// Alert Types
export interface Alert {
  id: string;
  fieldId: string;
  type: 'ndvi_decline' | 'soil_moisture_critical' | 'irrigation_needed' | 'weather_warning' | 'pest_risk';
  urgency: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
}

// Recommendation Types
export interface IrrigationRecommendation {
  shouldIrrigate: boolean;
  waterAmount: number;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
  nextCheckDate: string;
  confidence: number;
}

// Chart Data Types
export interface ChartDataPoint {
  x: string | number;
  y: number;
  label?: string;
}

export interface TimeSeriesData {
  date: string;
  ndvi?: number;
  soilMoisture?: number;
  temperature?: number;
  precipitation?: number;
  healthScore?: number;
}