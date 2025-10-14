import express from 'express';
import pool from '../database/connection';
import { v4 as uuidv4 } from 'uuid';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import twilio from 'twilio';
import { v2 as cloudinary } from 'cloudinary';
import dotenv from 'dotenv';
import puppeteer from 'puppeteer';

dotenv.config();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Twilio
if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
  throw new Error('Twilio credentials are not set. Please configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
}
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// SMS Configuration
const SMS_FROM_NUMBER = process.env.SMS_FROM_NUMBER;
if (!SMS_FROM_NUMBER) {
  throw new Error('SMS_FROM_NUMBER is not set.');
}

const router = express.Router();

// Get all bills
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT 
        b.*,
        a.patient_name,
        a.patient_phone
      FROM bills b
      JOIN appointments a ON b.appointment_id = a.appointment_id
      ORDER BY b.created_at DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bills:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get bill details by appointment_id
router.get('/:appointment_id', async (req, res) => {
  try {
    const { appointment_id } = req.params;
    
    const query = `
      SELECT 
        b.*,
        a.patient_name,
        a.patient_phone,
        a.doctor_name,
        a.date
      FROM bills b
      JOIN appointments a ON b.appointment_id = a.appointment_id
      WHERE b.appointment_id = $1
      ORDER BY b.created_at DESC
    `;
    
    const result = await pool.query(query, [appointment_id]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching bill details:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Create new bill (process payment)
router.post('/', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { appointment_id, medicines, payment_mode, transaction_id } = req.body;
    
    const billEntries = [];
    
    // Create bill entries for each medicine
    for (const medicine of medicines) {
      const billId = uuidv4();
      
      const insertBillQuery = `
        INSERT INTO bills (bill_id, appointment_id, medication_name, quantity, unit_price, payment_mode, transaction_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;
      
      const billResult = await client.query(insertBillQuery, [
        billId,
        appointment_id,
        medicine.name,
        medicine.quantity,
        medicine.price,
        payment_mode,
        transaction_id
      ]);
      
      billEntries.push(billResult.rows[0]);
      
      // Update medicine stock
      const updateStockQuery = `
        UPDATE medicines 
        SET quantity = quantity - $1
        WHERE name = $2 AND quantity >= $1
      `;
      
      const stockResult = await client.query(updateStockQuery, [medicine.quantity, medicine.name]);
      
      if (stockResult.rowCount === 0) {
        return res.status(400).json({ message: `Medicine ${medicine.name} is out of stock` });
      }
    }
    
    // Update prescription dispense status
    const updatePrescriptionQuery = `
      UPDATE prescriptions 
      SET dispense_status = true 
      WHERE appointment_id = $1
    `;
    
    await client.query(updatePrescriptionQuery, [appointment_id]);
    
    await client.query('COMMIT');
    res.status(201).json(billEntries);
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error creating bill:', error);
    const errorMessage = (error instanceof Error && error.message) ? error.message : 'Internal server error';
    res.status(500).json({ message: errorMessage });
  } finally {
    client.release();
  }
});

// Create Razorpay order
router.post('/razorpay/order', async (req, res) => {
  const { amount, currency = 'INR', receipt } = req.body;
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials are not set. Please configure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    }
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    const options = {
      amount: Math.round(Number(amount) * 100), // amount in paise
      currency,
      receipt: receipt || `rcpt_${Date.now()}`,
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error('Razorpay order error:', error);
    res.status(500).json({ message: 'Failed to create Razorpay order' });
  }
});

router.post('/razorpay/verify', async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_secret) {
    return res.status(500).json({ valid: false, message: 'Payment verification unavailable. Missing RAZORPAY_KEY_SECRET.' });
  }
  const hmac = crypto.createHmac('sha256', key_secret);
  hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
  const generated_signature = hmac.digest('hex');
  if (generated_signature === razorpay_signature) {
    // Mark bill as paid in DB (using appointment_id as receipt)
    try {
      // Fetch the order to get the receipt (which is appointment_id)
      const razorpay = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID as string,
        key_secret: key_secret,
      });
      const order = await razorpay.orders.fetch(razorpay_order_id);
      const appointment_id = order.receipt;
      // Update all bills for this appointment_id to paid
      await pool.query(
        `UPDATE bills SET payment_status = 'paid', transaction_id = $1 WHERE appointment_id = $2`,
        [razorpay_payment_id, appointment_id]
      );
      res.json({ valid: true });
    } catch (err) {
      console.error('Error updating bill as paid:', err);
      res.status(500).json({ valid: false, message: 'Payment verified but failed to update bill status.' });
    }
  } else {
    res.status(400).json({ valid: false, message: 'Invalid signature' });
  }
});

// Send SMS message with bill details
router.post('/sms/send', async (req, res) => {
  try {
    const { appointment_id, patient_phone } = req.body;
    
    if (!appointment_id || !patient_phone) {
      return res.status(400).json({ message: 'Appointment ID and patient phone are required' });
    }

    // Get bill details
    const billQuery = `
      SELECT 
        b.*,
        a.patient_name,
        a.patient_phone,
        a.doctor_name,
        a.date
      FROM bills b
      JOIN appointments a ON b.appointment_id = a.appointment_id
      WHERE b.appointment_id = $1
      ORDER BY b.created_at DESC
    `;
    
    const billResult = await pool.query(billQuery, [appointment_id]);
    
    if (billResult.rows.length === 0) {
      return res.status(404).json({ message: 'Bill not found' });
    }

    const bills = billResult.rows;
    const bill = bills[0]; // Use first bill for patient info
    
    // Generate PDF content (HTML) - EXACTLY same as frontend download
    const billDate = new Date(bill.created_at);
    const dateStr = billDate.toLocaleDateString();
    const timeStr = billDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const totalAmount = bills.reduce((sum, item) => sum + Number(item.total_price), 0);
    
    const pdfHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Bill - ${bill.patient_name}</title>
        <style>
          body { font-family: sans-serif; margin: 0; padding: 0; }
        </style>
      </head>
      <body>
        <div style="width:794px;min-height:1123px;background:#fff;padding:0;margin:0;font-family:sans-serif;position:relative;">
          <div style='padding:40px 40px 0 40px;'>
            <div style='display:flex;justify-content:space-between;align-items:center;'>
              <div>
                <div style='font-size:32px;font-weight:600;margin-bottom:8px;'>Invoice</div>
                <div style='font-size:15px;font-weight:500;color:#444;'>CURA Pharmacy, 123 Hospital Road, Bengaluru, India</div>
              </div>
              <img src='https://res.cloudinary.com/dlajv6pdq/image/upload/v1753644950/cura-logo_pmqfr6.jpg' style='height:64px;width:auto;' />
            </div>
            <div style='margin-top:32px;display:flex;justify-content:space-between;'>
              <div>
                <div style='font-weight:600;font-size:15px;margin-bottom:4px;'>BILL TO</div>
                <div style='font-size:14px;'>${bill.patient_name || '-'}</div>
                <div style='font-size:13px;color:#666;'>Appointment ID: ${bill.appointment_id || '-'}</div>
              </div>
              <div style='font-size:13px;color:#444;'>
                <div><b>Invoice No.:</b> ${bill.bill_id}</div>
                <div><b>Issue date:</b> ${dateStr} ${timeStr}</div>
                <div><b>Due date:</b> ${dateStr}</div>
                <div><b>Reference:</b> ${bill.appointment_id}</div>
              </div>
            </div>
            <div style='margin-top:24px;display:flex;gap:0;'>
              <div style='flex:1;background:#f3f3f3;padding:16px 12px;text-align:center;border:1px solid #e0e0e0;'>
                <div style='font-size:13px;color:#888;'>Invoice No.</div>
                <div style='font-size:18px;font-weight:600;'>${bill.bill_id}</div>
              </div>
              <div style='flex:1;background:#f3f3f3;padding:16px 12px;text-align:center;border:1px solid #e0e0e0;'>
                <div style='font-size:13px;color:#888;'>Issue date</div>
                <div style='font-size:18px;font-weight:600;'>${dateStr}</div>
              </div>
              <div style='flex:1;background:#f3f3f3;padding:16px 12px;text-align:center;border:1px solid #e0e0e0;'>
                <div style='font-size:13px;color:#888;'>Due date</div>
                <div style='font-size:18px;font-weight:600;'>${dateStr}</div>
              </div>
              <div style='flex:1.2;background:#222;color:#fff;padding:16px 12px;text-align:center;border:1px solid #e0e0e0;'>
                <div style='font-size:13px;'>Total due (INR)</div>
                <div style='font-size:20px;font-weight:700;'>₹${totalAmount.toFixed(2)}</div>
              </div>
            </div>
            <div style='margin-top:32px;'>
              <table style='width:100%;border-collapse:collapse;'>
                <thead>
                  <tr style='background:#fafafa;border-bottom:2px solid #e0e0e0;'>
                    <th style='text-align:left;padding:8px 4px;font-size:14px;'>Description</th>
                    <th style='text-align:left;padding:8px 4px;font-size:14px;'>Quantity</th>
                    <th style='text-align:left;padding:8px 4px;font-size:14px;'>Unit price (₹)</th>
                    <th style='text-align:left;padding:8px 4px;font-size:14px;'>Amount (₹)</th>
                  </tr>
                </thead>
                <tbody>
                  ${bills.map(item => `
                    <tr style='border-bottom:1px solid #eee;'>
                      <td style='padding:8px 4px;font-size:13px;'>${item.medication_name}</td>
                      <td style='padding:8px 4px;font-size:13px;'>${item.quantity}</td>
                      <td style='padding:8px 4px;font-size:13px;'>₹${Number(item.unit_price).toFixed(2)}</td>
                      <td style='padding:8px 4px;font-size:13px;'>₹${Number(item.total_price).toFixed(2)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            <div style='margin-top:16px;text-align:right;font-size:18px;font-weight:600;'>
              Total (INR): ₹${totalAmount.toFixed(2)}
            </div>
          </div>
          <div style='position:absolute;bottom:32px;left:40px;right:40px;font-size:13px;color:#888;border-top:1px solid #eee;padding-top:12px;display:flex;justify-content:space-between;'>
            <div>
              CURA Pharmacy<br/>
              123 Hospital Road<br/>
              Bengaluru, India
            </div>
            <div>info@curapharmacy.in</div>
          </div>
        </div>
      </body>
      </html>
    `;

    // Generate PDF using Puppeteer - EXACTLY same as frontend
    const browser = await puppeteer.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    
    // Set viewport to match frontend dimensions
    await page.setViewport({ width: 794, height: 1123 });
    await page.setContent(pdfHtml, { waitUntil: 'networkidle0' });
    
    // Generate PDF with exact same settings as frontend
    const pdfBuffer = await page.pdf({
      width: '794px',
      height: '1123px',
      printBackground: true,
      margin: {
        top: '0px',
        right: '0px',
        bottom: '0px',
        left: '0px'
      },
      preferCSSPageSize: true,
      format: undefined // Use custom dimensions
    });
    
    await browser.close();

    // Check if file already exists for this appointment
    let pdfUrl = '';
    const existingPublicId = `bills/${appointment_id}`;
    
    // First, check if PDF already exists
    try {
      const existingResult = await cloudinary.api.resource(existingPublicId, {
        resource_type: 'raw'
      });
      
      pdfUrl = existingResult.secure_url;
      console.log('Using existing PDF');
      
    } catch (notFoundError) {
      // PDF doesn't exist, check for text file
      try {
        const textPublicId = `${existingPublicId}_text`;
        const existingTextResult = await cloudinary.api.resource(textPublicId, {
          resource_type: 'raw'
        });
        
        pdfUrl = existingTextResult.secure_url;
        console.log('Using existing text file');
        
      } catch (textNotFoundError) {
        // Neither PDF nor text exists, upload new PDF
        console.log('Uploading new PDF...');
        
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
          console.log('PDF uploaded successfully');
          
        } catch (uploadError) {
          console.error('PDF upload failed:', uploadError);
          
          // Fallback: Create text file
          const billText = `
CURA Pharmacy Bill

Patient: ${bill.patient_name}
Appointment ID: ${bill.appointment_id}
Date: ${dateStr}
Time: ${timeStr}

Medicines:
${bills.map(item => `- ${item.medication_name}: ${item.quantity} x ₹${Number(item.unit_price).toFixed(2)} = ₹${Number(item.total_price).toFixed(2)}`).join('\n')}

Total Amount: ₹${totalAmount.toFixed(2)}

Thank you for choosing CURA Pharmacy!
          `;
          
          try {
            const textPublicId = `${existingPublicId}_text`;
            const textResult = await cloudinary.uploader.upload(
              `data:text/plain;base64,${Buffer.from(billText).toString('base64')}`,
              {
                resource_type: 'raw',
                format: 'txt',
                public_id: textPublicId,
                overwrite: true,
                access_mode: 'public'
              }
            );
            
            pdfUrl = textResult.secure_url;
            console.log('Text file uploaded as fallback');
            
          } catch (textError) {
            console.error('Text upload also failed:', textError);
            return res.status(500).json({ message: 'Failed to upload bill to Cloudinary' });
          }
        }
      }
    }

    if (!pdfUrl) {
      return res.status(500).json({ message: 'Failed to upload PDF to Cloudinary' });
    }

    // Send SMS message with bill details
    const message = `Dear ${bill.patient_name},\n\nYour bill from CURA Pharmacy is ready.\n\nTotal Amount: ₹${totalAmount.toFixed(2)}\nDate: ${dateStr}\n\nPlease find your detailed bill attached.\n\nThank you for choosing CURA Pharmacy!`;
     
     // Send SMS message with bill details
     try {
       console.log('Sending SMS message...');
       console.log('Patient phone:', patient_phone);
       console.log('SMS From Number:', SMS_FROM_NUMBER);
       
       // Format phone number to ensure it has + prefix
       let formattedPhone = patient_phone;
       if (!formattedPhone.startsWith('+')) {
         formattedPhone = '+' + formattedPhone;
       }
       console.log('Formatted phone:', formattedPhone);
       
       // Create single segment message with CURA name and short content
       const smsMessage = `CURA bill: ₹${totalAmount.toFixed(2)}. ${pdfUrl}`;
       
       const twilioResult = await twilioClient.messages.create({
         body: smsMessage,
         from: SMS_FROM_NUMBER,
         to: formattedPhone
       });
       
       console.log('SMS sent successfully!');
       
       res.json({ 
         success: true, 
         message: 'SMS message sent successfully with bill details',
         pdfUrl: pdfUrl,
         messageSid: twilioResult.sid
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
         success: false, 
         message: 'Failed to send SMS message',
         error: smsError.message,
         errorCode: smsError.code
       });
     }

   } catch (error) {
     console.error('SMS send error:', error);
     res.status(500).json({ message: 'Internal server error' });
   }
 });
 
 export default router;