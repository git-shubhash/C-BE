import express from 'express';
import pool from '../database/connection';

const router = express.Router();

// Get summary statistics
router.get('/summary', async (req, res) => {
  try {
    const queries = await Promise.all([
      // Total revenue
      pool.query(`
        SELECT COALESCE(SUM(total_price), 0) as total_revenue 
        FROM bills 
        WHERE payment_status = 'completed'
      `),
      
      // Total bills count
      pool.query(`
        SELECT COUNT(DISTINCT appointment_id) as total_bills 
        FROM bills 
        WHERE payment_status = 'completed'
      `),
      
      // Total medicines in stock
      pool.query(`
        SELECT COUNT(*) as total_medicines,
               SUM(quantity) as total_stock
        FROM medicines
      `),
      
      // Payment mode breakdown
      pool.query(`
        SELECT 
          payment_mode,
          COUNT(*) as count,
          SUM(total_price) as revenue
        FROM bills 
        WHERE payment_status = 'completed'
        GROUP BY payment_mode
      `),
      
      // Low stock medicines count
      pool.query(`
        SELECT COUNT(*) as low_stock_count
        FROM medicines 
        WHERE stock_status = 'low_stock'
      `)
    ]);

    const summary = {
      totalRevenue: parseFloat(queries[0].rows[0].total_revenue),
      totalBills: parseInt(queries[1].rows[0].total_bills),
      totalMedicines: parseInt(queries[2].rows[0].total_medicines),
      totalStock: parseInt(queries[2].rows[0].total_stock),
      paymentBreakdown: queries[3].rows,
      lowStockCount: parseInt(queries[4].rows[0].low_stock_count)
    };

    res.json(summary);
  } catch (error) {
    console.error('Error fetching analytics summary:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get sales trends
router.get('/sales-trend', async (req, res) => {
  try {
    const query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(DISTINCT appointment_id) as sales_count,
        SUM(total_price) as revenue
      FROM bills 
      WHERE payment_status = 'completed'
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching sales trend:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get monthly trends
router.get('/monthly-trends', async (req, res) => {
  try {
    const query = `
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(DISTINCT appointment_id) as sales_count,
        SUM(total_price) as revenue,
        COUNT(*) as total_items_sold
      FROM bills 
      WHERE payment_status = 'completed'
        AND created_at >= CURRENT_DATE - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching monthly trends:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get inventory analytics
router.get('/inventory-analytics', async (req, res) => {
  try {
    const queries = await Promise.all([
      // Stock levels
      pool.query(`
        SELECT 
          stock_status,
          COUNT(*) as count,
          SUM(quantity) as total_quantity,
          AVG(price) as avg_price
        FROM medicines
        GROUP BY stock_status
      `),
      
      // Low stock medicines
      pool.query(`
        SELECT 
          name,
          quantity,
          price,
          stock_status
        FROM medicines
        WHERE stock_status = 'low_stock'
        ORDER BY quantity ASC
        LIMIT 10
      `)
    ]);

    const analytics = {
      stockLevels: queries[0].rows,
      lowStockMedicines: queries[1].rows
    };

    res.json(analytics);
  } catch (error) {
    console.error('Error fetching inventory analytics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get top medicines
router.get('/top-medicines', async (req, res) => {
  try {
    const query = `
      SELECT 
        medication_name,
        SUM(quantity) as total_quantity,
        SUM(total_price) as total_revenue,
        COUNT(*) as sales_count
      FROM bills 
      WHERE payment_status = 'completed'
      GROUP BY medication_name
      ORDER BY total_revenue DESC
      LIMIT 10
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching top medicines:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export revenue report
router.get('/export/revenue', async (req, res) => {
  try {
    const query = `
      SELECT 
        b.created_at as date,
        b.appointment_id,
        a.patient_name,
        b.medication_name,
        b.quantity,
        b.unit_price,
        b.total_price,
        b.payment_mode,
        b.transaction_id
      FROM bills b
      JOIN appointments a ON b.appointment_id = a.appointment_id
      WHERE b.payment_status = 'completed'
      ORDER BY b.created_at DESC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error exporting revenue data:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export sales summary
router.get('/export/sales-summary', async (req, res) => {
  try {
    const queries = await Promise.all([
      // Summary stats
      pool.query(`
        SELECT 
          COUNT(DISTINCT appointment_id) as total_transactions,
          SUM(total_price) as total_revenue,
          AVG(total_price) as avg_transaction_value
        FROM bills 
        WHERE payment_status = 'completed'
      `),
      
      // Top medicines
      pool.query(`
        SELECT 
          medication_name,
          SUM(quantity) as total_sold,
          SUM(total_price) as revenue
        FROM bills 
        WHERE payment_status = 'completed'
        GROUP BY medication_name
        ORDER BY revenue DESC
        LIMIT 5
      `)
    ]);

    const summary = {
      overview: queries[0].rows[0],
      topMedicines: queries[1].rows
    };

    res.json(summary);
  } catch (error) {
    console.error('Error exporting sales summary:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export complete analytics
router.get('/export/complete', async (req, res) => {
  try {
    const queries = await Promise.all([
      // Revenue data
      pool.query(`
        SELECT 
          b.created_at as date,
          b.appointment_id,
          a.patient_name,
          b.medication_name,
          b.quantity,
          b.unit_price,
          b.total_price,
          b.payment_mode,
          b.transaction_id
        FROM bills b
        JOIN appointments a ON b.appointment_id = a.appointment_id
        WHERE b.payment_status = 'completed'
        ORDER BY b.created_at DESC
      `),
      
      // Summary stats
      pool.query(`
        SELECT 
          COUNT(DISTINCT appointment_id) as total_transactions,
          SUM(total_price) as total_revenue,
          AVG(total_price) as avg_transaction_value,
          COUNT(*) as total_items_sold
        FROM bills 
        WHERE payment_status = 'completed'
      `),
      
      // Top medicines
      pool.query(`
        SELECT 
          medication_name,
          SUM(quantity) as total_sold,
          SUM(total_price) as revenue,
          COUNT(*) as sales_count
        FROM bills 
        WHERE payment_status = 'completed'
        GROUP BY medication_name
        ORDER BY revenue DESC
        LIMIT 10
      `),
      
      // Payment breakdown
      pool.query(`
        SELECT 
          payment_mode,
          COUNT(*) as count,
          SUM(total_price) as revenue
        FROM bills 
        WHERE payment_status = 'completed'
        GROUP BY payment_mode
      `)
    ]);

    const completeReport = {
      revenueData: queries[0].rows,
      summary: queries[1].rows[0],
      topMedicines: queries[2].rows,
      paymentBreakdown: queries[3].rows
    };

    res.json(completeReport);
  } catch (error) {
    console.error('Error exporting complete analytics:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;