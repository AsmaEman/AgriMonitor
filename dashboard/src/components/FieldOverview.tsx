'use client';

import { useState, useEffect } from 'react';
import { Field } from '@/types';
import { satelliteApi, recommendationsApi } from '@/lib/api';
import { MapPin, Activity, Droplets, TrendingUp, TrendingDown } from 'lucide-react';

interface FieldOverviewProps {
  fields: Field[];
}

interface FieldWithHealth extends Field {
  healthScore?: number;
  status?: string;
  lastUpdate?: string;
  ndvi?: number;
  needsIrrigation?: boolean;
}

export default function FieldOverview({ fields }: FieldOverviewProps) {
  const [fieldsWithHealth, setFieldsWithHealth] = useState<FieldWithHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadFieldHealth = async () => {
      if (fields.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const fieldsWithHealthData = await Promise.all(
          fields.map(async (field) => {
            try {
              // Get satellite data for health score
              const satelliteData = await satelliteApi.processSatelliteData(field.id);

              // Get irrigation recommendation
              const irrigation = await recommendationsApi.getIrrigationRecommendation(field.id, {
                cropType: field.crop_type,
                growthStage: field.growth_stage,
              });

              return {
                ...field,
                healthScore: satelliteData.healthScore,
                ndvi: satelliteData.ndvi,
                status: getHealthStatus(satelliteData.healthScore),
                lastUpdate: satelliteData.date,
                needsIrrigation: irrigation.shouldIrrigate,
              };
            } catch (error) {
              console.error(`Failed to load health data for field ${field.id}:`, error);
              return {
                ...field,
                healthScore: 0,
                status: 'unknown',
                lastUpdate: new Date().toISOString(),
                needsIrrigation: false,
              };
            }
          })
        );

        setFieldsWithHealth(fieldsWithHealthData);
      } catch (error) {
        console.error('Failed to load field health data:', error);
        setFieldsWithHealth(fields.map(field => ({ ...field, status: 'unknown' })));
      } finally {
        setLoading(false);
      }
    };

    loadFieldHealth();
  }, [fields]);

  const getHealthStatus = (healthScore: number): string => {
    if (healthScore >= 80) return 'excellent';
    if (healthScore >= 60) return 'good';
    if (healthScore >= 40) return 'fair';
    if (healthScore >= 20) return 'poor';
    return 'critical';
  };

  const getHealthColor = (status: string): string => {
    switch (status) {
      case 'excellent': return 'text-green-600 bg-green-100';
      case 'good': return 'text-green-500 bg-green-50';
      case 'fair': return 'text-yellow-600 bg-yellow-100';
      case 'poor': return 'text-orange-600 bg-orange-100';
      case 'critical': return 'text-red-600 bg-red-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return 'Unknown';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Field Overview</h2>
        <div className="animate-pulse space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  if (fieldsWithHealth.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Field Overview</h2>
        <div className="text-center py-8">
          <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">No fields found. Add your first field to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Field Overview</h2>
          <div className="flex items-center space-x-4 text-sm text-gray-500">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500 rounded-full mr-2"></div>
              Healthy
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
              Needs Attention
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
              Critical
            </div>
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {fieldsWithHealth.map((field) => (
          <div key={field.id} className="p-6 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="flex items-center space-x-3">
                  <h3 className="text-lg font-medium text-gray-900">{field.name}</h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getHealthColor(field.status || 'unknown')}`}>
                    {field.status?.charAt(0).toUpperCase() + (field.status?.slice(1) || '')}
                  </span>
                  {field.needsIrrigation && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-blue-600 bg-blue-100">
                      <Droplets className="w-3 h-3 mr-1" />
                      Irrigation Needed
                    </span>
                  )}
                </div>

                <div className="mt-2 flex items-center space-x-6 text-sm text-gray-500">
                  <div className="flex items-center">
                    <MapPin className="w-4 h-4 mr-1" />
                    {field.area_hectares.toFixed(1)} ha
                  </div>
                  <div className="flex items-center">
                    <Activity className="w-4 h-4 mr-1" />
                    {field.crop_type.charAt(0).toUpperCase() + field.crop_type.slice(1)}
                  </div>
                  {field.growth_stage && (
                    <div>
                      Stage: {field.growth_stage.replace('_', ' ')}
                    </div>
                  )}
                </div>

                <div className="mt-3 flex items-center space-x-6 text-sm">
                  <div className="flex items-center">
                    <span className="text-gray-500 mr-2">Health Score:</span>
                    <span className="font-medium">{field.healthScore?.toFixed(0) || 'N/A'}</span>
                  </div>
                  {field.ndvi !== undefined && (
                    <div className="flex items-center">
                      <span className="text-gray-500 mr-2">NDVI:</span>
                      <span className="font-medium">{field.ndvi.toFixed(3)}</span>
                      {field.ndvi > 0.6 ? (
                        <TrendingUp className="w-4 h-4 ml-1 text-green-500" />
                      ) : field.ndvi < 0.3 ? (
                        <TrendingDown className="w-4 h-4 ml-1 text-red-500" />
                      ) : null}
                    </div>
                  )}
                  <div className="flex items-center">
                    <span className="text-gray-500 mr-2">Last Update:</span>
                    <span className="text-gray-700">{formatDate(field.lastUpdate || '')}</span>
                  </div>
                </div>
              </div>

              <div className="flex-shrink-0 ml-6">
                <div className="w-16 h-16 rounded-full border-4 border-gray-200 flex items-center justify-center relative">
                  <div
                    className={`absolute inset-0 rounded-full border-4 ${field.status === 'excellent' ? 'border-green-500' :
                        field.status === 'good' ? 'border-green-400' :
                          field.status === 'fair' ? 'border-yellow-500' :
                            field.status === 'poor' ? 'border-orange-500' :
                              field.status === 'critical' ? 'border-red-500' :
                                'border-gray-300'
                      }`}
                    style={{
                      background: `conic-gradient(currentColor ${(field.healthScore || 0) * 3.6}deg, transparent 0deg)`
                    }}
                  ></div>
                  <span className="text-sm font-semibold text-gray-900 relative z-10">
                    {field.healthScore?.toFixed(0) || '?'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}