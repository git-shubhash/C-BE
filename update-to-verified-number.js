const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.owzxruwotjviffxhhfup:oBs6qJPgTjGO46DM@aws-0-ap-south-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

console.log('🔄 Updating Database to Use Verified Number');
console.log('==========================================');

async function updateToVerifiedNumber() {
  try {
    // Update all appointments to use a verified number for testing
    const verifiedNumber = '+919164899479'; // Replace with your verified number
    
    const result = await pool.query(
      `UPDATE appointments SET patient_phone = $1 WHERE patient_phone = '+917204764943'`,
      [verifiedNumber]
    );
    
    console.log('✅ Updated', result.rowCount, 'appointments to use verified number');
    console.log('New phone number:', verifiedNumber);
    
    // Show updated appointments
    const appointments = await pool.query(
      `SELECT appointment_id, patient_name, patient_phone FROM appointments WHERE patient_phone = $1`,
      [verifiedNumber]
    );
    
    console.log('');
    console.log('📋 Updated Appointments:');
    appointments.rows.forEach(app => {
      console.log(`   - ${app.appointment_id}: ${app.patient_name} (${app.patient_phone})`);
    });
    
  } catch (error) {
    console.error('❌ Error updating database:', error.message);
  } finally {
    await pool.end();
  }
}

updateToVerifiedNumber(); 