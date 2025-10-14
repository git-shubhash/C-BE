import express from 'express';
import pool from '../database/connection';

const router = express.Router();

// Get pending lab tests (sample collected but report pending)
router.get('/pending', async (req, res) => {
  try {
    const query = `
      SELECT 
        a.appointment_id,
        a.patient_name,
        a.doctor_name,
        a.date as appointment_date,
        ps.patient_service_id,
        st.service_type_name,
        sd.sub_department_name,
        ps.sample_collected,
        ps.sample_collected_at,
        ps.report_status
      FROM patient_services ps
      JOIN appointments a ON ps.appointment_id = a.appointment_id
      JOIN service_types st ON ps.service_type_id = st.service_type_id
      JOIN sub_departments sd ON st.sub_department_id = sd.sub_department_id
      WHERE ps.sample_collected = true 
        AND ps.report_status = 'Pending'
      ORDER BY ps.sample_collected_at DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching pending lab tests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get completed lab reports
router.get('/completed', async (req, res) => {
  try {
    const query = `
      SELECT 
        a.appointment_id,
        a.patient_name,
        a.doctor_name,
        a.date as appointment_date,
        ps.patient_service_id,
        st.service_type_name,
        sd.sub_department_name,
        ps.sample_collected,
        ps.sample_collected_at,
        ps.report_status
      FROM patient_services ps
      JOIN appointments a ON ps.appointment_id = a.appointment_id
      JOIN service_types st ON ps.service_type_id = st.service_type_id
      JOIN sub_departments sd ON st.sub_department_id = sd.sub_department_id
      WHERE ps.report_status = 'Completed'
      ORDER BY ps.sample_collected_at DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching completed lab reports:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get tests for a specific patient service
router.get('/service/:patientServiceId', async (req, res) => {
  try {
    const { patientServiceId } = req.params;
    
    // Get the service_type_id for this patient_service
    const serviceQuery = `
      SELECT service_type_id FROM patient_services WHERE patient_service_id = $1
    `;
    const serviceResult = await pool.query(serviceQuery, [patientServiceId]);
    
    if (serviceResult.rows.length === 0) {
      return res.status(404).json({ message: 'Patient service not found' });
    }
    
    const serviceTypeId = serviceResult.rows[0].service_type_id;
    
    // Get all tests for this service type
    const allTestsQuery = `
      SELECT test_id FROM tests WHERE service_type_id = $1
    `;
    const allTestsResult = await pool.query(allTestsQuery, [serviceTypeId]);
    
    // Get existing patient_tests for this service
    const existingTestsQuery = `
      SELECT test_id FROM patient_tests WHERE patient_service_id = $1
    `;
    const existingTestsResult = await pool.query(existingTestsQuery, [patientServiceId]);
    
    // Find tests that need to be created (new tests added to the service type)
    const existingTestIds = new Set(existingTestsResult.rows.map(row => row.test_id));
    const newTests = allTestsResult.rows.filter(test => !existingTestIds.has(test.test_id));
    
    // Create patient_tests records for any new tests
    for (const test of newTests) {
      await pool.query(`
        INSERT INTO patient_tests (patient_service_id, test_id)
        VALUES ($1, $2)
      `, [patientServiceId, test.test_id]);
    }
    
    // Now fetch all patient_tests (including newly created ones)
    const finalQuery = `
      SELECT 
        pt.patient_test_id,
        pt.patient_service_id,
        pt.test_id,
        t.test_name,
        t.unit,
        t.normal_min,
        t.normal_max
      FROM patient_tests pt
      JOIN tests t ON pt.test_id = t.test_id
      WHERE pt.patient_service_id = $1
      ORDER BY t.test_name
    `;
    
    const result = await pool.query(finalQuery, [patientServiceId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tests by service:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get test results for a specific patient test
router.get('/:patientTestId/results', async (req, res) => {
  try {
    const { patientTestId } = req.params;
    
    const query = `
      SELECT 
        result_id,
        patient_test_id,
        result_value,
        reported_at
      FROM patient_test_results
      WHERE patient_test_id = $1
      ORDER BY reported_at DESC
    `;
    
    const result = await pool.query(query, [patientTestId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching test results:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Save a new test result
router.post('/:patientTestId/results', async (req, res) => {
  try {
    const { patientTestId } = req.params;
    const { result_value } = req.body;
    
    if (!result_value) {
      return res.status(400).json({ message: 'Result value is required' });
    }
    
    const query = `
      INSERT INTO patient_test_results (patient_test_id, result_value)
      VALUES ($1, $2)
      RETURNING *
    `;
    
    const result = await pool.query(query, [patientTestId, result_value]);
    
    // Update the report status to InProgress
    await pool.query(`
      UPDATE patient_services 
      SET report_status = 'InProgress'
      WHERE patient_service_id = (
        SELECT patient_service_id FROM patient_tests WHERE patient_test_id = $1
      )
    `, [patientTestId]);
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error saving test result:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update an existing test result
router.patch('/results/:resultId', async (req, res) => {
  try {
    const { resultId } = req.params;
    const { result_value } = req.body;
    
    if (!result_value) {
      return res.status(400).json({ message: 'Result value is required' });
    }
    
    const query = `
      UPDATE patient_test_results 
      SET result_value = $1, reported_at = now()
      WHERE result_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [result_value, resultId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Test result not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating test result:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Complete all tests for a patient service (mark report as completed)
router.patch('/service/:patientServiceId/complete', async (req, res) => {
  try {
    const { patientServiceId } = req.params;
    
    const query = `
      UPDATE patient_services 
      SET report_status = 'Completed'
      WHERE patient_service_id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [patientServiceId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Patient service not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error completing patient service:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
