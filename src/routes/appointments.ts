import express from 'express';
import pool from '../database/connection';

const router = express.Router();

// Get appointment by appointment_id
router.get('/:appointment_id', async (req, res) => {
  try {
    const { appointment_id } = req.params;
    
    const query = `
      SELECT 
        appointment_id,
        patient_name,
        doctor_name,
        date,
        patient_phone
      FROM appointments 
      WHERE appointment_id = $1
    `;
    
    const result = await pool.query(query, [appointment_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching appointment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get patient phone number by appointment_id
router.get('/:appointment_id/phone', async (req, res) => {
  try {
    const { appointment_id } = req.params;
    
    const query = `
      SELECT patient_phone
      FROM appointments 
      WHERE appointment_id = $1
    `;
    
    const result = await pool.query(query, [appointment_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Appointment not found' });
    }
    
    res.json({ patient_phone: result.rows[0].patient_phone });
  } catch (error) {
    console.error('Error fetching patient phone:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get patient information by appointment ID
router.get('/:appointmentId/patient-info', async (req, res) => {
  try {
    const { appointmentId } = req.params;
    
    const query = `
      SELECT 
        u.mrno,
        u.name,
        u.phone,
        u.email,
        a.patient_name,
        a.doctor_name,
        a.date as appointment_date
      FROM appointments a
      LEFT JOIN users u ON a.mrno = u.mrno
      WHERE a.appointment_id = $1
    `;
    
    const result = await pool.query(query, [appointmentId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Patient not found' });
    }
    
    const data = result.rows[0];
    
    res.json({
      mrno: data.mrno || '',
      name: data.name || data.patient_name,
      phone: data.phone || '',
      email: data.email || '',
      age: '', // Add birth_date field to calculate age if needed
      gender: '' // Add gender field to users table if needed
    });
  } catch (error) {
    console.error('Error fetching patient info:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router; 