import { AlertService } from './AlertService';
import { SoilData } from './IrrigationService';

// Feature: agrimonitor-lite, Property 12: Alert Acknowledgment Tracking
// **Validates: Requirements 6.5**

describe('Alert Acknowledgment Tracking Property Tests', () => {
  let alertService: AlertService;

  beforeEach(() => {
    alertService = new AlertService();
  });

  test('Property 12: Acknowledgment State Tracking - Should properly track acknowledgment state changes', async () => {
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
      'wheat',
      'mid_season',
      soilData,
      40.0,
      -75.0
    );

    expect(alerts.length).toBeGreaterThan(0);

    const alert = alerts[0];

    // Initial state should be unacknowledged
    expect(alert.acknowledged).toBe(false);
    expect(alert.acknowledgedAt).toBeUndefined();
    expect(alert.acknowledgedBy).toBeUndefined();

    // Acknowledge the alert
    const beforeAcknowledgment = new Date();
    const acknowledged = alertService.acknowledgeAlert(alert.id, 'test-user');
    const afterAcknowledgment = new Date();

    expect(acknowledged).toBe(true);

    // Verify acknowledgment state
    const fieldAlerts = alertService.getFieldAlerts('test-field');
    const acknowledgedAlert = fieldAlerts.find(a => a.id === alert.id);

    expect(acknowledgedAlert).toBeDefined();
    expect(acknowledgedAlert!.acknowledged).toBe(true);
    expect(acknowledgedAlert!.acknowledgedAt).toBeInstanceOf(Date);
    expect(acknowledgedAlert!.acknowledgedBy).toBe('test-user');

    // Verify acknowledgment timestamp is reasonable
    expect(acknowledgedAlert!.acknowledgedAt!.getTime()).toBeGreaterThanOrEqual(beforeAcknowledgment.getTime());
    expect(acknowledgedAlert!.acknowledgedAt!.getTime()).toBeLessThanOrEqual(afterAcknowledgment.getTime());
  });

  test('Property 12: Acknowledgment Without User - Should handle acknowledgment without specifying user', async () => {
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25,
      depth: 30,
      texture: 'loam'
    };

    const alerts = await alertService.generateAlerts(
      'test-field',
      'cotton',
      'development',
      soilData,
      35.0,
      -80.0
    );

    expect(alerts.length).toBeGreaterThan(0);

    const alert = alerts[0];

    // Acknowledge without specifying user
    const acknowledged = alertService.acknowledgeAlert(alert.id);
    expect(acknowledged).toBe(true);

    const fieldAlerts = alertService.getFieldAlerts('test-field');
    const acknowledgedAlert = fieldAlerts.find(a => a.id === alert.id);

    expect(acknowledgedAlert!.acknowledged).toBe(true);
    expect(acknowledgedAlert!.acknowledgedAt).toBeInstanceOf(Date);
    expect(acknowledgedAlert!.acknowledgedBy).toBeUndefined();
  });

  test('Property 12: Invalid Alert ID - Should handle acknowledgment of non-existent alerts', () => {
    const invalidIds = [
      'non-existent-id',
      'alert_123_invalid',
      '',
      'null',
      'undefined'
    ];

    invalidIds.forEach(invalidId => {
      const result = alertService.acknowledgeAlert(invalidId, 'test-user');
      expect(result).toBe(false);
    });
  });

  test('Property 12: Multiple Acknowledgments - Should handle multiple acknowledgment attempts', async () => {
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
      'initial',
      soilData,
      42.0,
      -85.0
    );

    expect(alerts.length).toBeGreaterThan(0);

    const alert = alerts[0];

    // First acknowledgment
    const firstAck = alertService.acknowledgeAlert(alert.id, 'user1');
    expect(firstAck).toBe(true);

    const firstAckTime = alertService.getFieldAlerts('test-field').find(a => a.id === alert.id)!.acknowledgedAt;

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 10));

    // Second acknowledgment (should still work but update the details)
    const secondAck = alertService.acknowledgeAlert(alert.id, 'user2');
    expect(secondAck).toBe(true);

    const finalAlert = alertService.getFieldAlerts('test-field').find(a => a.id === alert.id);
    expect(finalAlert!.acknowledged).toBe(true);
    expect(finalAlert!.acknowledgedBy).toBe('user2');
    expect(finalAlert!.acknowledgedAt!.getTime()).toBeGreaterThanOrEqual(firstAckTime!.getTime());
  });

  test('Property 12: Acknowledgment Filtering - Should properly filter acknowledged vs unacknowledged alerts', async () => {
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25,
      depth: 30,
      texture: 'loam'
    };

    // Generate alerts for multiple fields
    const field1Alerts = await alertService.generateAlerts(
      'field-1',
      'maize',
      'mid_season',
      soilData,
      40.0,
      -95.0
    );

    const field2Alerts = await alertService.generateAlerts(
      'field-2',
      'soybean',
      'development',
      soilData,
      41.0,
      -96.0
    );

    const totalAlerts = field1Alerts.length + field2Alerts.length;
    expect(totalAlerts).toBeGreaterThan(0);

    // Initially, all alerts should be unacknowledged
    const initialActiveAlerts = alertService.getActiveAlerts();
    expect(initialActiveAlerts.length).toBe(totalAlerts);

    const initialField1Active = alertService.getFieldAlerts('field-1', false);
    const initialField2Active = alertService.getFieldAlerts('field-2', false);
    expect(initialField1Active.length).toBe(field1Alerts.length);
    expect(initialField2Active.length).toBe(field2Alerts.length);

    // Acknowledge some alerts
    if (field1Alerts.length > 0) {
      alertService.acknowledgeAlert(field1Alerts[0].id, 'user1');
    }
    if (field2Alerts.length > 1) {
      alertService.acknowledgeAlert(field2Alerts[0].id, 'user2');
      alertService.acknowledgeAlert(field2Alerts[1].id, 'user2');
    }

    const acknowledgedCount = (field1Alerts.length > 0 ? 1 : 0) + (field2Alerts.length > 1 ? 2 : 0);

    // Check active alerts after acknowledgment
    const activeAlerts = alertService.getActiveAlerts();
    expect(activeAlerts.length).toBe(totalAlerts - acknowledgedCount);

    // Check field-specific filtering
    const field1Active = alertService.getFieldAlerts('field-1', false);
    const field1All = alertService.getFieldAlerts('field-1', true);

    expect(field1All.length).toBe(field1Alerts.length);
    if (field1Alerts.length > 0) {
      expect(field1Active.length).toBe(field1Alerts.length - 1);
    }

    const field2Active = alertService.getFieldAlerts('field-2', false);
    const field2All = alertService.getFieldAlerts('field-2', true);

    expect(field2All.length).toBe(field2Alerts.length);
    if (field2Alerts.length > 1) {
      expect(field2Active.length).toBe(field2Alerts.length - 2);
    }
  });

  test('Property 12: Statistics Tracking - Should accurately track acknowledgment statistics', async () => {
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25,
      depth: 30,
      texture: 'loam'
    };

    // Generate multiple alerts
    const alerts1 = await alertService.generateAlerts(
      'field-1',
      'wheat',
      'mid_season',
      soilData,
      40.0,
      -75.0
    );

    const alerts2 = await alertService.generateAlerts(
      'field-2',
      'cotton',
      'development',
      soilData,
      35.0,
      -80.0
    );

    const totalGenerated = alerts1.length + alerts2.length;

    // Initial statistics
    const initialStats = alertService.getAlertStatistics();
    expect(initialStats.totalAlerts).toBe(totalGenerated);
    expect(initialStats.activeAlerts).toBe(totalGenerated);
    expect(initialStats.acknowledgedAlerts).toBe(0);
    expect(initialStats.averageResponseTime).toBe(0);

    // Acknowledge some alerts with delays to test response time calculation
    let acknowledgedCount = 0;

    if (alerts1.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 10));
      alertService.acknowledgeAlert(alerts1[0].id, 'user1');
      acknowledgedCount++;
    }

    if (alerts2.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 20));
      alertService.acknowledgeAlert(alerts2[0].id, 'user2');
      acknowledgedCount++;
    }

    // Updated statistics
    const updatedStats = alertService.getAlertStatistics();
    expect(updatedStats.totalAlerts).toBe(totalGenerated);
    expect(updatedStats.activeAlerts).toBe(totalGenerated - acknowledgedCount);
    expect(updatedStats.acknowledgedAlerts).toBe(acknowledgedCount);
    expect(updatedStats.averageResponseTime).toBeGreaterThan(0);

    // Verify statistics consistency
    expect(updatedStats.activeAlerts + updatedStats.acknowledgedAlerts).toBe(updatedStats.totalAlerts);
  });

  test('Property 12: Acknowledgment Persistence - Should maintain acknowledgment state across operations', async () => {
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25,
      depth: 30,
      texture: 'loam'
    };

    const alerts = await alertService.generateAlerts(
      'test-field',
      'soybean',
      'late_season',
      soilData,
      39.0,
      -95.0
    );

    expect(alerts.length).toBeGreaterThan(0);

    const alert = alerts[0];

    // Acknowledge the alert
    alertService.acknowledgeAlert(alert.id, 'persistent-user');

    // Perform various operations
    alertService.getActiveAlerts();
    alertService.getFieldAlerts('test-field');
    alertService.getAlertStatistics();
    alertService.clearExpiredAlerts();

    // Verify acknowledgment state is still maintained
    const persistentAlert = alertService.getFieldAlerts('test-field').find(a => a.id === alert.id);
    expect(persistentAlert!.acknowledged).toBe(true);
    expect(persistentAlert!.acknowledgedBy).toBe('persistent-user');
    expect(persistentAlert!.acknowledgedAt).toBeInstanceOf(Date);
  });

  test('Property 12: Acknowledgment Data Integrity - Should maintain data integrity during acknowledgment', async () => {
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

    expect(alerts.length).toBeGreaterThan(0);

    const alert = alerts[0];
    const originalData = { ...alert };

    // Acknowledge the alert
    alertService.acknowledgeAlert(alert.id, 'integrity-user');

    const acknowledgedAlert = alertService.getFieldAlerts('test-field').find(a => a.id === alert.id)!;

    // Verify that only acknowledgment-related fields changed
    expect(acknowledgedAlert.id).toBe(originalData.id);
    expect(acknowledgedAlert.fieldId).toBe(originalData.fieldId);
    expect(acknowledgedAlert.type).toBe(originalData.type);
    expect(acknowledgedAlert.urgency).toBe(originalData.urgency);
    expect(acknowledgedAlert.title).toBe(originalData.title);
    expect(acknowledgedAlert.message).toBe(originalData.message);
    expect(acknowledgedAlert.timestamp).toEqual(originalData.timestamp);
    expect(acknowledgedAlert.data).toEqual(originalData.data);

    // Verify acknowledgment fields changed appropriately
    expect(acknowledgedAlert.acknowledged).toBe(true);
    expect(acknowledgedAlert.acknowledged).not.toBe(originalData.acknowledged);
    expect(acknowledgedAlert.acknowledgedAt).toBeInstanceOf(Date);
    expect(acknowledgedAlert.acknowledgedBy).toBe('integrity-user');
  });

  test('Property 12: Concurrent Acknowledgments - Should handle concurrent acknowledgment attempts', async () => {
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25,
      depth: 30,
      texture: 'loam'
    };

    const alerts = await alertService.generateAlerts(
      'test-field',
      'maize',
      'development',
      soilData,
      40.0,
      -100.0
    );

    expect(alerts.length).toBeGreaterThan(0);

    const alert = alerts[0];

    // Simulate concurrent acknowledgments
    const acknowledgmentPromises = [
      Promise.resolve(alertService.acknowledgeAlert(alert.id, 'user1')),
      Promise.resolve(alertService.acknowledgeAlert(alert.id, 'user2')),
      Promise.resolve(alertService.acknowledgeAlert(alert.id, 'user3'))
    ];

    const results = await Promise.all(acknowledgmentPromises);

    // All acknowledgments should succeed
    results.forEach(result => {
      expect(result).toBe(true);
    });

    // Final state should be acknowledged
    const finalAlert = alertService.getFieldAlerts('test-field').find(a => a.id === alert.id);
    expect(finalAlert!.acknowledged).toBe(true);
    expect(finalAlert!.acknowledgedAt).toBeInstanceOf(Date);
    expect(finalAlert!.acknowledgedBy).toBeDefined();
  });

  test('Property 12: Acknowledgment History - Should maintain proper chronological order', async () => {
    const soilData: SoilData = {
      fieldCapacity: 100,
      wiltingPoint: 20,
      currentMoisture: 25,
      depth: 30,
      texture: 'loam'
    };

    // Generate alerts with small delays to ensure different timestamps
    const alertBatches = [];
    for (let i = 0; i < 3; i++) {
      await new Promise(resolve => setTimeout(resolve, 10));
      const alerts = await alertService.generateAlerts(
        `field-${i}`,
        'wheat',
        'mid_season',
        soilData,
        40.0 + i,
        -75.0 - i
      );
      alertBatches.push(alerts);
    }

    const allAlerts = alertBatches.flat();
    expect(allAlerts.length).toBeGreaterThan(0);

    // Acknowledge alerts in reverse order with delays
    for (let i = allAlerts.length - 1; i >= 0; i--) {
      await new Promise(resolve => setTimeout(resolve, 10));
      alertService.acknowledgeAlert(allAlerts[i].id, `user-${i}`);
    }

    // Verify all alerts are acknowledged
    const stats = alertService.getAlertStatistics();
    expect(stats.acknowledgedAlerts).toBe(allAlerts.length);
    expect(stats.activeAlerts).toBe(0);

    // Verify chronological consistency
    for (let i = 0; i < 3; i++) {
      const fieldAlerts = alertService.getFieldAlerts(`field-${i}`, true);
      fieldAlerts.forEach(alert => {
        expect(alert.acknowledged).toBe(true);
        expect(alert.acknowledgedAt).toBeInstanceOf(Date);
        expect(alert.acknowledgedAt!.getTime()).toBeGreaterThan(alert.timestamp.getTime());
      });
    }
  });
});