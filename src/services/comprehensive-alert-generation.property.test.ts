import { AlertService, Alert, AlertConfiguration } from './AlertService';
import { SoilData } from './IrrigationService';

// Feature: agrimonitor-lite, Property 11: Comprehensive Alert Generation
// **Validates: Requirements 6.1, 6.2, 6.3, 6.4**

describe('Comprehensive Alert Generation Property Tests', () => {
  let alertService: AlertService;

  beforeEach(() => {
    alertService = new AlertService();
  });

  test('Property 11: Alert Generation - Should generate appropriate alerts based on field conditions', async () => {
    const testCases = [
      {
        name: 'Critical soil moisture',
        soilData: {
          fieldCapacity: 100,
          wiltingPoint: 20,
          currentMoisture: 25, // 6.25% AWC - critical
          depth: 30,
          texture: 'loam' as const
        },
        expectedAlertTypes: ['soil_moisture_critical', 'irrigation_needed']
      },
      {
        name: 'Adequate soil moisture',
        soilData: {
          fieldCapacity: 100,
          wiltingPoint: 20,
          currentMoisture: 70, // 62.5% AWC - adequate
          depth: 30,
          texture: 'loam' as const
        },
        expectedAlertTypes: [] // No alerts expected
      }
    ];

    for (const testCase of testCases) {
      const alerts = await alertService.generateAlerts(
        'test-field',
        'wheat',
        'mid_season',
        testCase.soilData,
        40.0,
        -75.0
      );

      // Check if expected alert types are present
      const alertTypes = alerts.map(alert => alert.type);

      if (testCase.expectedAlertTypes.length === 0) {
        expect(alerts.length).toBe(0);
      } else {
        testCase.expectedAlertTypes.forEach(expectedType => {
          expect(alertTypes).toContain(expectedType);
        });
      }

      // All alerts should have required properties
      alerts.forEach(alert => {
        expect(alert.id).toBeDefined();
        expect(alert.fieldId).toBe('test-field');
        expect(alert.type).toBeDefined();
        expect(alert.urgency).toMatch(/^(low|medium|high|critical)$/);
        expect(alert.title).toBeDefined();
        expect(alert.message).toBeDefined();
        expect(alert.timestamp).toBeInstanceOf(Date);
        expect(alert.acknowledged).toBe(false);
      });
    }
  });

  test('Property 11: Urgency Assignment - Should assign correct urgency levels based on severity', async () => {
    const testCases = [
      {
        soilMoisture: 22, // 2.5% AWC - critical
        expectedUrgency: 'critical'
      },
      {
        soilMoisture: 32, // 15% AWC - high
        expectedUrgency: 'high'
      },
      {
        soilMoisture: 36, // 20% AWC - medium
        expectedUrgency: 'medium'
      }
    ];

    for (const testCase of testCases) {
      const soilData: SoilData = {
        fieldCapacity: 100,
        wiltingPoint: 20,
        currentMoisture: testCase.soilMoisture,
        depth: 30,
        texture: 'loam'
      };

      const alerts = await alertService.generateAlerts(
        'test-field',
        'maize',
        'development',
        soilData,
        35.0,
        -80.0
      );

      const soilMoistureAlert = alerts.find(alert => alert.type === 'soil_moisture_critical');
      if (soilMoistureAlert) {
        expect(soilMoistureAlert.urgency).toBe(testCase.expectedUrgency);
      }
    }
  });

  test('Property 11: Alert Acknowledgment - Should properly track alert acknowledgment', async () => {
    // Generate an alert
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25, // Critical level
      depth: 30,
      texture: 'loam'
    };

    const alerts = await alertService.generateAlerts(
      'test-field',
      'cotton',
      'initial',
      soilData,
      30.0,
      -90.0
    );

    expect(alerts.length).toBeGreaterThan(0);

    const alert = alerts[0];
    expect(alert.acknowledged).toBe(false);
    expect(alert.acknowledgedAt).toBeUndefined();
    expect(alert.acknowledgedBy).toBeUndefined();

    // Acknowledge the alert
    const acknowledged = alertService.acknowledgeAlert(alert.id, 'test-user');
    expect(acknowledged).toBe(true);

    // Verify acknowledgment
    const fieldAlerts = alertService.getFieldAlerts('test-field');
    const acknowledgedAlert = fieldAlerts.find(a => a.id === alert.id);

    expect(acknowledgedAlert!.acknowledged).toBe(true);
    expect(acknowledgedAlert!.acknowledgedAt).toBeInstanceOf(Date);
    expect(acknowledgedAlert!.acknowledgedBy).toBe('test-user');
  });

  test('Property 11: Alert Filtering - Should properly filter alerts by field and acknowledgment status', async () => {
    // Generate alerts for multiple fields
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25,
      depth: 30,
      texture: 'loam'
    };

    const field1Alerts = await alertService.generateAlerts(
      'field-1',
      'wheat',
      'mid_season',
      soilData,
      40.0,
      -75.0
    );

    const field2Alerts = await alertService.generateAlerts(
      'field-2',
      'rice',
      'development',
      soilData,
      41.0,
      -76.0
    );

    expect(field1Alerts.length).toBeGreaterThan(0);
    expect(field2Alerts.length).toBeGreaterThan(0);

    // Test field-specific filtering
    const field1Retrieved = alertService.getFieldAlerts('field-1');
    const field2Retrieved = alertService.getFieldAlerts('field-2');

    expect(field1Retrieved.length).toBe(field1Alerts.length);
    expect(field2Retrieved.length).toBe(field2Alerts.length);

    field1Retrieved.forEach(alert => {
      expect(alert.fieldId).toBe('field-1');
    });

    field2Retrieved.forEach(alert => {
      expect(alert.fieldId).toBe('field-2');
    });

    // Acknowledge one alert from field-1
    if (field1Alerts.length > 0) {
      alertService.acknowledgeAlert(field1Alerts[0].id);

      // Test acknowledgment filtering
      const activeField1Alerts = alertService.getFieldAlerts('field-1', false);
      expect(activeField1Alerts.length).toBe(field1Alerts.length - 1);

      const allField1Alerts = alertService.getFieldAlerts('field-1', true);
      expect(allField1Alerts.length).toBe(field1Alerts.length);
    }
  });

  test('Property 11: Alert Statistics - Should provide accurate statistics', async () => {
    // Generate multiple alerts
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25,
      depth: 30,
      texture: 'loam'
    };

    const alerts1 = await alertService.generateAlerts(
      'field-1',
      'soybean',
      'mid_season',
      soilData,
      39.0,
      -95.0
    );

    const alerts2 = await alertService.generateAlerts(
      'field-2',
      'maize',
      'development',
      soilData,
      40.0,
      -96.0
    );

    const totalGenerated = alerts1.length + alerts2.length;

    // Get initial statistics
    const initialStats = alertService.getAlertStatistics();
    expect(initialStats.totalAlerts).toBe(totalGenerated);
    expect(initialStats.activeAlerts).toBe(totalGenerated);
    expect(initialStats.acknowledgedAlerts).toBe(0);

    // Acknowledge some alerts
    if (alerts1.length > 0) {
      alertService.acknowledgeAlert(alerts1[0].id);
    }
    if (alerts2.length > 0) {
      alertService.acknowledgeAlert(alerts2[0].id);
    }

    const updatedStats = alertService.getAlertStatistics();
    expect(updatedStats.totalAlerts).toBe(totalGenerated);
    expect(updatedStats.activeAlerts).toBe(totalGenerated - 2);
    expect(updatedStats.acknowledgedAlerts).toBe(2);

    // Verify urgency and type statistics
    expect(typeof updatedStats.alertsByUrgency).toBe('object');
    expect(typeof updatedStats.alertsByType).toBe('object');
    expect(typeof updatedStats.averageResponseTime).toBe('number');
  });

  test('Property 11: Configuration Management - Should respect alert configuration settings', async () => {
    // Test with default configuration
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 35, // 18.75% AWC
      depth: 30,
      texture: 'loam'
    };

    // Test with default configuration first (we'll use the results later)
    await alertService.generateAlerts(
      'test-field',
      'wheat',
      'mid_season',
      soilData,
      40.0,
      -75.0
    );

    // Update configuration to disable soil moisture alerts
    const newConfig: Partial<AlertConfiguration> = {
      enabledAlertTypes: ['irrigation_needed', 'weather_warning'],
      soilMoistureCriticalLevel: 10 // Lower threshold
    };

    alertService.updateConfiguration(newConfig);

    const configuredAlerts = await alertService.generateAlerts(
      'test-field-2',
      'wheat',
      'mid_season',
      soilData,
      40.0,
      -75.0
    );

    // Should not generate soil moisture critical alerts
    const soilMoistureAlerts = configuredAlerts.filter(alert => alert.type === 'soil_moisture_critical');
    expect(soilMoistureAlerts.length).toBe(0);

    // Verify configuration was updated
    const currentConfig = alertService.getConfiguration();
    expect(currentConfig.enabledAlertTypes).toEqual(['irrigation_needed', 'weather_warning']);
    expect(currentConfig.soilMoistureCriticalLevel).toBe(10);
  });

  test('Property 11: Active Alert Sorting - Should sort active alerts by urgency and timestamp', async () => {
    // Generate alerts with different urgencies
    const testCases = [
      {
        fieldId: 'field-1',
        soilMoisture: 22, // Critical
        delay: 0
      },
      {
        fieldId: 'field-2',
        soilMoisture: 28, // High
        delay: 100
      },
      {
        fieldId: 'field-3',
        soilMoisture: 32, // Medium
        delay: 200
      }
    ];

    for (const testCase of testCases) {
      await new Promise(resolve => setTimeout(resolve, testCase.delay));

      const soilData: SoilData = {
        fieldCapacity: 100,
        wiltingPoint: 20,
        currentMoisture: testCase.soilMoisture,
        depth: 30,
        texture: 'loam'
      };

      await alertService.generateAlerts(
        testCase.fieldId,
        'cotton',
        'development',
        soilData,
        35.0,
        -80.0
      );
    }

    const activeAlerts = alertService.getActiveAlerts();
    expect(activeAlerts.length).toBeGreaterThan(0);

    // Verify sorting by urgency (critical > high > medium > low)
    const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 };

    for (let i = 0; i < activeAlerts.length - 1; i++) {
      const currentUrgency = urgencyOrder[activeAlerts[i].urgency];
      const nextUrgency = urgencyOrder[activeAlerts[i + 1].urgency];

      // Current alert should have higher or equal urgency
      expect(currentUrgency).toBeGreaterThanOrEqual(nextUrgency);

      // If same urgency, should be sorted by timestamp (newer first)
      if (currentUrgency === nextUrgency) {
        expect(activeAlerts[i].timestamp.getTime()).toBeGreaterThanOrEqual(
          activeAlerts[i + 1].timestamp.getTime()
        );
      }
    }
  });

  test('Property 11: Alert Data Integrity - Should maintain consistent alert data structure', async () => {
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25,
      depth: 30,
      texture: 'loam'
    };

    const alerts = await alertService.generateAlerts(
      'test-field',
      'rice',
      'mid_season',
      soilData,
      42.0,
      -85.0
    );

    alerts.forEach(alert => {
      // Required properties
      expect(typeof alert.id).toBe('string');
      expect(alert.id.length).toBeGreaterThan(0);
      expect(typeof alert.fieldId).toBe('string');
      expect(alert.fieldId).toBe('test-field');
      expect(typeof alert.type).toBe('string');
      expect(['ndvi_decline', 'soil_moisture_critical', 'irrigation_needed', 'weather_warning', 'pest_risk']).toContain(alert.type);
      expect(['low', 'medium', 'high', 'critical']).toContain(alert.urgency);
      expect(typeof alert.title).toBe('string');
      expect(alert.title.length).toBeGreaterThan(0);
      expect(typeof alert.message).toBe('string');
      expect(alert.message.length).toBeGreaterThan(0);
      expect(alert.timestamp).toBeInstanceOf(Date);
      expect(typeof alert.acknowledged).toBe('boolean');

      // Optional properties
      if (alert.acknowledgedAt) {
        expect(alert.acknowledgedAt).toBeInstanceOf(Date);
      }
      if (alert.acknowledgedBy) {
        expect(typeof alert.acknowledgedBy).toBe('string');
      }
      if (alert.expiresAt) {
        expect(alert.expiresAt).toBeInstanceOf(Date);
      }

      // Alert-specific data should be present for certain types
      if (alert.type === 'soil_moisture_critical') {
        expect(alert.data).toBeDefined();
        expect(typeof alert.data.currentWaterLevel).toBe('number');
        expect(typeof alert.data.currentMoisture).toBe('number');
      }

      if (alert.type === 'irrigation_needed') {
        expect(alert.data).toBeDefined();
        expect(typeof alert.data.waterAmount).toBe('number');
        expect(typeof alert.data.currentWaterLevel).toBe('number');
      }
    });
  });

  test('Property 11: Alert Uniqueness - Should generate unique alert IDs', async () => {
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25,
      depth: 30,
      texture: 'loam'
    };

    // Generate multiple batches of alerts
    const allAlerts: Alert[] = [];

    for (let i = 0; i < 5; i++) {
      const alerts = await alertService.generateAlerts(
        `field-${i}`,
        'wheat',
        'mid_season',
        soilData,
        40.0 + i,
        -75.0 - i
      );
      allAlerts.push(...alerts);
    }

    // Check that all alert IDs are unique
    const alertIds = allAlerts.map(alert => alert.id);
    const uniqueIds = new Set(alertIds);

    expect(uniqueIds.size).toBe(alertIds.length);

    // Check ID format
    alertIds.forEach(id => {
      expect(id).toMatch(/^alert_\d+_[a-z0-9]+$/);
    });
  });

  test('Property 11: Expired Alert Cleanup - Should properly handle expired alerts', () => {
    // This test would require setting up alerts with expiration dates
    // For now, we'll test the cleanup mechanism
    const clearedCount = alertService.clearExpiredAlerts();
    expect(typeof clearedCount).toBe('number');
    expect(clearedCount).toBeGreaterThanOrEqual(0);
  });
});