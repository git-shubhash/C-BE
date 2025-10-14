import express from 'express';
import pool from '../database/connection';
import { PrescriptionWithDetails } from '../types';
import twilio from 'twilio';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dlajv6pdq',
  api_key: process.env.CLOUDINARY_API_KEY || '199568626316155',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'tQkOP_aGt53cqtNO2qYdcqXznrk',
});

// Configure Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID || 'ACde1b422cf428d2a29d949a935950ed81',
  process.env.TWILIO_AUTH_TOKEN || '6534f2f7a654a79929261ebb21d1b5a7'
);

// SMS Configuration
const SMS_FROM_NUMBER = process.env.SMS_FROM_NUMBER || '+18149850747';

const router = express.Router();

// Get prescription by appointment_id
router.get('/:appointment_id', async (req, res) => {
  try {
    const { appointment_id } = req.params;
    
    const query = `
      SELECT 
        p.*,
        a.patient_name,
        a.doctor_name,
        a.date
      FROM prescriptions p
      JOIN appointments a ON p.appointment_id = a.appointment_id
      WHERE p.appointment_id = $1
      ORDER BY p.created_at DESC
    `;
    
    const result = await pool.query(query, [appointment_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'No patient found' });
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching prescription:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all prescriptions
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.*,
        a.patient_name,
        a.doctor_name,
        a.date
      FROM prescriptions p
      JOIN appointments a ON p.appointment_id = a.appointment_id
      ORDER BY p.created_at DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching prescriptions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update dispense status
router.patch('/:appointment_id/dispense', async (req, res) => {
  try {
    const { appointment_id } = req.params;
    
    const query = `
      UPDATE prescriptions 
      SET dispense_status = true 
      WHERE appointment_id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [appointment_id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Prescription not found' });
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error updating dispense status:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete prescription
router.delete('/:appointment_id', async (req, res) => {
  try {
    const { appointment_id } = req.params;
    
    // Check if prescription is already dispensed
    const checkQuery = `
      SELECT dispense_status FROM prescriptions 
      WHERE appointment_id = $1
    `;
    
    const checkResult = await pool.query(checkQuery, [appointment_id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Prescription not found' });
    }
    
    if (checkResult.rows.some(row => row.dispense_status)) {
      return res.status(400).json({ message: 'Cannot delete dispensed prescription' });
    }
    
    const deleteQuery = `
      DELETE FROM prescriptions 
      WHERE appointment_id = $1
      RETURNING *
    `;
    
    const result = await pool.query(deleteQuery, [appointment_id]);
    res.json({ message: 'Prescription deleted successfully' });
  } catch (error) {
    console.error('Error deleting prescription:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Send prescription via SMS
router.post('/sms/send', async (req, res) => {
  try {
    const { appointment_id, patient_phone } = req.body;

    if (!appointment_id || !patient_phone) {
      return res.status(400).json({ message: 'Appointment ID and patient phone are required' });
    }

    // Get prescription details
    const prescriptionQuery = `
      SELECT 
        p.*,
        a.patient_name,
        a.doctor_name,
        a.date,
        a.patient_phone
      FROM prescriptions p
      JOIN appointments a ON p.appointment_id = a.appointment_id
      WHERE p.appointment_id = $1
      ORDER BY p.created_at DESC
    `;

    const prescriptionResult = await pool.query(prescriptionQuery, [appointment_id]);
    
    if (prescriptionResult.rows.length === 0) {
      return res.status(404).json({ message: 'Prescription not found' });
    }

    const prescriptions = prescriptionResult.rows;
    const patientName = prescriptions[0].patient_name;
    const doctorName = prescriptions[0].doctor_name;
    const appointmentDate = prescriptions[0].date;
    const patientPhone = prescriptions[0].patient_phone || patient_phone;

    // Generate PDF using Puppeteer
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Create HTML content for prescription
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Prescription</title>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            margin: 0; 
            padding: 0; 
            min-height: 100vh;
            display: flex;
            flex-direction: column;
          }
          .header { width: 100%; text-align: center; margin-bottom: 15px; }
          .header img { width: 100%; max-width: 800px; height: auto; }
          .content { 
            padding: 20px; 
            padding-top: 10px;
            flex: 1;
            display: flex;
            flex-direction: column;
          }
          .patient-info { margin-bottom: 20px; }
          .patient-info h2 { text-align: center; margin-bottom: 20px; }
          .medications { margin-top: 20px; flex: 1; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .footer { 
            width: 100%; 
            text-align: center; 
            margin-top: auto;
            padding-top: 30px;
          }
          .footer img { width: 100%; max-width: 800px; height: auto; }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="https://res.cloudinary.com/dlajv6pdq/image/upload/v1753705373/cura-full-header_pwblci.png" alt="CURA Hospitals Header">
        </div>
        
        <div class="content">
          <div class="patient-info">
            <h2 style="text-align:center;margin-bottom:12px;font-size:18px;color:#000000;text-transform:uppercase;font-weight:bold;">PRESCRIPTION</h2>
            
            <!-- Patient Information Title -->
            <h3 style="margin-bottom:6px;font-size:14px;color:#333;font-weight:bold;">Patient Information</h3>
            
            <!-- Compact Patient Details Table -->
            <table style="width:100%;border-collapse:collapse;margin-bottom:8px;border:1px solid #ddd;">
              <tbody>
                <tr>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;background-color:#f2f2f2;font-weight:bold;width:120px;font-size:14px;">Patient Name:</td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;font-size:14px;">${patientName}</td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;background-color:#f2f2f2;font-weight:bold;width:120px;font-size:14px;">Patient Phone:</td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;font-size:14px;">${patientPhone}</td>
                </tr>
                <tr>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;background-color:#f2f2f2;font-weight:bold;width:120px;font-size:14px;">Doctor:</td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;font-size:14px;">${doctorName}</td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;background-color:#f2f2f2;font-weight:bold;width:120px;font-size:14px;">Date:</td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;font-size:14px;">${new Date(appointmentDate).toLocaleDateString()}</td>
                </tr>
                <tr>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;background-color:#f2f2f2;font-weight:bold;width:120px;font-size:14px;">Appointment ID:</td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;font-size:14px;font-family:monospace;">${appointment_id}</td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;background-color:#f2f2f2;font-weight:bold;width:120px;font-size:14px;"></td>
                  <td style="border:1px solid #ddd;padding:6px;text-align:left;font-size:14px;"></td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div class="medications">
            <h3>Medications:</h3>
            <table>
              <thead>
                <tr>
                  <th>Medication</th>
                  <th>Dosage</th>
                  <th>Frequency</th>
                  <th>Duration</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${prescriptions.map(p => `
                  <tr>
                    <td>${p.medication_name}</td>
                    <td>${p.dosage || '-'}</td>
                    <td>${p.frequency || '-'}</td>
                    <td>${p.duration || '-'}</td>
                    <td>${p.notes || '-'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        
        <div class="footer">
          <img src="https://res.cloudinary.com/dlajv6pdq/image/upload/v1753705371/cura-footer_ylfxqb.png" alt="CURA Hospitals Footer">
        </div>
      </body>
      </html>
    `;

    await page.setContent(htmlContent);
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    // Check if file already exists for this appointment
    let pdfUrl = '';
    const existingPublicId = `prescriptions/${appointment_id}`;
    
    // First, check if PDF already exists
    try {
      const existingResult = await cloudinary.api.resource(existingPublicId, { resource_type: 'raw' });
      pdfUrl = existingResult.secure_url; // Use existing PDF
    } catch (notFoundError) {
      // PDF doesn't exist, check for text file
      try {
        const textPublicId = `${existingPublicId}_text`;
        const existingTextResult = await cloudinary.api.resource(textPublicId, { resource_type: 'raw' });
        pdfUrl = existingTextResult.secure_url; // Use existing text file
      } catch (textNotFoundError) {
        // Neither PDF nor text exists, upload new PDF
        console.log('Uploading new prescription PDF...');
        try {
          const base64PDF = Buffer.from(pdfBuffer).toString('base64');
          const result = await cloudinary.uploader.upload(
            `data:application/pdf;base64,${base64PDF}`,
            {
              resource_type: 'raw',
              format: 'pdf',
              public_id: existingPublicId,
              overwrite: true,
              access_mode: 'public'
            }
          );
          pdfUrl = result.secure_url;
          console.log('Prescription PDF uploaded successfully');
        } catch (uploadError: any) {
          console.error('PDF upload failed:', uploadError);
          // Fallback: Create text file
          const prescriptionText = `CURA Hospitals Prescription\n\nPatient: ${patientName}\nDoctor: ${doctorName}\nDate: ${appointmentDate}\n\nMedications:\n${prescriptions.map(p => `- ${p.medication_name}: ${p.dosage || ''} ${p.frequency || ''} for ${p.duration || ''}`).join('\n')}`;
          try {
            const textPublicId = `${existingPublicId}_text`;
            const textResult = await cloudinary.uploader.upload(
              `data:text/plain;base64,${Buffer.from(prescriptionText).toString('base64')}`,
              {
                resource_type: 'raw',
                format: 'txt',
                public_id: textPublicId,
                overwrite: true,
                access_mode: 'public'
              }
            );
            pdfUrl = textResult.secure_url;
            console.log('Prescription text file uploaded as fallback');
          } catch (textError: any) {
            console.error('Text upload also failed:', textError);
            return res.status(500).json({ message: 'Failed to upload prescription to Cloudinary' });
          }
        }
      }
    }

    // Send SMS
    console.log('Sending prescription SMS...');
    console.log('Patient phone:', patientPhone);
    console.log('SMS From Number:', SMS_FROM_NUMBER);
    
    let formattedPhone = patientPhone;
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+' + formattedPhone;
    }
    console.log('Formatted phone:', formattedPhone);

    const smsMessage = `CURA prescription: ${patientName}. ${pdfUrl}`;

    try {
      const message = await twilioClient.messages.create({
        body: smsMessage,
        from: SMS_FROM_NUMBER,
        to: formattedPhone
      });

      console.log('SMS sent successfully!');
      console.log('Message SID:', message.sid);

      res.json({ 
        message: 'Prescription sent via SMS successfully',
        messageSid: message.sid,
        pdfUrl: pdfUrl
      });

    } catch (smsError: any) {
      console.error('SMS failed:', smsError.message);
      console.error('Error details:', {
        message: smsError.message,
        code: smsError.code,
        moreInfo: smsError.moreInfo,
        status: smsError.status
      });
      
      res.status(500).json({ 
        message: 'Failed to send SMS',
        error: smsError.message,
        pdfUrl: pdfUrl
      });
    }

  } catch (error: any) {
    console.error('Error sending prescription SMS:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;