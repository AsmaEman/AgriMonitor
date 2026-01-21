import { logger } from '../utils/logger';
import { WeatherData } from '../models/WeatherData';
import { dbManager } from '../database';

export interface CurrentWeatherData {
  temperature: number;      // Celsius
  humidity: number;         // Percentage
  precipitation: number;    // mm
  windSpeed: number;        // m/s
  pressure: number;         // hPa
  cloudCover: number;       // Percentage
  timestamp: Date;
}

export interface ForecastData {
  date: string;
  temperature: {
    min: number;
    max: number;
  };
  humidity: number;
  precipitation: number;
  windSpeed: number;
  pressure: number;
  cloudCover: number;
}

export interface WeatherApiResponse {
  current: CurrentWeatherData;
  forecast: ForecastData[];
}

export class WeatherService {
  private readonly apiKey: string;
  private readonly baseUrl = 'https://api.openweathermap.org/data/2.5';
  private cache = new Map<string, { data: any; timestamp: number }>();
  private readonly cacheTimeout = 60 * 60 * 1000; // 1 hour in milliseconds

  private get db() {
    return dbManager.getDatabase();
  }

  constructor() {
    this.apiKey = process.env.OPENWEATHER_API_KEY || 'mock-api-key';
    if (!this.apiKey || this.apiKey === 'mock-api-key') {
      logger.warn('OpenWeatherMap API key not configured, using mock data');
    }
  }

  /**
   * Fetch current weather data for coordinates
   */
  async getCurrentWeather(latitude: number, longitude: number): Promise<CurrentWeatherData> {
    const cacheKey = `current_${latitude}_${longitude}`;

    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      logger.debug('Returning cached current weather data');
      return cached;
    }

