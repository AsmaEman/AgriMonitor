import 'reflect-metadata';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { logger } from './utils/logger';
import { dbManager } from './database';
import fieldRoutes from './routes/fieldRoutes';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

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
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes will be added here
app.get('/api', (_req, res) => {
  res.json({
    message: 'AgriMonitor Lite API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      fields: '/api/fields',
      satellite: '/api/satellite',
      weather: '/api/weather',
      recommendations: '/api/recommendations',
      alerts: '/api/alerts'
    }
  });
});

// Field management routes
app.use('/api/fields', fieldRoutes);

// Error handling middleware
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  });
});

// Start server only if this file is run directly
if (require.main === module) {
  // Initialize database before starting server
  dbManager.initialize()
    .then(() => {
      app.listen(PORT, () => {
        logger.info(`AgriMonitor Lite server running on port ${PORT}`);
        logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });
    })
    .catch((error) => {
      logger.error('Failed to initialize database:', error);
      process.exit(1);
    });
}

export default app;