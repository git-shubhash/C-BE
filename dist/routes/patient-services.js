"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const connection_1 = __importDefault(require("../database/connection"));
const router = express_1.default.Router();
// Get all patient services
router.get('/', async (req, res) => {
    try {
        const query = `
      SELECT 
        ps.patient_service_id,
        ps.appointment_id,
        ps.service_type_id,
        ps.prescribed_at,
        ps.sample_collected,
        ps.sample_collected_at,
        ps.report_status,
        ps.payment_status,
        st.service_type_name,
        a.patient_name,
        a.doctor_name,
        ps.prescribed_at as prescribed_date
      FROM patient_services ps
      JOIN service_types st ON ps.service_type_id = st.service_type_id
      JOIN appointments a ON ps.appointment_id = a.appointment_id
      ORDER BY ps.prescribed_at DESC
    `;
        const result = await connection_1.default.query(query);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching patient services:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get patient services by appointment ID
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
        // Then get all services for this patient
        const servicesQuery = `
      SELECT 
        ps.patient_service_id,
        ps.appointment_id,
        ps.service_type_id,
        ps.prescribed_at,
        ps.sample_collected,
        ps.sample_collected_at,
        ps.report_status,
        ps.payment_status,
        st.service_type_name,
        st.sub_department_id,
        sd.sub_department_name,
        ps.prescribed_at as prescribed_date
      FROM patient_services ps
      JOIN service_types st ON ps.service_type_id = st.service_type_id
      JOIN sub_departments sd ON st.sub_department_id = sd.sub_department_id
      WHERE ps.appointment_id = $1
      ORDER BY ps.prescribed_at DESC
    `;
        const servicesResult = await connection_1.default.query(servicesQuery, [appointmentId]);
        // Return structured data
        res.json({
            patient: patient,
            services: servicesResult.rows
        });
    }
    catch (error) {
        console.error('Error fetching patient services by appointment:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Update sample collection status
router.patch('/:id/sample-collected', async (req, res) => {
    try {
        const { id } = req.params;
        const { sample_collected } = req.body;
        const query = `
      UPDATE patient_services 
      SET sample_collected = $1, sample_collected_at = CASE WHEN $1 = true THEN now() ELSE NULL END
      WHERE patient_service_id = $2
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [sample_collected, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Patient service not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error updating sample collection status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Update report status
router.patch('/:id/report-status', async (req, res) => {
    try {
        const { id } = req.params;
        const { report_status } = req.body;
        if (!['Pending', 'InProgress', 'Completed'].includes(report_status)) {
            return res.status(400).json({ message: 'Invalid report status' });
        }
        const query = `
      UPDATE patient_services 
      SET report_status = $1
      WHERE patient_service_id = $2
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [report_status, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Patient service not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error updating report status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Update payment status
router.patch('/:id/payment-status', async (req, res) => {
    try {
        const { id } = req.params;
        const { payment_status } = req.body;
        if (typeof payment_status !== 'boolean') {
            return res.status(400).json({ message: 'Payment status must be a boolean value' });
        }
        const query = `
      UPDATE patient_services 
      SET payment_status = $1
      WHERE patient_service_id = $2
      RETURNING *
    `;
        const result = await connection_1.default.query(query, [payment_status, id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Patient service not found' });
        }
        res.json(result.rows[0]);
    }
    catch (error) {
        console.error('Error updating payment status:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get medical report data for a specific patient service
router.get('/:id/medical-report', async (req, res) => {
    try {
        const { id } = req.params;
        // Get patient service details with appointment and patient info
        const serviceQuery = `
      SELECT 
        ps.patient_service_id,
        ps.appointment_id,
        ps.sample_collected_at,
        st.service_type_name,
        sd.sub_department_name,
        a.patient_name,
        a.doctor_name,
        a.patient_phone
      FROM patient_services ps
      JOIN service_types st ON ps.service_type_id = st.service_type_id
      JOIN sub_departments sd ON st.sub_department_id = sd.sub_department_id
      JOIN appointments a ON ps.appointment_id = a.appointment_id
      WHERE ps.patient_service_id = $1
    `;
        const serviceResult = await connection_1.default.query(serviceQuery, [id]);
        if (serviceResult.rows.length === 0) {
            return res.status(404).json({ message: 'Patient service not found' });
        }
        const serviceData = serviceResult.rows[0];
        // Get test results for this patient service with the latest reported_at date
        const testResultsQuery = `
      SELECT 
        ptr.result_id,
        ptr.patient_test_id,
        ptr.result_value,
        ptr.reported_at,
        t.test_name,
        t.unit,
        t.normal_min,
        t.normal_max
      FROM patient_test_results ptr
      JOIN patient_tests pt ON ptr.patient_test_id = pt.patient_test_id
      JOIN tests t ON pt.test_id = t.test_id
      WHERE pt.patient_service_id = $1
      ORDER BY t.test_name
    `;
        const testResultsResult = await connection_1.default.query(testResultsQuery, [id]);
        // Get the latest report date from test results
        const latestReportDate = testResultsResult.rows.length > 0
            ? testResultsResult.rows.reduce((latest, current) => new Date(current.reported_at) > new Date(latest.reported_at) ? current : latest).reported_at
            : serviceData.sample_collected_at;
        // Structure the response data with only required fields
        const reportData = {
            patient_info: {
                patient_name: serviceData.patient_name,
                doctor_name: serviceData.doctor_name,
                phone: serviceData.patient_phone || '',
                sample_collected: serviceData.sample_collected_at,
                sample_received: serviceData.sample_collected_at, // Same as sample collected
                report_on: latestReportDate
            },
            service_info: {
                service_type_name: serviceData.service_type_name,
                sub_department_name: serviceData.sub_department_name
            },
            test_results: testResultsResult.rows
        };
        res.json(reportData);
    }
    catch (error) {
        console.error('Error fetching medical report data:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
// Get test results for a patient service
router.get('/:id/test-results', async (req, res) => {
    try {
        const { id } = req.params;
        const query = `
      SELECT 
        ptr.result_id,
        ptr.patient_test_id,
        ptr.result_value,
        ptr.reported_at,
        t.test_name,
        t.unit,
        t.normal_min,
        t.normal_max
      FROM patient_test_results ptr
      JOIN patient_tests pt ON ptr.patient_test_id = pt.patient_test_id
      JOIN tests t ON pt.test_id = t.test_id
      WHERE pt.patient_service_id = $1
      ORDER BY t.test_name
    `;
        const result = await connection_1.default.query(query, [id]);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching test results:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
//# sourceMappingURL=patient-services.js.map