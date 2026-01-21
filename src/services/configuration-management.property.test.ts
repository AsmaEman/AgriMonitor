import { ConfigurationService, AgriMonitorConfiguration } from './ConfigurationService';
import * as fs from 'fs';
import * as path from 'path';

// Feature: agrimonitor-lite, Property 15: Configuration Management
// **Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5**

describe('Configuration Management Property Tests', () => {
  let configService: ConfigurationService;
  let tempConfigPath: string;

  beforeEach(() => {
    // Create temporary config file path
    tempConfigPath = path.join(__dirname, '..', '..', 'temp', `test-config-${Date.now()}.json`);
    const tempDir = path.dirname(tempConfigPath);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    configService = new ConfigurationService(tempConfigPath);
  });

  afterEach(() => {
    // Cleanup
    configService.cleanup();

    if (fs.existsSync(tempConfigPath)) {
      fs.unlinkSync(tempConfigPath);
    }
  });

  test('Property 15: Configuration Loading - Should load configuration from file and environment', () => {
    const config = configService.getConfiguration();

    // Should have all required sections
    expect(config.database).toBeDefined();
    expect(config.api).toBeDefined();
    expect(config.alerts).toBeDefined();
    expect(config.irrigation).toBeDefined();
    expect(config.system).toBeDefined();
    expect(config.version).toBeDefined();
    expect(config.environment).toBeDefined();

    // Database configuration should have required fields
    expect(config.database.path).toBeDefined();
    expect(typeof config.database.maxConnections).toBe('number');
    expect(typeof config.database.timeout).toBe('number');
    expect(typeof config.database.enableWAL).toBe('boolean');

    // API configuration should have required fields
    expect(typeof config.api.rateLimitRequests).toBe('number');
    expect(typeof config.api.rateLimitWindow).toBe('number');
    expect(typeof config.api.requestTimeout).toBe('number');

    // Alert configuration should have required fields
    expect(typeof config.alerts.ndviDeclineThreshold).toBe('number');
    expect(typeof config.alerts.soilMoistureCriticalLevel).toBe('number');
    expect(Array.isArray(config.alerts.enabledAlertTypes)).toBe(true);

    // System configuration should have required fields
    expect(['debug', 'info', 'warn', 'error']).toContain(config.system.logLevel);
    expect(typeof config.system.enableMetrics).toBe('boolean');
  });

  test('Property 15: Configuration Validation - Should validate configuration values and ranges', () => {
    const validation = configService.validateConfiguration();

    // Default configuration should be valid
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toEqual([]);

    // Test invalid updates
    const invalidUpdates = [
      {
        section: 'database' as const,
        updates: { maxConnections: -1 },
        expectedError: 'Field maxConnections must be >= 1'
      },
      {
        section: 'database' as const,
        updates: { maxConnections: 150 },
        expectedError: 'Field maxConnections must be <= 100'
      },
      {
        section: 'system' as const,
        updates: { logLevel: 'invalid' },
        expectedError: 'must be one of'
      },
      {
        section: 'alerts' as const,
        updates: { ndviDeclineThreshold: 100 },
        expectedError: 'Field ndviDeclineThreshold must be <= 50'
      }
    ];

    invalidUpdates.forEach(({ section, updates }) => {
      expect(() => {
        configService.updateConfiguration(section, updates);
      }).toThrow();
    });
  });

  test('Property 15: Configuration Updates - Should properly update and persist configuration changes', () => {
    const originalConfig = configService.getConfiguration();

    // Update database configuration
    const dbUpdates = {
      maxConnections: 20,
      timeout: 8000,
      enableWAL: false
    };

    configService.updateConfiguration('database', dbUpdates);

    const updatedConfig = configService.getConfiguration();

    // Verify updates were applied
    expect(updatedConfig.database.maxConnections).toBe(20);
    expect(updatedConfig.database.timeout).toBe(8000);
    expect(updatedConfig.database.enableWAL).toBe(false);

    // Verify other sections unchanged
    expect(updatedConfig.api).toEqual(originalConfig.api);
    expect(updatedConfig.alerts).toEqual(originalConfig.alerts);

    // Verify configuration was persisted to file
    expect(fs.existsSync(tempConfigPath)).toBe(true);

    const fileContent = fs.readFileSync(tempConfigPath, 'utf8');
    const savedConfig = JSON.parse(fileContent);

    expect(savedConfig.database.maxConnections).toBe(20);
    expect(savedConfig.database.timeout).toBe(8000);
    expect(savedConfig.database.enableWAL).toBe(false);
  });

  test.skip('Property 15: Hot Reloading - Should detect and reload configuration file changes', (done) => {
    let changeDetected = false;

    // Add change listener
    const changeListener = (config: AgriMonitorConfiguration) => {
      if (!changeDetected) {
        changeDetected = true;

        // Verify the change was applied
        expect(config.system.logLevel).toBe('debug');
        expect(config.system.cacheSize).toBe(200);

        done();
      }
    };

    configService.addChangeListener(changeListener);

    // Modify configuration file directly
    setTimeout(() => {
      const currentConfig = configService.getConfiguration();
      currentConfig.system.logLevel = 'debug';
      currentConfig.system.cacheSize = 200;

      fs.writeFileSync(tempConfigPath, JSON.stringify(currentConfig, null, 2));
    }, 100);
  }, 5000);

  test('Property 15: Configuration Sections - Should provide access to specific configuration sections', () => {
    const dbConfig = configService.getDatabaseConfig();
    const apiConfig = configService.getAPIConfig();
    const alertConfig = configService.getAlertConfig();
    const irrigationConfig = configService.getIrrigationConfig();
    const systemConfig = configService.getSystemConfig();

    // Each section should be properly typed and contain expected fields
    expect(typeof dbConfig.path).toBe('string');
    expect(typeof dbConfig.maxConnections).toBe('number');

    expect(typeof apiConfig.rateLimitRequests).toBe('number');
    expect(typeof apiConfig.requestTimeout).toBe('number');

    expect(typeof alertConfig.ndviDeclineThreshold).toBe('number');
    expect(Array.isArray(alertConfig.enabledAlertTypes)).toBe(true);

    expect(typeof irrigationConfig.defaultIrrigationThreshold).toBe('number');
    expect(typeof irrigationConfig.irrigationEfficiencyFactors).toBe('object');

    expect(['debug', 'info', 'warn', 'error']).toContain(systemConfig.logLevel);
    expect(typeof systemConfig.enableMetrics).toBe('boolean');

    // Sections should be independent copies (not references)
    dbConfig.maxConnections = 999;
    const dbConfig2 = configService.getDatabaseConfig();
    expect(dbConfig2.maxConnections).not.toBe(999);
  });

  test('Property 15: Configuration Schema - Should provide accurate configuration schema', () => {
    const schema = configService.getConfigurationSchema();

    // Schema should define all sections
    expect(schema.database).toBeDefined();
    expect(schema.api).toBeDefined();
    expect(schema.alerts).toBeDefined();
    expect(schema.irrigation).toBeDefined();
    expect(schema.system).toBeDefined();

    // Database schema should have proper field definitions
    expect(schema.database.path.type).toBe('string');
    expect(schema.database.path.required).toBe(true);
    expect(schema.database.maxConnections.type).toBe('number');
    expect(schema.database.maxConnections.min).toBe(1);
    expect(schema.database.maxConnections.max).toBe(100);

    // System schema should have enum validation
    expect(schema.system.logLevel.type).toBe('string');
    expect(schema.system.logLevel.enum).toEqual(['debug', 'info', 'warn', 'error']);

    // Alert schema should have proper ranges
    expect(schema.alerts.ndviDeclineThreshold.min).toBe(5);
    expect(schema.alerts.ndviDeclineThreshold.max).toBe(50);
  });

  test('Property 15: Configuration Export/Import - Should export and import configuration correctly', () => {
    const exportPath = path.join(path.dirname(tempConfigPath), `export-${Date.now()}.json`);

    try {
      // Modify configuration
      configService.updateConfiguration('database', { maxConnections: 25 });
      configService.updateConfiguration('system', { logLevel: 'debug' });

      // Export configuration
      configService.exportConfiguration(exportPath);
      expect(fs.existsSync(exportPath)).toBe(true);

      // Create new service instance
      const newConfigPath = path.join(path.dirname(tempConfigPath), `import-${Date.now()}.json`);
      const newConfigService = new ConfigurationService(newConfigPath);

      // Import configuration
      newConfigService.importConfiguration(exportPath);

      const importedConfig = newConfigService.getConfiguration();

      // Verify imported configuration matches exported
      expect(importedConfig.database.maxConnections).toBe(25);
      expect(importedConfig.system.logLevel).toBe('debug');

      newConfigService.cleanup();

      // Cleanup
      if (fs.existsSync(exportPath)) {
        fs.unlinkSync(exportPath);
      }
      if (fs.existsSync(newConfigPath)) {
        fs.unlinkSync(newConfigPath);
      }

    } catch (error) {
      // Cleanup on error
      if (fs.existsSync(exportPath)) {
        fs.unlinkSync(exportPath);
      }
      throw error;
    }
  });

  test('Property 15: Configuration Reset - Should reset configuration to defaults', () => {
    // Modify configuration
    configService.updateConfiguration('database', { maxConnections: 50 });
    configService.updateConfiguration('system', { logLevel: 'error' });
    configService.updateConfiguration('alerts', { ndviDeclineThreshold: 25 });

    const modifiedConfig = configService.getConfiguration();
    expect(modifiedConfig.database.maxConnections).toBe(50);
    expect(modifiedConfig.system.logLevel).toBe('error');
    expect(modifiedConfig.alerts.ndviDeclineThreshold).toBe(25);

    // Reset to defaults
    configService.resetToDefaults();

    const resetConfig = configService.getConfiguration();

    // Verify reset to default values
    expect(resetConfig.database.maxConnections).toBe(10); // Default value
    expect(resetConfig.system.logLevel).toBe('info'); // Default value
    expect(resetConfig.alerts.ndviDeclineThreshold).toBe(15); // Default value
  });

  test('Property 15: Configuration Statistics - Should provide accurate configuration statistics', () => {
    const stats = configService.getConfigurationStatistics();

    expect(typeof stats.totalSections).toBe('number');
    expect(stats.totalSections).toBeGreaterThan(0);

    expect(typeof stats.totalSettings).toBe('number');
    expect(stats.totalSettings).toBeGreaterThan(0);

    expect(stats.lastModified).toBeInstanceOf(Date);
    expect(typeof stats.configSize).toBe('number');
    expect(typeof stats.isValid).toBe('boolean');

    // Statistics should be consistent
    expect(stats.totalSections).toBe(7); // database, api, alerts, irrigation, system, version, environment
    expect(stats.isValid).toBe(true); // Default config should be valid
  });

  test('Property 15: Change Listeners - Should properly manage configuration change listeners', () => {
    let listener1Called = false;
    let listener2Called = false;

    const listener1 = (config: AgriMonitorConfiguration) => {
      listener1Called = true;
      expect(config.database.maxConnections).toBe(30);
    };

    const listener2 = (config: AgriMonitorConfiguration) => {
      listener2Called = true;
      expect(config.database.maxConnections).toBe(30);
    };

    // Add listeners
    configService.addChangeListener(listener1);
    configService.addChangeListener(listener2);

    // Trigger change
    configService.updateConfiguration('database', { maxConnections: 30 });

    expect(listener1Called).toBe(true);
    expect(listener2Called).toBe(true);

    // Remove one listener
    listener1Called = false;
    listener2Called = false;

    configService.removeChangeListener(listener1);

    // Trigger another change
    configService.updateConfiguration('database', { maxConnections: 35 });

    expect(listener1Called).toBe(false);
    expect(listener2Called).toBe(true);
  });

  test('Property 15: Configuration Consistency - Should maintain configuration consistency across operations', () => {
    const operations = [
      () => configService.updateConfiguration('database', { maxConnections: 15 }),
      () => configService.updateConfiguration('system', { logLevel: 'warn' }),
      () => configService.updateConfiguration('alerts', { ndviDeclineThreshold: 20 }),
      () => configService.getConfiguration(),
      () => configService.getDatabaseConfig(),
      () => configService.validateConfiguration(),
      () => configService.getConfigurationStatistics()
    ];

    // Perform operations in sequence
    operations.forEach(operation => {
      operation();
    });

    const finalConfig = configService.getConfiguration();

    // Verify all changes were applied and maintained
    expect(finalConfig.database.maxConnections).toBe(15);
    expect(finalConfig.system.logLevel).toBe('warn');
    expect(finalConfig.alerts.ndviDeclineThreshold).toBe(20);

    // Verify configuration is still valid
    const validation = configService.validateConfiguration();
    expect(validation.isValid).toBe(true);
  });

  test('Property 15: Error Handling - Should handle configuration errors gracefully', () => {
    // Test invalid section update
    expect(() => {
      configService.updateConfiguration('invalid' as any, { test: 'value' });
    }).toThrow('Unknown configuration section');

    // Test invalid field update
    expect(() => {
      configService.updateConfiguration('database', { invalidField: 'value' });
    }).toThrow('Unknown configuration field');

    // Test invalid import
    const invalidConfigPath = path.join(path.dirname(tempConfigPath), 'invalid.json');
    fs.writeFileSync(invalidConfigPath, '{ "invalid": "json" }');

    expect(() => {
      configService.importConfiguration(invalidConfigPath);
    }).toThrow('Invalid configuration');

    // Cleanup
    if (fs.existsSync(invalidConfigPath)) {
      fs.unlinkSync(invalidConfigPath);
    }

    // Configuration should remain valid after errors
    const validation = configService.validateConfiguration();
    expect(validation.isValid).toBe(true);
  });
});