-- AgriMonitor Lite Database Schema
-- SQLite database schema for agricultural monitoring system

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- Fields table - stores agricultural field information
CREATE TABLE IF NOT EXISTS fields (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    crop_type TEXT NOT NULL CHECK (crop_type IN ('wheat', 'rice', 'maize', 'cotton', 'soybean')),
    area_hectares REAL NOT NULL CHECK (area_hectares > 0),
    geometry TEXT NOT NULL, -- GeoJSON polygon
    field_capacity REAL CHECK (field_capacity >= 0 AND field_capacity <= 100), -- % soil moisture at field capacity
    wilting_point REAL CHECK (wilting_point >= 0 AND wilting_point <= 100), -- % soil moisture at wilting point
    planting_date DATE,
    growth_stage TEXT DEFAULT 'initial' CHECK (growth_stage IN ('initial', 'development', 'mid_season', 'late_season')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT valid_soil_moisture CHECK (wilting_point < field_capacity)
);

-- Satellite observations table - stores processed satellite imagery data
CREATE TABLE IF NOT EXISTS satellite_observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field_id INTEGER NOT NULL,
    observation_date DATE NOT NULL,
    ndvi REAL CHECK (ndvi >= -1 AND ndvi <= 1), -- Normalized Difference Vegetation Index
    ndwi REAL CHECK (ndwi >= -1 AND ndwi <= 1), -- Normalized Difference Water Index
    gndvi REAL CHECK (gndvi >= -1 AND gndvi <= 1), -- Green Normalized Difference Vegetation Index
    health_score REAL CHECK (health_score >= 0 AND health_score <= 100),
    cloud_cover REAL CHECK (cloud_cover >= 0 AND cloud_cover <= 100),
    image_source TEXT DEFAULT 'Sentinel-2',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE,
    UNIQUE(field_id, observation_date) -- Prevent duplicate observations for same field and date
);

-- Weather data table - stores weather information for fields
CREATE TABLE IF NOT EXISTS weather_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field_id INTEGER NOT NULL,
    date DATE NOT NULL,
    temperature_max REAL, -- Celsius
    temperature_min REAL, -- Celsius
    temperature_avg REAL, -- Celsius
    precipitation REAL DEFAULT 0, -- mm
    humidity REAL CHECK (humidity >= 0 AND humidity <= 100), -- %
    wind_speed REAL CHECK (wind_speed >= 0), -- m/s
    et0 REAL CHECK (et0 >= 0), -- Reference evapotranspiration (mm/day)
    solar_radiation REAL CHECK (solar_radiation >= 0), -- MJ/m²/day
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE,
    UNIQUE(field_id, date) -- Prevent duplicate weather data for same field and date
);

-- Sensor readings table - stores IoT sensor data
CREATE TABLE IF NOT EXISTS sensor_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field_id INTEGER NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    soil_moisture REAL CHECK (soil_moisture >= 0 AND soil_moisture <= 100), -- %
    soil_temperature REAL, -- Celsius
    battery_voltage REAL CHECK (battery_voltage >= 0), -- Volts
    sensor_id TEXT, -- Unique sensor identifier
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
);

-- Recommendations table - stores generated recommendations and actions
CREATE TABLE IF NOT EXISTS recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field_id INTEGER NOT NULL,
    recommendation_type TEXT NOT NULL CHECK (recommendation_type IN ('irrigation', 'fertilization', 'scouting', 'harvesting')),
    urgency TEXT NOT NULL DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
    action_text TEXT NOT NULL,
    reasoning TEXT NOT NULL,
    estimated_cost REAL CHECK (estimated_cost >= 0),
    expected_benefit TEXT,
    amount_mm REAL, -- For irrigation recommendations
    timing TEXT, -- When to perform the action
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged BOOLEAN DEFAULT 0,
    acknowledged_at TIMESTAMP,
    executed BOOLEAN DEFAULT 0,
    executed_at TIMESTAMP,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
);

-- Alerts table - stores system-generated alerts
CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    field_id INTEGER NOT NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('health_score', 'ndvi_decline', 'soil_moisture', 'weather', 'sensor')),
    severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('info', 'warning', 'critical')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    threshold_value REAL, -- The threshold that triggered the alert
    current_value REAL, -- The current value that exceeded the threshold
    generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    acknowledged BOOLEAN DEFAULT 0,
    acknowledged_at TIMESTAMP,
    resolved BOOLEAN DEFAULT 0,
    resolved_at TIMESTAMP,
    FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
);

-- Configuration table - stores system configuration
CREATE TABLE IF NOT EXISTS configuration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance optimization
CREATE INDEX IF NOT EXISTS idx_satellite_observations_field_date ON satellite_observations(field_id, observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_weather_data_field_date ON weather_data(field_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_sensor_readings_field_timestamp ON sensor_readings(field_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_field_generated ON recommendations(field_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_field_generated ON alerts(field_id, generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_severity_acknowledged ON alerts(severity, acknowledged);
CREATE INDEX IF NOT EXISTS idx_fields_crop_type ON fields(crop_type);

-- Insert default configuration values
INSERT OR IGNORE INTO configuration (key, value, description) VALUES
('health_score_threshold', '50', 'Health score threshold for generating alerts'),
('ndvi_decline_threshold', '15', 'NDVI decline percentage threshold for alerts'),
('soil_moisture_critical_threshold', '20', 'Critical soil moisture level for alerts'),
('weather_cache_duration', '3600', 'Weather data cache duration in seconds'),
('satellite_cache_duration', '86400', 'Satellite data cache duration in seconds'),
('api_rate_limit_window', '900000', 'API rate limit window in milliseconds'),
('api_rate_limit_max_requests', '100', 'Maximum API requests per window');

-- Create triggers to update the updated_at timestamp
CREATE TRIGGER IF NOT EXISTS update_fields_timestamp 
    AFTER UPDATE ON fields
    FOR EACH ROW
    BEGIN
        UPDATE fields SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;

CREATE TRIGGER IF NOT EXISTS update_configuration_timestamp 
    AFTER UPDATE ON configuration
    FOR EACH ROW
    BEGIN
        UPDATE configuration SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
    END;