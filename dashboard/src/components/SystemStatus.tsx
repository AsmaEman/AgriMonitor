'use client';

import { useState, useEffect } from 'react';
import { satelliteApi, weatherApi, alertsApi } from '@/lib/api';
import { CheckCircle, AlertCircle, XCircle, RefreshCw, Server, Cloud, Bell } from 'lucide-react';

interface SystemStatusProps {
  health: any;
}

interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  message: string;
  lastCheck: string;
  icon: React.ReactNode;
}

export default function SystemStatus({ health }: SystemStatusProps) {
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const checkServiceStatus = async () => {
    setLoading(true);
    const serviceChecks: ServiceStatus[] = [];

    // Check Satellite Service
    try {
      const satelliteStatus = await satelliteApi.getStatus();
      serviceChecks.push({
        name: 'Satellite Data Processing',
        status: 'healthy',
        message: satelliteStatus.message || 'Service operational',
        lastCheck: new Date().toISOString(),
        icon: <Server className="w-5 h-5" />,
      });
    } catch (error) {
      serviceChecks.push({
        name: 'Satellite Data Processing',
        status: 'down',
        message: 'Service unavailable',
        lastCheck: new Date().toISOString(),
        icon: <Server className="w-5 h-5" />,
      });
    }

    // Check Weather Service
    try {
      const weatherStatus = await weatherApi.getStatus();
      serviceChecks.push({
        name: 'Weather Data Integration',
        status: 'healthy',
        message: weatherStatus.message || 'Service operational',
        lastCheck: new Date().toISOString(),
        icon: <Cloud className="w-5 h-5" />,
      });
    } catch (error) {
      serviceChecks.push({
        name: 'Weather Data Integration',
        status: 'down',
        message: 'Service unavailable',
        lastCheck: new Date().toISOString(),
        icon: <Cloud className="w-5 h-5" />,
      });
    }

    // Check Alert Service
    try {
      await alertsApi.getAlertStats();
      serviceChecks.push({
        name: 'Alert Management',
        status: 'healthy',
        message: 'Service operational',
        lastCheck: new Date().toISOString(),
        icon: <Bell className="w-5 h-5" />,
      });
    } catch (error) {
      serviceChecks.push({
        name: 'Alert Management',
        status: 'down',
        message: 'Service unavailable',
        lastCheck: new Date().toISOString(),
        icon: <Bell className="w-5 h-5" />,
      });
    }

    setServices(serviceChecks);
    setLastRefresh(new Date());
    setLoading(false);
  };

  useEffect(() => {
    checkServiceStatus();

    // Refresh every 5 minutes
    const interval = setInterval(checkServiceStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100';
      case 'degraded': return 'text-yellow-600 bg-yellow-100';
      case 'down': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'degraded': return <AlertCircle className="w-4 h-4 text-yellow-600" />;
      case 'down': return <XCircle className="w-4 h-4 text-red-600" />;
      default: return <AlertCircle className="w-4 h-4 text-gray-600" />;
    }
  };

  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const overallStatus = services.length > 0 ? (
    services.every(s => s.status === 'healthy') ? 'healthy' :
      services.some(s => s.status === 'down') ? 'down' : 'degraded'
  ) : 'unknown';

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h2 className="text-xl font-semibold text-gray-900">System Status</h2>
            {getStatusIcon(overallStatus)}
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(overallStatus)}`}>
              {overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              Last updated: {formatTime(lastRefresh)}
            </span>
            <button
              onClick={checkServiceStatus}
              disabled={loading}
              className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Overall System Health */}
      {health && (
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                {health.status === 'healthy' ? (
                  <CheckCircle className="w-6 h-6 text-green-600" />
                ) : (
                  <AlertCircle className="w-6 h-6 text-yellow-600" />
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Backend API</p>
                <p className="text-sm text-gray-500">{health.status || 'Unknown'}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <Server className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Version</p>
                <p className="text-sm text-gray-500">{health.version || 'Unknown'}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <RefreshCw className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">Uptime</p>
                <p className="text-sm text-gray-500">
                  {health.timestamp ? formatTime(new Date(health.timestamp)) : 'Unknown'}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Service Status Details */}
      <div className="p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Service Components</h3>

        {loading && services.length === 0 ? (
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {services.map((service, index) => (
              <div key={index} className="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-full ${getStatusColor(service.status)}`}>
                    {service.icon}
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-900">{service.name}</h4>
                    <p className="text-sm text-gray-500">{service.message}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  {getStatusIcon(service.status)}
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(service.status)}`}>
                    {service.status.charAt(0).toUpperCase() + service.status.slice(1)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Service Health Summary */}
        {services.length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <p className="text-2xl font-semibold text-green-600">
                  {services.filter(s => s.status === 'healthy').length}
                </p>
                <p className="text-sm text-gray-600">Healthy</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-yellow-600">
                  {services.filter(s => s.status === 'degraded').length}
                </p>
                <p className="text-sm text-gray-600">Degraded</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-red-600">
                  {services.filter(s => s.status === 'down').length}
                </p>
                <p className="text-sm text-gray-600">Down</p>
              </div>
              <div>
                <p className="text-2xl font-semibold text-gray-600">
                  {services.length}
                </p>
                <p className="text-sm text-gray-600">Total</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}