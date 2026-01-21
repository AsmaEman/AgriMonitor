import axios from 'axios';
import { ApiResponse, Field, Alert, IrrigationRecommendation, SatelliteData, WeatherData } from '@/types';

// API Base URL - adjust based on your backend server
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Add response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

// Field API
export const fieldApi = {
  // Get all fields
  getFields: async (): Promise<Field[]> => {
    const response = await api.get<ApiResponse<Field[]>>('/fields');
    return response.data.data;
  },

  // Get field by ID
  getField: async (id: number): Promise<Field> => {
    const response = await api.get<ApiResponse<Field>>(`/fields/${id}`);
    return response.data.data;
  },

  // Create new field
  createField: async (field: Omit<Field, 'id' | 'created_at' | 'updated_at'>): Promise<Field> => {
    const response = await api.post<ApiResponse<Field>>('/fields', field);
    return response.data.data;
  },

  // Update field
  updateField: async (id: number, field: Partial<Field>): Promise<Field> => {
    const response = await api.put<ApiResponse<Field>>(`/fields/${id}`, field);
    return response.data.data;
  },

  // Delete field
  deleteField: async (id: number): Promise<void> => {
    await api.delete(`/fields/${id}`);
  },

  // Get field health
  getFieldHealth: async (id: number): Promise<{ healthScore: number; status: string }> => {
    const response = await api.get<ApiResponse<{ healthScore: number; status: string }>>(`/fields/${id}/health`);
    return response.data.data;
  },
};

// Satellite API
export const satelliteApi = {
  // Process satellite data for field
  processSatelliteData: async (fieldId: number): Promise<SatelliteData> => {
    const response = await api.post<ApiResponse<SatelliteData>>(`/satellite/field/${fieldId}/process`);
    return response.data.data;
  },

  // Get satellite service status
  getStatus: async (): Promise<{ message: string; supportedIndices: string[]; dataSource: string }> => {
    const response = await api.get<ApiResponse<{ message: string; supportedIndices: string[]; dataSource: string }>>('/satellite/summary');
    return response.data.data;
  },
};

// Weather API
export const weatherApi = {
  // Get current weather by coordinates
  getCurrentWeather: async (lat: number, lon: number): Promise<WeatherData> => {
    const response = await api.get<ApiResponse<WeatherData>>(`/weather/current?lat=${lat}&lon=${lon}`);
    return response.data.data;
  },

  // Get weather for field
  getFieldWeather: async (fieldId: number): Promise<WeatherData> => {
    const response = await api.get<ApiResponse<WeatherData>>(`/weather/field/${fieldId}`);
    return response.data.data;
  },

  // Get evapotranspiration for field
  getFieldET: async (fieldId: number): Promise<{ et0: number; fieldId: number; coordinates: { latitude: number; longitude: number }; date: string; dayOfYear: number; unit: string }> => {
    const response = await api.get<ApiResponse<{ et0: number; fieldId: number; coordinates: { latitude: number; longitude: number }; date: string; dayOfYear: number; unit: string }>>(`/weather/field/${fieldId}/evapotranspiration`);
    return response.data.data;
  },

  // Get weather service status
  getStatus: async (): Promise<{ message: string; provider: string; features: string[] }> => {
    const response = await api.get<ApiResponse<{ message: string; provider: string; features: string[] }>>('/weather/status');
    return response.data.data;
  },
};

// Alerts API
export const alertsApi = {
  // Get all alerts
  getAlerts: async (fieldId?: number): Promise<Alert[]> => {
    const url = fieldId ? `/alerts?fieldId=${fieldId}` : '/alerts';
    const response = await api.get<ApiResponse<Alert[]>>(url);
    return response.data.data;
  },

  // Get alerts for specific field
  getFieldAlerts: async (fieldId: number): Promise<Alert[]> => {
    const response = await api.get<ApiResponse<Alert[]>>(`/alerts/field/${fieldId}`);
    return response.data.data;
  },

  // Acknowledge alert
  acknowledgeAlert: async (alertId: string, acknowledgedBy: string): Promise<void> => {
    await api.patch(`/alerts/${alertId}/acknowledge`, { acknowledgedBy });
  },

  // Generate alerts for field
  generateAlerts: async (fieldId: number, options?: { cropType?: string; growthStage?: string; soilData?: any }): Promise<Alert[]> => {
    const response = await api.post<ApiResponse<Alert[]>>(`/alerts/field/${fieldId}/generate`, options);
    return response.data.data;
  },

  // Get alert statistics
  getAlertStats: async (): Promise<{ totalAlerts: number; activeAlerts: number; acknowledgedAlerts: number; alertsByUrgency: Record<string, number>; alertsByType: Record<string, number> }> => {
    const response = await api.get<ApiResponse<{ totalAlerts: number; activeAlerts: number; acknowledgedAlerts: number; alertsByUrgency: Record<string, number>; alertsByType: Record<string, number> }>>('/alerts/stats/summary');
    return response.data.data;
  },
};

// Recommendations API
export const recommendationsApi = {
  // Get irrigation recommendation for field
  getIrrigationRecommendation: async (fieldId: number, options?: { cropType?: string; growthStage?: string; soilData?: any }): Promise<IrrigationRecommendation> => {
    const params = new URLSearchParams();
    if (options?.cropType) params.append('cropType', options.cropType);
    if (options?.growthStage) params.append('growthStage', options.growthStage);
    if (options?.soilData) params.append('soilData', JSON.stringify(options.soilData));

    const url = `/recommendations/irrigation/field/${fieldId}${params.toString() ? '?' + params.toString() : ''}`;
    const response = await api.get<ApiResponse<IrrigationRecommendation>>(url);
    return response.data.data;
  },

  // Get crop types
  getCropTypes: async (): Promise<string[]> => {
    const response = await api.get<ApiResponse<string[]>>('/recommendations/crop-types');
    return response.data.data;
  },

  // Get growth stages
  getGrowthStages: async (): Promise<string[]> => {
    const response = await api.get<ApiResponse<string[]>>('/recommendations/growth-stages');
    return response.data.data;
  },

  // Get crop coefficients
  getCropCoefficients: async (cropType: string): Promise<Record<string, number>> => {
    const response = await api.get<ApiResponse<Record<string, number>>>(`/recommendations/crop-coefficients/${cropType}`);
    return response.data.data;
  },
};

// Health check
export const healthApi = {
  checkHealth: async (): Promise<{ status: string; timestamp: string; version: string; services: Record<string, string> }> => {
    const response = await api.get<{ status: string; timestamp: string; version: string; services: Record<string, string> }>('/health', {
      baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003',
    });
    return response.data;
  },
};

export default api;