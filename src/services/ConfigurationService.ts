import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

export interface DatabaseConfiguration {
  path: string;
  maxConnections: number;
  timeout: number;
  enableWAL: boolean;
  backupInterval: number; // hours
}

export interface APIConfiguration {
  openWeatherMapApiKey: string;
  googleEarthEngineServiceAccount: string;
  rateLimitRequests: number;
  rateLimitWindow: number; // seconds
  requestTimeout: number; // seconds
  retryAttempts: number;
  retryDelay: number; // seconds
}

export interface AlertConfiguration {
  ndviDeclineThreshold: number; // percentage
  ndviDeclineDays: number;
  soilMoistureCriticalLevel: number; // percentage of AWC
  temperatureWarningThreshold: number; // °C
  humidityWarningThreshold: number; // percentage
  windSpeedWarningThreshold: number; // m/s
  enabledAlertTypes: string[];
  alertRetentionDays: number;
}

export interface IrrigationConfiguration {
  defaultIrrigationThreshold: number; // percentage of AWC
  maxIrrigationAmount: number; // mm
  minIrrigationAmount: number; // mm
  irrigationEfficiencyFactors: Record<string, number>;
  soilTextureParameters: Record<string, any>;
}

export interface SystemConfiguration {
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logRetentionDays: number;
  dataRetentionDays: number;
  cacheSize: number; // MB
  cacheTTL: number; // seconds
  enableMetrics: boolean;
  metricsPort: number;
}

export interface AgriMonitorConfiguration {
  database: DatabaseConfiguration;
  api: APIConfiguration;
  alerts: AlertConfiguration;
  irrigation: IrrigationConfiguration;
  system: SystemConfiguration;
  version: string;
  environment: 'development' | 'staging' | 'production';
}

export class ConfigurationService {
  private config: AgriMonitorConfiguration;
  private configPath: string;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private changeListeners: Array<(config: AgriMonitorConfiguration) => void> = [];

  constructor(configPath?: string) {
    this.configPath = configPath || this.getDefaultConfigPath();
    this.config = this.loadConfiguration();
    this.setupHotReloading();
  }

  /**
   * Get current configuration
   */
  getConfiguration(): AgriMonitorConfiguration {
    return { ...this.config };
  }

  /**
   * Get specific configuration section
   */
  getDatabaseConfig(): DatabaseConfiguration {
    return { ...this.config.database };
  }

  getAPIConfig(): APIConfiguration {
    return { ...this.config.api };
  }

  getAlertConfig(): AlertConfiguration {
    return { ...this.config.alerts };
  }

  getIrrigationConfig(): IrrigationConfiguration {
    return { ...this.config.irrigation };
  }

  getSystemConfig(): SystemConfiguration {
    return { ...this.config.system };
  }

  /**
   * Update configuration section
   */
  updateConfiguration(section: keyof AgriMonitorConfiguration, updates: any): void {
    const oldConfig = { ...this.config };

    // Validate updates
    this.validateConfigurationSection(section, updates);

    // Apply updates
    const updatedSection = { ...this.config[section] as any, ...updates };
    this.config = {
      ...this.config,
      [section]: updatedSection
    };

    // Save to file
    this.saveConfiguration();

    // Notify listeners
    this.notifyConfigurationChange(oldConfig, this.config);

    logger.info('Configuration updated', { section, updates });
  }

  /**
   * Reload configuration from file
   */
  reloadConfiguration(): void {
    const oldConfig = { ...this.config };
    this.config = this.loadConfiguration();
    this.notifyConfigurationChange(oldConfig, this.config);
    logger.info('Configuration reloaded from file');
  }

