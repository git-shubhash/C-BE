import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.owzxruwotjviffxhhfup:oBs6qJPgTjGO46DM@aws-0-ap-south-1.pooler.supabase.com:6543/postgres';
const NODE_ENV = process.env.NODE_ENV || 'development';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export default pool;