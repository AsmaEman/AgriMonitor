import { Router, Request, Response } from 'express';
import { WeatherService } from '../services/WeatherService';
import { EvapotranspirationService } from '../services/EvapotranspirationService';
import { FieldService } from '../services/FieldService';
import { asyncHandler, validateRequired, validateNumber, validateCoordinates } from '../middleware/errorHandler';

const router = Router();
const weatherService = new WeatherService();
const etService = new EvapotranspirationService();
const fieldService = new FieldService();

/**
 * Weather Data Routes
 * Base path: /api/weather
 */

// Get current weather for coordinates
router.get('/current', asyncHandler(async (req: Request, res: Response) => {
  const { lat, lon } = req.query;

  validateRequired(lat, 'latitude');
  validateRequired(lon, 'longitude');

  const latitude = parseFloat(lat as string);
  const longitude = parseFloat(lon as string);

  validateCoordinates(latitude, longitude);

  const weather = await weatherService.getCurrentWeather(latitude, longitude);

  res.json({
    success: true,
    data: weather,
    metadata: {
      coordinates: { latitude, longitude },
      timestamp: new Date().toISOString()
    }
  });
}));

// Get weather data for a field
router.get('/field/:fieldId', asyncHandler(async (req: Request, res: Response) => {
  const { fieldId } = req.params;

  validateRequired(fieldId, 'fieldId');
  validateNumber(parseInt(fieldId), 'fieldId', 1);

  const weatherData = await weatherService.getWeatherForField(parseInt(fieldId));

  res.json({
    success: true,
    data: weatherData,
    metadata: {
      fieldId: parseInt(fieldId),
      timestamp: new Date().toISOString()
    }
  });
}));

// Calculate evapotranspiration for a field
router.get('/field/:fieldId/evapotranspiration', asyncHandler(async (req: Request, res: Response) => {
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

  // Get weather data for the field
  const weatherApiResponse = await weatherService.getWeatherForField(parseInt(fieldId));

  // Get center point coordinates
  const centerPoint = field.getCenterPoint();
  if (!centerPoint) {
    return res.status(400).json({
      success: false,
      error: 'Invalid field geometry - cannot determine coordinates'
    });
  }

  const [longitude, latitude] = centerPoint;

  // Calculate current day of year
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

  // Convert WeatherApiResponse to WeatherDataForET format
  const weatherDataForET = {
    temperatureMax: weatherApiResponse.current.temperature + 5, // Estimate max temp
    temperatureMin: weatherApiResponse.current.temperature - 5, // Estimate min temp
    humidity: weatherApiResponse.current.humidity,
    windSpeed: weatherApiResponse.current.windSpeed,
    pressure: 101.3 // Standard atmospheric pressure in kPa
  };

  // Calculate ET0 using the weather data
  const et0 = etService.calculateET0(weatherDataForET, latitude, dayOfYear);

  return res.json({
    success: true,
    data: {
      et0,
      fieldId: parseInt(fieldId),
      coordinates: { latitude, longitude },
      date: new Date().toISOString(),
      dayOfYear,
      unit: 'mm/day'
    }
  });
}));

// Get weather service status
router.get('/status', asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      message: 'Weather service is operational',
      provider: 'OpenWeatherMap',
      features: ['Current Weather', 'Evapotranspiration Calculation']
    }
  });
}));

export default router;