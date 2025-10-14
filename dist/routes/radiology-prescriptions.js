"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const connection_1 = __importDefault(require("../database/connection"));
const router = express_1.default.Router();
// Get radiology prescriptions by appointment ID
router.get('/appointment/:appointmentId', async (req, res) => {
    try {
        const { appointmentId } = req.params;
        // First get patient details
        const patientQuery = `
      SELECT 
        a.appointment_id,
        a.patient_name,
        a.doctor_name,
        a.date as appointment_date,
        a.patient_phone
      FROM appointments a
      WHERE a.appointment_id = $1
    `;
        const patientResult = await connection_1.default.query(patientQuery, [appointmentId]);
        if (patientResult.rows.length === 0) {
            return res.status(404).json({ message: 'Patient not found' });
        }
        const patient = patientResult.rows[0];
        // Then get all radiology services for this patient
        const servicesQuery = `
      SELECT 
        rp.prescription_id,
        rp.appointment_id,
        rp.service_id,
        rp.status,
        rp.payment_status,
        rp.test_conducted,
        rp.test_conducted_at,
        rs.name as service_name,
        rs.description as service_description,
        NOW() as prescribed_date
      FROM radiology_prescriptions rp
      JOIN radiology_services rs ON rp.service_id = rs.service_id
      WHERE rp.appointment_id = $1
      ORDER BY rp.prescription_id DESC
    `;
        const servicesResult = await connection_1.default.query(servicesQuery, [appointmentId]);
        console.log('Services found for appointment:', servicesResult.rows.length);
        if (servicesResult.rows.length > 0) {
            console.log('Sample service data:', servicesResult.rows[0]);
        }
        // Return structured data
        res.json({
            patient: patient,
            services: servicesResult.rows
        });
    }
    catch (error) {
        console.error('Error fetching radiology prescriptions by appointment:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Update test conducted status
router.patch('/:prescriptionId/test-conducted', async (req, res) => {
    try {
        const { prescriptionId } = req.params;
        const { test_conducted } = req.body;
        console.log(`Updating test conducted for prescription ${prescriptionId} to ${test_conducted}`);
        const updateQuery = `
      UPDATE radiology_prescriptions 
      SET 
        test_conducted = $1,
        test_conducted_at = CASE 
          WHEN $1 = true THEN NOW()
          ELSE NULL
        END
      WHERE prescription_id = $2
      RETURNING *
    `;
        const result = await connection_1.default.query(updateQuery, [test_conducted, prescriptionId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Radiology prescription not found' });
        }
        console.log('Update result:', result.rows[0]);
        // Get the updated prescription with service details
        const getQuery = `
      SELECT 
        rp.prescription_id,
        rp.appointment_id,
        rp.service_id,
        rp.status,
        rp.payment_status,
        rp.test_conducted,
        rp.test_conducted_at,
        rs.name as service_name,
        rs.description as service_description,
        NOW() as prescribed_date
      FROM radiology_prescriptions rp
      JOIN radiology_services rs ON rp.service_id = rs.service_id
      WHERE rp.prescription_id = $1
    `;
        const prescriptionResult = await connection_1.default.query(getQuery, [prescriptionId]);
        console.log('Final result sent to frontend:', prescriptionResult.rows[0]);
        res.json(prescriptionResult.rows[0]);
    }
    catch (error) {
        console.error('Error updating test conducted status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Update status
router.patch('/:prescriptionId/status', async (req, res) => {
    try {
        const { prescriptionId } = req.params;
        const { status } = req.body;
        const updateQuery = `
      UPDATE radiology_prescriptions 
      SET status = $1
      WHERE prescription_id = $2
      RETURNING *
    `;
        const result = await connection_1.default.query(updateQuery, [status, prescriptionId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Radiology prescription not found' });
        }
        // Get the updated prescription with service details
        const getQuery = `
      SELECT 
        rp.prescription_id,
        rp.appointment_id,
        rp.service_id,
        rp.status,
        rp.payment_status,
        rp.test_conducted,
        rp.test_conducted_at,
        rs.name as service_name,
        rs.description as service_description,
        NOW() as prescribed_date
      FROM radiology_prescriptions rp
      JOIN radiology_services rs ON rp.service_id = rs.service_id
      WHERE rp.prescription_id = $1
    `;
        const prescriptionResult = await connection_1.default.query(getQuery, [prescriptionId]);
        res.json(prescriptionResult.rows[0]);
    }
    catch (error) {
        console.error('Error updating status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Update payment status
router.patch('/:prescriptionId/payment-status', async (req, res) => {
    try {
        const { prescriptionId } = req.params;
        const { payment_status } = req.body;
        const updateQuery = `
      UPDATE radiology_prescriptions 
      SET payment_status = $1
      WHERE prescription_id = $2
      RETURNING *
    `;
        const result = await connection_1.default.query(updateQuery, [payment_status, prescriptionId]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Radiology prescription not found' });
        }
        // Get the updated prescription with service details
        const getQuery = `
      SELECT 
        rp.prescription_id,
        rp.appointment_id,
        rp.service_id,
        rp.status,
        rp.payment_status,
        rp.test_conducted,
        rp.test_conducted_at,
        rs.name as service_name,
        rs.description as service_description,
        NOW() as prescribed_date
      FROM radiology_prescriptions rp
      JOIN radiology_services rs ON rp.service_id = rs.service_id
      WHERE rp.prescription_id = $1
    `;
        const prescriptionResult = await connection_1.default.query(getQuery, [prescriptionId]);
        res.json(prescriptionResult.rows[0]);
    }
    catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get all radiology prescriptions
router.get('/', async (req, res) => {
    try {
        const query = `
      SELECT 
        rp.prescription_id,
        rp.appointment_id,
        rp.service_id,
        rp.status,
        rp.payment_status,
        rp.test_conducted,
        rp.test_conducted_at,
        rs.name as service_name,
        rs.description as service_description,
        a.patient_name,
        a.doctor_name,
        NOW() as prescribed_date
      FROM radiology_prescriptions rp
      JOIN radiology_services rs ON rp.service_id = rs.service_id
      JOIN appointments a ON rp.appointment_id = a.appointment_id
      ORDER BY rp.prescription_id DESC
    `;
        const result = await connection_1.default.query(query);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching radiology prescriptions:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=radiology-prescriptions.js.map