# AgriMonitor Lite

A lightweight, 100% free agricultural monitoring system that combines satellite imagery with IoT validation to detect crop stress 5-10 days before visible symptoms and provide actionable recommendations.

## Features

- **Free Data Sources**: Sentinel-2 satellite imagery via Google Earth Engine + OpenWeatherMap
- **Real-time Monitoring**: Automated satellite analysis and weather integration
- **Smart Alerts**: Configurable thresholds for crop health and soil moisture
- **FAO-Based Models**: Science-backed irrigation recommendations using FAO methodology
- **Interactive Dashboard**: Web-based interface for field management and visualization
- **Property-Based Testing**: Comprehensive testing with formal correctness properties

## Technology Stack

- **Backend**: Node.js + TypeScript + Express
- **Database**: SQLite (portable, no external dependencies)
- **APIs**: Google Earth Engine, OpenWeatherMap
- **Testing**: Jest + Fast-Check (property-based testing)
- **Frontend**: React + TypeScript (separate dashboard application)

## Quick Start

### Prerequisites

- Node.js 18+ 
- Google Earth Engine service account
- OpenWeatherMap API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd agrimonitor-lite
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your API keys and configuration
```

4. Set up Google Earth Engine:
   - Create a service account at https://earthengine.google.com/
   - Download the JSON key file to `config/gee-service-account.json`
   - Update `GEE_SERVICE_ACCOUNT_EMAIL` and `GEE_PRIVATE_KEY_PATH` in `.env`

5. Get OpenWeatherMap API key:
   - Sign up at https://openweathermap.org/api
   - Update `OPENWEATHER_API_KEY` in `.env`

### Development

```bash
# Start development server
npm run dev

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build for production
npm run build

# Start production server
npm start
```

## API Endpoints

- `GET /health` - Health check
- `GET /api` - API information
- `POST /api/fields` - Create new field
- `GET /api/fields` - List all fields
- `GET /api/fields/:id` - Get field details
- `GET /api/fields/:id/health` - Get field health status
- `GET /api/fields/:id/timeseries` - Get historical data
- `GET /api/alerts` - Get active alerts

## Project Structure

```
src/
├── controllers/     # API route handlers
├── services/        # Business logic services
├── models/          # Data models and interfaces
├── database/        # Database schema and connections
├── middleware/      # Express middleware
├── utils/           # Utility functions
├── config/          # Configuration management
└── test/           # Test utilities and setup
```

## Testing

The project uses a dual testing approach:

- **Unit Tests**: Specific examples and edge cases
- **Property Tests**: Universal properties across all inputs using Fast-Check

Run tests with:
```bash
npm test                 # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

## Configuration

Key configuration options in `.env`:

- `GEE_SERVICE_ACCOUNT_EMAIL`: Google Earth Engine service account
- `OPENWEATHER_API_KEY`: OpenWeatherMap API key
- `HEALTH_SCORE_THRESHOLD`: Alert threshold for field health (default: 50)
- `NDVI_DECLINE_THRESHOLD`: NDVI decline percentage for alerts (default: 15)
- `SOIL_MOISTURE_CRITICAL_THRESHOLD`: Critical soil moisture level (default: 20)

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request

## Support

For issues and questions:
- Create an issue on GitHub
- Check the documentation in the `/docs` folder
- Review the API specification at `/api` endpoint