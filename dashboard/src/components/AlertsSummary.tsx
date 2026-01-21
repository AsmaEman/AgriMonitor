'use client';

import React, { useState } from 'react';
import { Alert } from '@/types';
import { alertsApi } from '@/lib/api';
import { AlertTriangle, CheckCircle, Clock, X, Eye } from 'lucide-react';

interface AlertsSummaryProps {
  alerts: Alert[];
}

export default function AlertsSummary({ alerts }: AlertsSummaryProps) {
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [localAlerts, setLocalAlerts] = useState<Alert[]>(alerts);

  // Update local alerts when props change
  React.useEffect(() => {
    setLocalAlerts(alerts);
  }, [alerts]);

  const handleAcknowledgeAlert = async (alertId: string) => {
    try {
      setAcknowledging(alertId);
      await alertsApi.acknowledgeAlert(alertId, 'Dashboard User');

      // Update local state
      setLocalAlerts(prev =>
        prev.map(alert =>
          alert.id === alertId
            ? { ...alert, acknowledged: true, acknowledgedAt: new Date().toISOString(), acknowledgedBy: 'Dashboard User' }
            : alert
        )
      );
    } catch (error) {
      console.error('Failed to acknowledge alert:', error);
    } finally {
      setAcknowledging(null);
    }
  };

  const getUrgencyColor = (urgency: string): string => {
    switch (urgency) {
      case 'critical': return 'text-red-600 bg-red-100 border-red-200';
      case 'high': return 'text-orange-600 bg-orange-100 border-orange-200';
      case 'medium': return 'text-yellow-600 bg-yellow-100 border-yellow-200';
      case 'low': return 'text-blue-600 bg-blue-100 border-blue-200';
      default: return 'text-gray-600 bg-gray-100 border-gray-200';
    }
  };

  const getUrgencyIcon = (urgency: string) => {
    switch (urgency) {
      case 'critical':
      case 'high':
        return <AlertTriangle className="w-4 h-4" />;
      case 'medium':
        return <Clock className="w-4 h-4" />;
      case 'low':
        return <Eye className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const formatAlertType = (type: string): string => {
    return type.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const formatTimestamp = (timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
      } else if (diffHours > 0) {
        return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      } else {
        const diffMinutes = Math.floor(diffMs / (1000 * 60));
        return `${Math.max(1, diffMinutes)} minute${diffMinutes > 1 ? 's' : ''} ago`;
      }
    } catch {
      return 'Unknown time';
    }
  };

  const activeAlerts = localAlerts.filter(alert => !alert.acknowledged);
  const acknowledgedAlerts = localAlerts.filter(alert => alert.acknowledged);

  // Group alerts by urgency
  const alertsByUrgency = activeAlerts.reduce((acc, alert) => {
    acc[alert.urgency] = (acc[alert.urgency] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (localAlerts.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Alerts Summary</h2>
        <div className="text-center py-8">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
          <p className="text-gray-500">No alerts at this time. All systems are running normally.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Alerts Summary</h2>
          <div className="flex items-center space-x-4">
            {Object.entries(alertsByUrgency).map(([urgency, count]) => (
              <div key={urgency} className={`px-3 py-1 rounded-full text-sm font-medium ${getUrgencyColor(urgency)}`}>
                {count} {urgency}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Alerts */}
      {activeAlerts.length > 0 && (
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Active Alerts ({activeAlerts.length})</h3>
          <div className="space-y-3">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className={`p-4 rounded-lg border ${getUrgencyColor(alert.urgency)}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-2">
                      {getUrgencyIcon(alert.urgency)}
                      <span className="font-medium">{alert.title}</span>
                      <span className="text-xs px-2 py-1 rounded bg-white bg-opacity-50">
                        {formatAlertType(alert.type)}
                      </span>
                    </div>
                    <p className="text-sm mb-2">{alert.message}</p>
                    <div className="flex items-center space-x-4 text-xs">
                      <span>Field ID: {alert.fieldId}</span>
                      <span>{formatTimestamp(alert.timestamp)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAcknowledgeAlert(alert.id)}
                    disabled={acknowledging === alert.id}
                    className="ml-4 px-3 py-1 text-xs font-medium text-white bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 rounded transition-colors"
                  >
                    {acknowledging === alert.id ? 'Acknowledging...' : 'Acknowledge'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acknowledged Alerts */}
      {acknowledgedAlerts.length > 0 && (
        <div className="p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-4">
            Recently Acknowledged ({acknowledgedAlerts.length})
          </h3>
          <div className="space-y-2">
            {acknowledgedAlerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-1">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      <span className="font-medium text-gray-700">{alert.title}</span>
                      <span className="text-xs px-2 py-1 rounded bg-gray-200 text-gray-600">
                        {formatAlertType(alert.type)}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>Field ID: {alert.fieldId}</span>
                      <span>Acknowledged {formatTimestamp(alert.acknowledgedAt || alert.timestamp)}</span>
                      {alert.acknowledgedBy && <span>by {alert.acknowledgedBy}</span>}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {acknowledgedAlerts.length > 5 && (
              <p className="text-sm text-gray-500 text-center pt-2">
                ... and {acknowledgedAlerts.length - 5} more acknowledged alerts
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}