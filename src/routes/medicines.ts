import express from 'express';
import pool from '../database/connection';
import { Medicine } from '../types';

const router = express.Router();

// Get all medicines
router.get('/', async (req, res) => {
  try {
    const query = `
      SELECT * FROM medicines 
      ORDER BY name ASC
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching medicines:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add new medicine
router.post('/', async (req, res) => {
  try {
    const { name, price, quantity, expiry_date } = req.body;
    
    const query = `
      INSERT INTO medicines (name, price, quantity, expiry_date)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await pool.query(query, [name, price, quantity, expiry_date || null]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding medicine:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Refill stock
router.patch('/refill/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { quantity } = req.body;
    
    const query = `
      UPDATE medicines 
      SET quantity = quantity + $1
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [quantity, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Medicine not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error refilling stock:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Edit medicine
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, price, expiry_date } = req.body;
    
    // Validate required fields
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Name is required and must be a string' });
    }
    
    if (typeof price !== 'number' || price < 0) {
      return res.status(400).json({ message: 'Price must be a valid number >= 0' });
    }
    
    // First check if medicine exists
    const checkQuery = `SELECT id FROM medicines WHERE id = $1`;
    const checkResult = await pool.query(checkQuery, [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Medicine not found' });
    }
    
    const query = `
      UPDATE medicines 
      SET name = $1, price = $2, expiry_date = $3
      WHERE id = $4
      RETURNING *
    `;
    
    const result = await pool.query(query, [name, price, expiry_date || null, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Medicine not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating medicine:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ message: 'Internal server error', error: errorMessage });
  }
});

// Delete medicine
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleteQuery = `DELETE FROM medicines WHERE id = $1 RETURNING *`;
    const result = await pool.query(deleteQuery, [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Medicine not found' });
    }
    res.json({ message: 'Medicine deleted successfully' });
  } catch (error) {
    console.error('Error deleting medicine:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Export inventory
router.get('/export', async (req, res) => {
  try {
    const { filter } = req.query;
    
    let query = `SELECT name, quantity, price, stock_status FROM medicines`;
    
    if (filter === 'lowstock') {
      query += ` WHERE stock_status = 'low_stock'`;
    }
    
    query += ` ORDER BY name ASC`;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error exporting inventory:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;