  /**
   * Validate entire configuration
   */
  validateConfiguration(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      // Validate database configuration
      const dbErrors = this.validateDatabaseConfig(this.config.database);
      errors.push(...dbErrors);

      // Validate API configuration
      const apiErrors = this.validateAPIConfig(this.config.api);
      errors.push(...apiErrors);

      // Validate alert configuration
      const alertErrors = this.validateAlertConfig(this.config.alerts);
      errors.push(...alertErrors);

      // Validate irrigation configuration
      const irrigationErrors = this.validateIrrigationConfig(this.config.irrigation);
      errors.push(...irrigationErrors);

      // Validate system configuration
      const systemErrors = this.validateSystemConfig(this.config.system);
      errors.push(...systemErrors);

      return {
        isValid: errors.length === 0,
        errors
      };

    } catch (error: any) {
      errors.push(`Configuration validation failed: ${error.message}`);
      return { isValid: false, errors };
    }
  }

  /**
   * Get configuration schema for validation
   */
  getConfigurationSchema(): any {
    return {
      database: {
        path: { type: 'string', required: true },
        maxConnections: { type: 'number', min: 1, max: 100 },
        timeout: { type: 'number', min: 1000, max: 60000 },
        enableWAL: { type: 'boolean' },
        backupInterval: { type: 'number', min: 1, max: 168 }
      },
      api: {
        openWeatherMapApiKey: { type: 'string', required: true },
        googleEarthEngineServiceAccount: { type: 'string', required: true },
        rateLimitRequests: { type: 'number', min: 1, max: 10000 },
        rateLimitWindow: { type: 'number', min: 1, max: 3600 },
        requestTimeout: { type: 'number', min: 1000, max: 60000 },
        retryAttempts: { type: 'number', min: 0, max: 10 },
        retryDelay: { type: 'number', min: 100, max: 10000 }
      },
      alerts: {
        ndviDeclineThreshold: { type: 'number', min: 5, max: 50 },
        ndviDeclineDays: { type: 'number', min: 1, max: 30 },
        soilMoistureCriticalLevel: { type: 'number', min: 5, max: 50 },
        temperatureWarningThreshold: { type: 'number', min: 20, max: 50 },
        humidityWarningThreshold: { type: 'number', min: 10, max: 80 },
        windSpeedWarningThreshold: { type: 'number', min: 5, max: 50 },
        enabledAlertTypes: { type: 'array', items: { type: 'string' } },
        alertRetentionDays: { type: 'number', min: 1, max: 365 }
      },
      irrigation: {
        defaultIrrigationThreshold: { type: 'number', min: 10, max: 80 },
        maxIrrigationAmount: { type: 'number', min: 10, max: 100 },
        minIrrigationAmount: { type: 'number', min: 1, max: 20 },
        irrigationEfficiencyFactors: { type: 'object' },
        soilTextureParameters: { type: 'object' }
      },
      system: {
        logLevel: { type: 'string', enum: ['debug', 'info', 'warn', 'error'] },
        logRetentionDays: { type: 'number', min: 1, max: 365 },
        dataRetentionDays: { type: 'number', min: 30, max: 1095 },
        cacheSize: { type: 'number', min: 10, max: 1000 },
        cacheTTL: { type: 'number', min: 60, max: 86400 },
        enableMetrics: { type: 'boolean' },
        metricsPort: { type: 'number', min: 1000, max: 65535 }
      }
    };
  }

  /**
   * Add configuration change listener
   */
  addChangeListener(listener: (config: AgriMonitorConfiguration) => void): void {
    this.changeListeners.push(listener);
  }

  /**
   * Remove configuration change listener
   */
  removeChangeListener(listener: (config: AgriMonitorConfiguration) => void): void {
    const index = this.changeListeners.indexOf(listener);
    if (index > -1) {
      this.changeListeners.splice(index, 1);
    }
  }

  /**
   * Export configuration to file
   */
  exportConfiguration(filePath: string): void {
    try {
      const configJson = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(filePath, configJson, 'utf8');
      logger.info('Configuration exported', { filePath });
    } catch (error: any) {
      logger.error('Failed to export configuration', { filePath, error });
      throw new Error(`Failed to export configuration: ${error.message}`);
    }
  }

  /**
   * Import configuration from file
   */
  importConfiguration(filePath: string): void {
    try {
      const configJson = fs.readFileSync(filePath, 'utf8');
      const importedConfig = JSON.parse(configJson);

      // Validate imported configuration
      const validation = this.validateImportedConfiguration(importedConfig);
      if (!validation.isValid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      const oldConfig = { ...this.config };
      this.config = importedConfig;
      this.saveConfiguration();
      this.notifyConfigurationChange(oldConfig, this.config);

      logger.info('Configuration imported', { filePath });
    } catch (error: any) {
      logger.error('Failed to import configuration', { filePath, error });
      throw new Error(`Failed to import configuration: ${error.message}`);
    }
  }

  /**
   * Reset configuration to defaults
   */
  resetToDefaults(): void {
    const oldConfig = { ...this.config };
    this.config = this.getDefaultConfiguration();
    this.saveConfiguration();
    this.notifyConfigurationChange(oldConfig, this.config);
    logger.info('Configuration reset to defaults');
  }

  /**
   * Get configuration statistics
   */
  getConfigurationStatistics(): {
    totalSections: number;
    totalSettings: number;
    lastModified: Date;
    configSize: number;
    isValid: boolean;
  } {
    const validation = this.validateConfiguration();
    let totalSettings = 0;

    Object.values(this.config).forEach(section => {
      if (typeof section === 'object' && section !== null) {
        totalSettings += Object.keys(section).length;
      }
    });

    let lastModified = new Date();
    let configSize = 0;

    try {
      const stats = fs.statSync(this.configPath);
      lastModified = stats.mtime;
      configSize = stats.size;
    } catch (error) {
      // File might not exist yet
    }

    return {
      totalSections: Object.keys(this.config).length,
      totalSettings,
      lastModified,
      configSize,
      isValid: validation.isValid
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    // Stop file watchers
    this.watchers.forEach(watcher => {
      watcher.close();
    });
    this.watchers.clear();

    // Clear listeners
    this.changeListeners = [];

    logger.info('Configuration service cleaned up');
  }

  /**
   * Load configuration from file or environment
   */
  private loadConfiguration(): AgriMonitorConfiguration {
    try {
      // Try to load from file first
      if (fs.existsSync(this.configPath)) {
        const configJson = fs.readFileSync(this.configPath, 'utf8');
        const fileConfig = JSON.parse(configJson);
        return this.mergeWithEnvironment(fileConfig);
      }
    } catch (error) {
      logger.warn('Failed to load configuration from file, using defaults', { error });
    }

    // Fall back to default configuration
    const defaultConfig = this.getDefaultConfiguration();
    return this.mergeWithEnvironment(defaultConfig);
  }

  /**
   * Merge configuration with environment variables
   */
  private mergeWithEnvironment(config: AgriMonitorConfiguration): AgriMonitorConfiguration {
    // Override with environment variables
    if (process.env.OPENWEATHER_API_KEY) {
      config.api.openWeatherMapApiKey = process.env.OPENWEATHER_API_KEY;
    }

    if (process.env.GEE_SERVICE_ACCOUNT) {
      config.api.googleEarthEngineServiceAccount = process.env.GEE_SERVICE_ACCOUNT;
    }

    if (process.env.DATABASE_PATH) {
      config.database.path = process.env.DATABASE_PATH;
    }

    if (process.env.LOG_LEVEL) {
      config.system.logLevel = process.env.LOG_LEVEL as any;
    }

    if (process.env.NODE_ENV) {
      config.environment = process.env.NODE_ENV as any;
    }

    return config;
  }

  /**
   * Get default configuration
   */
  private getDefaultConfiguration(): AgriMonitorConfiguration {
    return {
      database: {
        path: './data/agrimonitor.db',
        maxConnections: 10,
        timeout: 5000,
        enableWAL: true,
        backupInterval: 24
      },
      api: {
        openWeatherMapApiKey: process.env.OPENWEATHER_API_KEY || '',
        googleEarthEngineServiceAccount: process.env.GEE_SERVICE_ACCOUNT || '',
        rateLimitRequests: 1000,
        rateLimitWindow: 3600,
        requestTimeout: 10000,
        retryAttempts: 3,
        retryDelay: 1000
      },
      alerts: {
        ndviDeclineThreshold: 15,
        ndviDeclineDays: 7,
        soilMoistureCriticalLevel: 20,
        temperatureWarningThreshold: 35,
        humidityWarningThreshold: 30,
        windSpeedWarningThreshold: 15,
        enabledAlertTypes: [
          'ndvi_decline',
          'soil_moisture_critical',
          'irrigation_needed',
          'weather_warning'
        ],
        alertRetentionDays: 90
      },
      irrigation: {
        defaultIrrigationThreshold: 50,
        maxIrrigationAmount: 50,
        minIrrigationAmount: 10,
        irrigationEfficiencyFactors: {
          drip: 0.90,
          sprinkler: 0.75,
          flood: 0.60,
          furrow: 0.65
        },
        soilTextureParameters: {
          clay: { infiltrationRate: 5, waterHoldingCapacity: 2.0 },
          loam: { infiltrationRate: 15, waterHoldingCapacity: 1.5 },
          sand: { infiltrationRate: 30, waterHoldingCapacity: 0.8 },
          silt: { infiltrationRate: 10, waterHoldingCapacity: 1.8 }
        }
      },
      system: {
        logLevel: 'info',
        logRetentionDays: 30,
        dataRetentionDays: 365,
        cacheSize: 100,
        cacheTTL: 3600,
        enableMetrics: true,
        metricsPort: 9090
      },
      version: '1.0.0',
      environment: 'development'
    };
  }

  /**
   * Get default configuration file path
   */
  private getDefaultConfigPath(): string {
    return path.join(process.cwd(), 'config', 'agrimonitor.json');
  }

  /**
   * Save configuration to file
   */
  private saveConfiguration(): void {
    try {
      const configDir = path.dirname(this.configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const configJson = JSON.stringify(this.config, null, 2);
      fs.writeFileSync(this.configPath, configJson, 'utf8');
    } catch (error: any) {
      logger.error('Failed to save configuration', { error });
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Setup hot reloading of configuration
   */
  private setupHotReloading(): void {
    try {
      const configDir = path.dirname(this.configPath);

      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const watcher = fs.watch(this.configPath, (eventType) => {
        if (eventType === 'change') {
          logger.info('Configuration file changed, reloading...');
          setTimeout(() => {
            try {
              this.reloadConfiguration();
            } catch (error) {
              logger.error('Failed to reload configuration', { error });
            }
          }, 100); // Small delay to ensure file write is complete
        }
      });

      this.watchers.set(this.configPath, watcher);
      logger.info('Hot reloading enabled for configuration');

    } catch (error) {
      logger.warn('Failed to setup configuration hot reloading', { error });
    }
  }

  /**
   * Notify configuration change listeners
   */
  private notifyConfigurationChange(_oldConfig: AgriMonitorConfiguration, newConfig: AgriMonitorConfiguration): void {
    this.changeListeners.forEach(listener => {
      try {
        listener(newConfig);
      } catch (error) {
        logger.error('Configuration change listener failed', { error });
      }
    });
  }

  /**
   * Validate configuration section
   */
  private validateConfigurationSection(section: keyof AgriMonitorConfiguration, updates: any): void {
    const schema = this.getConfigurationSchema()[section];
    if (!schema) {
      throw new Error(`Unknown configuration section: ${section}`);
    }

    Object.keys(updates).forEach(key => {
      const fieldSchema = schema[key];
      if (!fieldSchema) {
        throw new Error(`Unknown configuration field: ${section}.${key}`);
      }

      const value = updates[key];
      this.validateFieldValue(key, value, fieldSchema);
    });
  }

  /**
   * Validate field value against schema
   */
  private validateFieldValue(fieldName: string, value: any, schema: any): void {
    if (schema.required && (value === undefined || value === null)) {
      throw new Error(`Required field ${fieldName} is missing`);
    }

    if (value !== undefined && value !== null) {
      if (schema.type === 'number') {
        if (typeof value !== 'number' || isNaN(value)) {
          throw new Error(`Field ${fieldName} must be a number`);
        }
        if (schema.min !== undefined && value < schema.min) {
          throw new Error(`Field ${fieldName} must be >= ${schema.min}`);
        }
        if (schema.max !== undefined && value > schema.max) {
          throw new Error(`Field ${fieldName} must be <= ${schema.max}`);
        }
      } else if (schema.type === 'string') {
        if (typeof value !== 'string') {
          throw new Error(`Field ${fieldName} must be a string`);
        }
        if (schema.enum && !schema.enum.includes(value)) {
          throw new Error(`Field ${fieldName} must be one of: ${schema.enum.join(', ')}`);
        }
      } else if (schema.type === 'boolean') {
        if (typeof value !== 'boolean') {
          throw new Error(`Field ${fieldName} must be a boolean`);
        }
      } else if (schema.type === 'array') {
        if (!Array.isArray(value)) {
          throw new Error(`Field ${fieldName} must be an array`);
        }
      } else if (schema.type === 'object') {
        if (typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`Field ${fieldName} must be an object`);
        }
      }
    }
  }

  /**
   * Validate database configuration
   */
  private validateDatabaseConfig(config: DatabaseConfiguration): string[] {
    const errors: string[] = [];

    if (!config.path) {
      errors.push('Database path is required');
    }

    if (config.maxConnections < 1 || config.maxConnections > 100) {
      errors.push('Database maxConnections must be between 1 and 100');
    }

    return errors;
  }

  /**
   * Validate API configuration
   */
  private validateAPIConfig(config: APIConfiguration): string[] {
    const errors: string[] = [];

    // Only require API keys in production environment
    if (this.config.environment === 'production') {
      if (!config.openWeatherMapApiKey) {
        errors.push('OpenWeatherMap API key is required in production');
      }

      if (!config.googleEarthEngineServiceAccount) {
        errors.push('Google Earth Engine service account is required in production');
      }
    }

    return errors;
  }

  /**
   * Validate alert configuration
   */
  private validateAlertConfig(config: AlertConfiguration): string[] {
    const errors: string[] = [];

    if (config.ndviDeclineThreshold < 5 || config.ndviDeclineThreshold > 50) {
      errors.push('NDVI decline threshold must be between 5 and 50 percent');
    }

    return errors;
  }

  /**
   * Validate irrigation configuration
   */
  private validateIrrigationConfig(config: IrrigationConfiguration): string[] {
    const errors: string[] = [];

    if (config.minIrrigationAmount >= config.maxIrrigationAmount) {
      errors.push('Minimum irrigation amount must be less than maximum');
    }

    return errors;
  }

  /**
   * Validate system configuration
   */
  private validateSystemConfig(config: SystemConfiguration): string[] {
    const errors: string[] = [];

    const validLogLevels = ['debug', 'info', 'warn', 'error'];
    if (!validLogLevels.includes(config.logLevel)) {
      errors.push(`Log level must be one of: ${validLogLevels.join(', ')}`);
    }

    return errors;
  }

  /**
   * Validate imported configuration
   */
  private validateImportedConfiguration(config: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required sections
    const requiredSections = ['database', 'api', 'alerts', 'irrigation', 'system'];
    requiredSections.forEach(section => {
      if (!config[section]) {
        errors.push(`Missing required section: ${section}`);
      }
    });

    if (errors.length === 0) {
      // Validate each section
      const dbErrors = this.validateDatabaseConfig(config.database);
      const apiErrors = this.validateAPIConfig(config.api);
      const alertErrors = this.validateAlertConfig(config.alerts);
      const irrigationErrors = this.validateIrrigationConfig(config.irrigation);
      const systemErrors = this.validateSystemConfig(config.system);

      errors.push(...dbErrors, ...apiErrors, ...alertErrors, ...irrigationErrors, ...systemErrors);
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}