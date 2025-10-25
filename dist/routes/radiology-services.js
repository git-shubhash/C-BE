"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const connection_1 = __importDefault(require("../database/connection"));
const router = express_1.default.Router();
// Get all radiology services
router.get('/', async (req, res) => {
    try {
        const query = `
      SELECT 
        service_id,
        name,
        price
      FROM radiology_services 
      ORDER BY name ASC
    `;
        const result = await connection_1.default.query(query);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching radiology services:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Add new radiology service
router.post('/', async (req, res) => {
    try {
        const { name, price } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }
        const query = `
      INSERT INTO radiology_services (name, price)
      VALUES ($1, $2)
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [name, price || null]);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error('Error adding radiology service:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Update radiology service
router.put('/:serviceId', async (req, res) => {
    try {
        const { serviceId } = req.params;
        const { name, price } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Name is required' });
        }
        const query = `
      UPDATE radiology_services 
      SET name = $1, price = $3
      WHERE service_id = $2
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [name, price || null, serviceId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Radiology service not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error updating radiology service:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Delete radiology service
router.delete('/:serviceId', async (req, res) => {
    try {
        const { serviceId } = req.params;
        // Check if service is being used in prescriptions
        const checkQuery = `
      SELECT COUNT(*) as count FROM radiology_prescriptions 
      WHERE service_id = $1
    `;
        const checkResult = await connection_1.default.query(checkQuery, [serviceId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            return res.status(400).json({
                message: 'Cannot delete service as it is being used in prescriptions'
            });
        }
        // Check if service has templates
        const templateCheckQuery = `
      SELECT COUNT(*) as count FROM radiology_report_templates 
      WHERE service_id = $1
    `;
        const templateCheckResult = await connection_1.default.query(templateCheckQuery, [serviceId]);
        if (parseInt(templateCheckResult.rows[0].count) > 0) {
            return res.status(400).json({
                message: 'Cannot delete service as it has associated report templates'
            });
        }
        const deleteQuery = `
      DELETE FROM radiology_services 
      WHERE service_id = $1
      RETURNING *
    `;
        const result = await connection_1.default.query(deleteQuery, [serviceId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Radiology service not found' });
        }
        res.json({ message: 'Service deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting radiology service:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get templates for a service
router.get('/:serviceId/templates', async (req, res) => {
    try {
        const { serviceId } = req.params;
        const query = `
      SELECT 
        template_id,
        template_name,
        template_structure,
        created_at,
        updated_at
      FROM radiology_report_templates 
      WHERE service_id = $1
      ORDER BY template_name ASC
    `;
        const result = await connection_1.default.query(query, [serviceId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Add new template
router.post('/:serviceId/templates', async (req, res) => {
    try {
        const { serviceId } = req.params;
        const { template_name, template_structure } = req.body;
        if (!template_name || !template_structure) {
            return res.status(400).json({ message: 'Template name and structure are required' });
        }
        const query = `
      INSERT INTO radiology_report_templates (service_id, template_name, template_structure)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [serviceId, template_name, template_structure]);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error('Error adding template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Update template
router.put('/:serviceId/templates/:templateId', async (req, res) => {
    try {
        const { serviceId, templateId } = req.params;
        const { template_name, template_structure } = req.body;
        if (!template_name || !template_structure) {
            return res.status(400).json({ message: 'Template name and structure are required' });
        }
        const query = `
      UPDATE radiology_report_templates 
      SET template_name = $1, template_structure = $2
      WHERE template_id = $3 AND service_id = $4
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [template_name, template_structure, templateId, serviceId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Template not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Delete template
router.delete('/:serviceId/templates/:templateId', async (req, res) => {
    try {
        const { serviceId, templateId } = req.params;
        // Check if template is being used in reports
        const checkQuery = `
      SELECT COUNT(*) as count FROM radiology_reports 
      WHERE template_id = $1
    `;
        const checkResult = await connection_1.default.query(checkQuery, [templateId]);
        if (parseInt(checkResult.rows[0].count) > 0) {
            return res.status(400).json({
                message: 'Cannot delete template as it is being used in reports'
            });
        }
        const deleteQuery = `
      DELETE FROM radiology_report_templates 
      WHERE template_id = $1 AND service_id = $2
      RETURNING *
    `;
        const result = await connection_1.default.query(deleteQuery, [templateId, serviceId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Template not found' });
        }
        res.json({ message: 'Template deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=radiology-services.js.map