import { Router } from 'express';
import { FieldController } from '../controllers/FieldController';

const router = Router();
const fieldController = new FieldController();

/**
 * Field Management Routes
 * Base path: /api/fields
 */

// Create a new field
router.post('/', async (req, res) => {
  await fieldController.createField(req, res);
});

// Get all fields with optional filtering and pagination
router.get('/', async (req, res) => {
  await fieldController.getFields(req, res);
});

// Get a specific field by ID
router.get('/:id', async (req, res) => {
  await fieldController.getFieldById(req, res);
});

// Update an existing field
router.put('/:id', async (req, res) => {
  await fieldController.updateField(req, res);
});

// Delete a field by ID
router.delete('/:id', async (req, res) => {
  await fieldController.deleteField(req, res);
});

// Get field health status
router.get('/:id/health', async (req, res) => {
  await fieldController.getFieldHealth(req, res);
});

export default router;