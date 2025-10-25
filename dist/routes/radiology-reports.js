"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const connection_1 = __importDefault(require("../database/connection"));
const router = express_1.default.Router();
// Get all radiology reports
router.get('/', async (req, res) => {
    try {
        const query = `
      SELECT 
        rr.report_id,
        rr.prescription_id,
        rr.template_id,
        rr.report_data,
        rr.report_file_path,
        rr.created_at,
        rr.updated_at,
        rp.service_id,
        rs.name as service_name,
        a.patient_name,
        a.doctor_name
      FROM radiology_reports rr
      JOIN radiology_prescriptions rp ON rr.prescription_id = rp.prescription_id
      JOIN radiology_services rs ON rp.service_id = rs.service_id
      JOIN appointments a ON rp.appointment_id = a.appointment_id
      ORDER BY rr.created_at DESC
    `;
        const result = await connection_1.default.query(query);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching radiology reports:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get radiology report by ID
router.get('/:reportId', async (req, res) => {
    try {
        const { reportId } = req.params;
        const query = `
      SELECT 
        rr.report_id,
        rr.prescription_id,
        rr.template_id,
        rr.report_data,
        rr.report_file_path,
        rr.created_at,
        rr.updated_at,
        rp.service_id,
        rs.name as service_name,
        a.patient_name,
        a.doctor_name,
        a.patient_phone,
        a.date as appointment_date
      FROM radiology_reports rr
      JOIN radiology_prescriptions rp ON rr.prescription_id = rp.prescription_id
      JOIN radiology_services rs ON rp.service_id = rs.service_id
      JOIN appointments a ON rp.appointment_id = a.appointment_id
      WHERE rr.report_id = $1
    `;
        const result = await connection_1.default.query(query, [reportId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Radiology report not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error fetching radiology report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get radiology reports by prescription ID
router.get('/prescription/:prescriptionId', async (req, res) => {
    try {
        const { prescriptionId } = req.params;
        const query = `
      SELECT 
        rr.report_id,
        rr.prescription_id,
        rr.template_id,
        rr.report_data,
        rr.report_file_path,
        rr.created_at,
        rr.updated_at,
        rp.service_id,
        rs.name as service_name
      FROM radiology_reports rr
      JOIN radiology_prescriptions rp ON rr.prescription_id = rp.prescription_id
      JOIN radiology_services rs ON rp.service_id = rs.service_id
      WHERE rr.prescription_id = $1
    `;
        const result = await connection_1.default.query(query, [prescriptionId]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching radiology reports by prescription:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Create new radiology report
router.post('/', async (req, res) => {
    try {
        const { prescription_id, template_id, report_data } = req.body;
        if (!prescription_id || !template_id || !report_data) {
            return res.status(400).json({ message: 'Prescription ID, template ID, and report data are required' });
        }
        // Check if prescription exists
        const prescriptionQuery = `
      SELECT * FROM radiology_prescriptions WHERE prescription_id = $1
    `;
        const prescriptionResult = await connection_1.default.query(prescriptionQuery, [prescription_id]);
        if (prescriptionResult.rows.length === 0) {
            return res.status(404).json({ message: 'Radiology prescription not found' });
        }
        // Check if template exists
        const templateQuery = `
      SELECT * FROM radiology_report_templates WHERE template_id = $1
    `;
        const templateResult = await connection_1.default.query(templateQuery, [template_id]);
        if (templateResult.rows.length === 0) {
            return res.status(404).json({ message: 'Radiology report template not found' });
        }
        // Insert new report
        const insertQuery = `
      INSERT INTO radiology_reports (prescription_id, template_id, report_data)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
        const result = await connection_1.default.query(insertQuery, [prescription_id, template_id, report_data]);
        // Update prescription status to completed
        const updatePrescriptionQuery = `
      UPDATE radiology_prescriptions
      SET status = 'completed'
      WHERE prescription_id = $1
    `;
        await connection_1.default.query(updatePrescriptionQuery, [prescription_id]);
        res.status(201).json(result.rows[0]);
    }
    catch (error) {
        console.error('Error creating radiology report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Update radiology report
router.put('/:reportId', async (req, res) => {
    try {
        const { reportId } = req.params;
        const { report_data, report_file_path } = req.body;
        if (!report_data) {
            return res.status(400).json({ message: 'Report data is required' });
        }
        const query = `
      UPDATE radiology_reports
      SET 
        report_data = $1,
        report_file_path = $2,
        updated_at = NOW()
      WHERE report_id = $3
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [report_data, report_file_path || null, reportId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Radiology report not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error updating radiology report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Delete radiology report
router.delete('/:reportId', async (req, res) => {
    try {
        const { reportId } = req.params;
        const query = `
      DELETE FROM radiology_reports
      WHERE report_id = $1
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [reportId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Radiology report not found' });
        }
        res.json({ message: 'Radiology report deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting radiology report:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=radiology-reports.js.map