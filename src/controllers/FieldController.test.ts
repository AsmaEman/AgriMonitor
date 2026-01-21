import request from 'supertest';
import app from '../index';
import { dbManager } from '../database';

describe('Field Management API Endpoints', () => {
  beforeAll(async () => {
    // Initialize in-memory database for testing
    process.env.DATABASE_PATH = ':memory:';
    await dbManager.initialize();
  });

  afterAll(async () => {
    await dbManager.close();
  });

  beforeEach(async () => {
    // Clean up fields table before each test
    const db = dbManager.getDatabase();
    await db.run('DELETE FROM fields');
  });

  describe('POST /api/fields', () => {
    test('should create a new field with valid data', async () => {
      const fieldData = {
        name: 'Test Field',
        crop_type: 'wheat',
        area_hectares: 10.5,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]]
        },
        field_capacity: 25,
        wilting_point: 10
      };

      const response = await request(app)
        .post('/api/fields')
        .send(fieldData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(fieldData.name);
      expect(response.body.data.crop_type).toBe(fieldData.crop_type);
      expect(response.body.data.id).toBeDefined();
    });

    test('should reject field creation with missing required fields', async () => {
      const fieldData = {
        name: 'Test Field'
        // Missing crop_type, area_hectares, geometry
      };

      const response = await request(app)
        .post('/api/fields')
        .send(fieldData)
        .expect(400);

      expect(response.body.error).toBe('Missing required fields');
      expect(response.body.required_fields).toContain('crop_type');
    });

    test('should reject field creation with invalid crop type', async () => {
      const fieldData = {
        name: 'Test Field',
        crop_type: 'invalid_crop',
        area_hectares: 10.5,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]]
        }
      };

      const response = await request(app)
        .post('/api/fields')
        .send(fieldData)
        .expect(400);

      expect(response.body.error).toBe('Invalid crop type');
    });

    test('should reject field creation with invalid coordinates', async () => {
      const fieldData = {
        name: 'Test Field',
        crop_type: 'wheat',
        area_hectares: 10.5,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [200, 0], // Invalid longitude
            [1, 0],
            [1, 1],
            [0, 1],
            [200, 0]
          ]]
        }
      };

      const response = await request(app)
        .post('/api/fields')
        .send(fieldData)
        .expect(400);

      expect(response.body.error).toBe('Invalid geometry');
    });
  });

  describe('GET /api/fields', () => {
    test('should retrieve all fields', async () => {
      // Create a test field first
      const fieldData = {
        name: 'Test Field',
        crop_type: 'wheat',
        area_hectares: 10.5,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]]
        }
      };

      await request(app)
        .post('/api/fields')
        .send(fieldData)
        .expect(201);

      const response = await request(app)
        .get('/api/fields')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].name).toBe(fieldData.name);
      expect(response.body.pagination.total).toBe(1);
    });

    test('should filter fields by crop type', async () => {
      // Create fields with different crop types
      const wheatField = {
        name: 'Wheat Field',
        crop_type: 'wheat',
        area_hectares: 10.5,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]]
        }
      };

      const riceField = {
        name: 'Rice Field',
        crop_type: 'rice',
        area_hectares: 15.0,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [2, 2],
            [3, 2],
            [3, 3],
            [2, 3],
            [2, 2]
          ]]
        }
      };

      await request(app).post('/api/fields').send(wheatField);
      await request(app).post('/api/fields').send(riceField);

      const response = await request(app)
        .get('/api/fields?crop_type=wheat')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].crop_type).toBe('wheat');
    });

    test('should handle pagination', async () => {
      // Create multiple fields
      for (let i = 0; i < 5; i++) {
        const fieldData = {
          name: `Test Field ${i}`,
          crop_type: 'wheat',
          area_hectares: 10.5,
          geometry: {
            type: 'Polygon',
            coordinates: [[
              [i, i],
              [i + 1, i],
              [i + 1, i + 1],
              [i, i + 1],
              [i, i]
            ]]
          }
        };
        await request(app).post('/api/fields').send(fieldData);
      }

      const response = await request(app)
        .get('/api/fields?limit=2&offset=1')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.pagination.total).toBe(5);
      expect(response.body.pagination.count).toBe(2);
      expect(response.body.pagination.offset).toBe(1);
    });
  });

  describe('GET /api/fields/:id', () => {
    test('should retrieve a specific field by ID', async () => {
      const fieldData = {
        name: 'Test Field',
        crop_type: 'wheat',
        area_hectares: 10.5,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]]
        }
      };

      const createResponse = await request(app)
        .post('/api/fields')
        .send(fieldData);

      const fieldId = createResponse.body.data.id;

      const response = await request(app)
        .get(`/api/fields/${fieldId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(fieldId);
      expect(response.body.data.name).toBe(fieldData.name);
    });

    test('should return 404 for non-existent field', async () => {
      const response = await request(app)
        .get('/api/fields/999')
        .expect(404);

      expect(response.body.error).toBe('Field not found');
    });

    test('should return 400 for invalid field ID', async () => {
      const response = await request(app)
        .get('/api/fields/invalid')
        .expect(400);

      expect(response.body.error).toBe('Invalid field ID');
    });
  });

  describe('PUT /api/fields/:id', () => {
    test('should update an existing field', async () => {
      const fieldData = {
        name: 'Test Field',
        crop_type: 'wheat',
        area_hectares: 10.5,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]]
        },
        field_capacity: 30,
        wilting_point: 15
      };

      const createResponse = await request(app)
        .post('/api/fields')
        .send(fieldData);

      const fieldId = createResponse.body.data.id;

      const updateData = {
        name: 'Updated Field Name',
        area_hectares: 15.0
      };

      const response = await request(app)
        .put(`/api/fields/${fieldId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(updateData.name);
      expect(response.body.data.area_hectares).toBe(updateData.area_hectares);
      expect(response.body.data.crop_type).toBe(fieldData.crop_type); // Should remain unchanged
    });

    test('should return 404 for non-existent field update', async () => {
      const updateData = {
        name: 'Updated Field Name'
      };

      const response = await request(app)
        .put('/api/fields/999')
        .send(updateData)
        .expect(404);

      expect(response.body.error).toBe('Field not found');
    });
  });

  describe('DELETE /api/fields/:id', () => {
    test('should delete an existing field', async () => {
      const fieldData = {
        name: 'Test Field',
        crop_type: 'wheat',
        area_hectares: 10.5,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]]
        }
      };

      const createResponse = await request(app)
        .post('/api/fields')
        .send(fieldData);

      const fieldId = createResponse.body.data.id;

      const response = await request(app)
        .delete(`/api/fields/${fieldId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.field_id).toBe(fieldId);

      // Verify field is deleted
      await request(app)
        .get(`/api/fields/${fieldId}`)
        .expect(404);
    });

    test('should return 404 for non-existent field deletion', async () => {
      const response = await request(app)
        .delete('/api/fields/999')
        .expect(404);

      expect(response.body.error).toBe('Field not found');
    });
  });

  describe('GET /api/fields/:id/health', () => {
    test('should return field health status placeholder', async () => {
      const fieldData = {
        name: 'Test Field',
        crop_type: 'wheat',
        area_hectares: 10.5,
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]]
        }
      };

      const createResponse = await request(app)
        .post('/api/fields')
        .send(fieldData);

      const fieldId = createResponse.body.data.id;

      const response = await request(app)
        .get(`/api/fields/${fieldId}/health`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.field_id).toBe(fieldId);
      expect(response.body.data.status).toBe('No satellite data available yet');
    });
  });
});