import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { dbManager } from './database';
import { errorHandler, notFoundHandler, requestLogger } from './middleware/errorHandler';

// Import route modules
import fieldRoutes from './routes/fieldRoutes';
import satelliteRoutes from './routes/satelliteRoutes';
import weatherRoutes from './routes/weatherRoutes';
import recommendationRoutes from './routes/recommendationRoutes';
import alertRoutes from './routes/alertRoutes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3003;

// Security middleware
app.use(helmet());
app.use(cors());

// Request logging middleware
app.use(requestLogger);

// Logging middleware
app.use(morgan('combined', { stream: { write: (message) => logger.info(message.trim()) } }));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'connected',
      api: 'running'
    }
  });
});

// API root endpoint with comprehensive endpoint listing
app.get('/api', (_req, res) => {
  res.json({
    message: 'AgriMonitor Lite API',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      health: '/health',
      fields: {
        base: '/api/fields',
        operations: ['GET /', 'POST /', 'GET /:id', 'PUT /:id', 'DELETE /:id', 'GET /:id/health']
      },
      satellite: {
        base: '/api/satellite',
        operations: ['GET /field/:fieldId', 'GET /field/:fieldId/latest', 'GET /field/:fieldId/health-history', 'POST /field/:fieldId/process']
      },
      weather: {
        base: '/api/weather',
        operations: ['GET /current', 'GET /forecast', 'GET /field/:fieldId', 'GET /evapotranspiration']
      },
      recommendations: {
        base: '/api/recommendations',
        operations: ['GET /irrigation/field/:fieldId', 'GET /crop-coefficients/:cropType', 'GET /crop-types']
      },
      alerts: {
        base: '/api/alerts',
        operations: ['GET /', 'GET /field/:fieldId', 'PATCH /:alertId/acknowledge', 'GET /stats/summary']
      }
    }
  });
});

// API Routes
app.use('/api/fields', fieldRoutes);
app.use('/api/satellite', satelliteRoutes);
app.use('/api/weather', weatherRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/alerts', alertRoutes);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handling middleware
app.use(errorHandler);

// Start server only if this file is run directly
if (require.main === module) {
  // Initialize database before starting server
  dbManager.initialize()
    .then(() => {
      app.listen(PORT, () => {
        logger.info(`AgriMonitor Lite server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info('Available endpoints:');
        logger.info('  - Health: GET /health');
        logger.info('  - API Info: GET /api');
        logger.info('  - Fields: /api/fields/*');
        logger.info('  - Satellite: /api/satellite/*');
        logger.info('  - Weather: /api/weather/*');
        logger.info('  - Recommendations: /api/recommendations/*');
        logger.info('  - Alerts: /api/alerts/*');
      });
    })
    .catch((error) => {
      logger.error('Failed to initialize database:', error);
      process.exit(1);
    });
}

export default app;