    try {
      if (this.apiKey === 'mock-api-key') {
        const weatherData = this.generateMockCurrentWeather(latitude, longitude);
        // Cache the mock data
        this.setCachedData(cacheKey, weatherData);
        return weatherData;
      }

      const url = `${this.baseUrl}/weather?lat=${latitude}&lon=${longitude}&appid=${this.apiKey}&units=metric`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`OpenWeatherMap API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const weatherData = this.parseCurrentWeatherResponse(data);

      // Cache the result
      this.setCachedData(cacheKey, weatherData);

      return weatherData;
    } catch (error) {
      logger.error('Failed to fetch current weather data:', error);
      // Return mock data as fallback
      return this.generateMockCurrentWeather(latitude, longitude);
    }
  }

  /**
   * Fetch 5-day weather forecast for coordinates
   */
  async getForecast(latitude: number, longitude: number): Promise<ForecastData[]> {
    const cacheKey = `forecast_${latitude}_${longitude}`;

    // Check cache first
    const cached = this.getCachedData(cacheKey);
    if (cached) {
      logger.debug('Returning cached forecast data');
      return cached;
    }

    try {
      if (this.apiKey === 'mock-api-key') {
        return this.generateMockForecast();
      }

      const url = `${this.baseUrl}/forecast?lat=${latitude}&lon=${longitude}&appid=${this.apiKey}&units=metric`;
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`OpenWeatherMap API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const forecastData = this.parseForecastResponse(data);

      // Cache the result
      this.setCachedData(cacheKey, forecastData);

      return forecastData;
    } catch (error) {
      logger.error('Failed to fetch forecast data:', error);
      // Return mock data as fallback
      return this.generateMockForecast();
    }
  }

  /**
   * Get weather data for a field using its center coordinates
   */
  async getWeatherForField(fieldId: number): Promise<WeatherApiResponse> {
    // Get field coordinates from database
    const field = await this.db.get('SELECT * FROM fields WHERE id = ?', [fieldId]);
    if (!field) {
      throw new Error(`Field with ID ${fieldId} not found`);
    }

    let geometry;
    try {
      geometry = JSON.parse(field.geometry);
    } catch (error) {
      throw new Error(`Invalid geometry for field ${fieldId}`);
    }

    // Calculate center point
    const centerPoint = this.calculateCenterPoint(geometry);
    if (!centerPoint) {
      throw new Error(`Could not calculate center point for field ${fieldId}`);
    }

    const [longitude, latitude] = centerPoint;

    // Fetch current weather and forecast
    const [current, forecast] = await Promise.all([
      this.getCurrentWeather(latitude, longitude),
      this.getForecast(latitude, longitude)
    ]);

    return { current, forecast };
  }

  /**
   * Store weather data in database
   */
  async storeWeatherData(fieldId: number, weatherData: CurrentWeatherData): Promise<void> {
    const weather = new WeatherData();
    weather.field_id = fieldId;
    weather.date = weatherData.timestamp.toISOString().split('T')[0];
    weather.temperature_avg = weatherData.temperature;
    weather.humidity = weatherData.humidity;
    weather.precipitation = weatherData.precipitation;
    weather.wind_speed = weatherData.windSpeed;

    await this.db.run(
      `INSERT OR REPLACE INTO weather_data 
       (field_id, date, temperature_avg, humidity, precipitation, wind_speed)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        weather.field_id,
        weather.date,
        weather.temperature_avg,
        weather.humidity,
        weather.precipitation,
        weather.wind_speed
      ]
    );
  }

  private parseCurrentWeatherResponse(data: any): CurrentWeatherData {
    return {
      temperature: data.main.temp,
      humidity: data.main.humidity,
      precipitation: data.rain?.['1h'] || data.snow?.['1h'] || 0,
      windSpeed: data.wind.speed,
      pressure: data.main.pressure,
      cloudCover: data.clouds.all,
      timestamp: new Date()
    };
  }

  private parseForecastResponse(data: any): ForecastData[] {
    const dailyForecasts = new Map<string, any>();

    // Group forecasts by date
    data.list.forEach((item: any) => {
      const date = item.dt_txt.split(' ')[0];
      if (!dailyForecasts.has(date)) {
        dailyForecasts.set(date, {
          date,
          temperatures: [],
          humidity: item.main.humidity,
          precipitation: item.rain?.['3h'] || item.snow?.['3h'] || 0,
          windSpeed: item.wind.speed,
          pressure: item.main.pressure,
          cloudCover: item.clouds.all
        });
      }
      dailyForecasts.get(date).temperatures.push(item.main.temp);
    });

    // Convert to forecast format
    return Array.from(dailyForecasts.values()).slice(0, 5).map(day => ({
      date: day.date,
      temperature: {
        min: Math.min(...day.temperatures),
        max: Math.max(...day.temperatures)
      },
      humidity: day.humidity,
      precipitation: day.precipitation,
      windSpeed: day.windSpeed,
      pressure: day.pressure,
      cloudCover: day.cloudCover
    }));
  }

  private generateMockCurrentWeather(latitude?: number, longitude?: number): CurrentWeatherData {
    // Use coordinates as seed for deterministic mock data
    const seed = latitude !== undefined && longitude !== undefined
      ? Math.abs(latitude * 1000 + longitude * 1000) % 1000
      : Math.random() * 1000;

    // Simple deterministic random based on seed
    const deterministicRandom = (offset: number = 0) => {
      return ((seed + offset) * 9301 + 49297) % 233280 / 233280;
    };

    return {
      temperature: 15 + deterministicRandom(1) * 20, // 15-35°C
      humidity: 40 + deterministicRandom(2) * 40,    // 40-80%
      precipitation: deterministicRandom(3) * 10,     // 0-10mm
      windSpeed: deterministicRandom(4) * 15,        // 0-15 m/s
      pressure: 1000 + deterministicRandom(5) * 50,  // 1000-1050 hPa
      cloudCover: deterministicRandom(6) * 100,      // 0-100%
      timestamp: new Date()
    };
  }

  private generateMockForecast(): ForecastData[] {
    const forecast: ForecastData[] = [];
    const today = new Date();

    for (let i = 1; i <= 5; i++) {
      const date = new Date(today);
      date.setDate(today.getDate() + i);

      const baseTemp = 15 + Math.random() * 20;
      forecast.push({
        date: date.toISOString().split('T')[0],
        temperature: {
          min: baseTemp - 5,
          max: baseTemp + 5
        },
        humidity: 40 + Math.random() * 40,
        precipitation: Math.random() * 10,
        windSpeed: Math.random() * 15,
        pressure: 1000 + Math.random() * 50,
        cloudCover: Math.random() * 100
      });
    }

    return forecast;
  }

  private calculateCenterPoint(geometry: any): [number, number] | null {
    if (!geometry || geometry.type !== 'Polygon' || !geometry.coordinates || geometry.coordinates.length === 0) {
      return null;
    }

    const ring = geometry.coordinates[0];
    if (!Array.isArray(ring) || ring.length === 0) {
      return null;
    }

    let totalLon = 0;
    let totalLat = 0;
    let count = 0;

    for (const coord of ring) {
      if (Array.isArray(coord) && coord.length === 2) {
        totalLon += coord[0];
        totalLat += coord[1];
        count++;
      }
    }

    if (count === 0) {
      return null;
    }

    return [totalLon / count, totalLat / count];
  }

  private getCachedData(key: string): any | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }

    // Remove expired cache entry
    if (cached) {
      this.cache.delete(key);
    }

    return null;
  }

  private setCachedData(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Clear expired cache entries
   */
  clearExpiredCache(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clear all cache entries
   */
  clearAllCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }

}