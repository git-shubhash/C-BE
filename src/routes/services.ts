import express from 'express';
import pool from '../database/connection';

const router = express.Router();

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ message: 'Services API is working!' });
});

// Get all services with department names and test counts
router.get('/all', async (req, res) => {
  try {
    console.log('Fetching all services...');
    const query = `
      SELECT 
        st.service_type_id,
        st.sub_department_id,
        st.service_type_name,
        sd.sub_department_name,
        (
          SELECT COUNT(*)::INTEGER
          FROM tests t2 
          WHERE t2.service_type_id = st.service_type_id
        ) as test_count
      FROM service_types st
      LEFT JOIN sub_departments sd ON st.sub_department_id = sd.sub_department_id
      ORDER BY sd.sub_department_name, st.service_type_name
    `;
    
    console.log('Executing query:', query);
    const result = await pool.query(query);
    console.log('Query result rows:', result.rows.length);
    
    // Log the first few results for debugging
    if (result.rows.length > 0) {
      console.log('First service result:', result.rows[0]);
    }
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching all services:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get all sub departments
router.get('/departments', async (req, res) => {
  try {
    console.log('Fetching departments...');
    const query = `
      SELECT * FROM sub_departments 
      ORDER BY sub_department_name ASC
    `;
    
    console.log('Executing query:', query);
    const result = await pool.query(query);
    console.log('Query result rows:', result.rows.length);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get service types by department
router.get('/service-types/:departmentId', async (req, res) => {
  try {
    const { departmentId } = req.params;
    
    const query = `
      SELECT * FROM service_types 
      WHERE sub_department_id = $1
      ORDER BY service_type_name ASC
    `;
    
    const result = await pool.query(query, [departmentId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching service types:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get tests by service type
router.get('/tests/:serviceTypeId', async (req, res) => {
  try {
    const { serviceTypeId } = req.params;
    
    const query = `
      SELECT * FROM tests 
      WHERE service_type_id = $1
      ORDER BY test_name ASC
    `;
    
    const result = await pool.query(query, [serviceTypeId]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching tests:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get complete service structure (departments with service types and tests)
router.get('/structure', async (req, res) => {
  try {
    console.log('Fetching service structure...');
    
    const query = `
      SELECT 
        sd.sub_department_id,
        sd.sub_department_name,
        st.service_type_id,
        st.service_type_name,
        t.test_id,
        t.test_name,
        t.unit,
        t.normal_min,
        t.normal_max,
        t.normal_text
      FROM sub_departments sd
      LEFT JOIN service_types st ON sd.sub_department_id = st.sub_department_id
      LEFT JOIN tests t ON st.service_type_id = t.service_type_id
      ORDER BY sd.sub_department_name, st.service_type_name, t.test_name
    `;
    
    console.log('Executing query:', query);
    const result = await pool.query(query);
    console.log('Query result rows:', result.rows.length);
    
         // Group the results into a hierarchical structure
     const structure: Record<number, {
       sub_department_id: number;
       sub_department_name: string;
       service_types: Record<number, {
         service_type_id: number;
         service_type_name: string;
         tests: Array<{
           test_id: number;
           test_name: string;
           unit: string;
           normal_min: number;
           normal_max: number;
           normal_text: string;
         }>;
       }>;
     }> = {};
    
    result.rows.forEach(row => {
      const deptId = row.sub_department_id;
      const serviceTypeId = row.service_type_id;
      
      if (!structure[deptId]) {
        structure[deptId] = {
          sub_department_id: deptId,
          sub_department_name: row.sub_department_name,
          service_types: {}
        };
      }
      
      if (serviceTypeId && !structure[deptId].service_types[serviceTypeId]) {
        structure[deptId].service_types[serviceTypeId] = {
          service_type_id: serviceTypeId,
          service_type_name: row.service_type_name,
          tests: []
        };
      }
      
             if (row.test_id) {
         structure[deptId].service_types[serviceTypeId].tests.push({
           test_id: row.test_id,
           test_name: row.test_name,
           unit: row.unit,
           normal_min: row.normal_min,
           normal_max: row.normal_max,
           normal_text: row.normal_text
         });
       }
    });
    
    // Convert to array format
    const departments = Object.values(structure).map(dept => ({
      ...dept,
      service_types: Object.values(dept.service_types)
    }));
    
    res.json(departments);
  } catch (error) {
    console.error('Error fetching service structure:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add new sub department
router.post('/departments', async (req, res) => {
  try {
    const { sub_department_name } = req.body;
    
    if (!sub_department_name) {
      return res.status(400).json({ message: 'Department name is required' });
    }
    
    const query = `
      INSERT INTO sub_departments (sub_department_name)
      VALUES ($1)
      RETURNING *
    `;
    
    const result = await pool.query(query, [sub_department_name]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding department:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add new service type
router.post('/service-types', async (req, res) => {
  try {
    const { sub_department_id, service_type_name } = req.body;
    
    if (!sub_department_id || !service_type_name) {
      return res.status(400).json({ message: 'Department ID and service type name are required' });
    }
    
    const query = `
      INSERT INTO service_types (sub_department_id, service_type_name)
      VALUES ($1, $2)
      RETURNING *
    `;
    
    const result = await pool.query(query, [sub_department_id, service_type_name]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding service type:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Add new test
router.post('/tests', async (req, res) => {
  try {
    const { service_type_id, test_name, unit, normal_min, normal_max } = req.body;
    
    if (!service_type_id || !test_name || !unit || normal_min === undefined || normal_max === undefined) {
      return res.status(400).json({ message: 'All fields are required: service_type_id, test_name, unit, normal_min, normal_max' });
    }
    
    const query = `
      INSERT INTO tests (service_type_id, test_name, unit, normal_min, normal_max)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await pool.query(query, [service_type_id, test_name, unit, normal_min, normal_max]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Error adding test:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update department
router.put('/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { sub_department_name } = req.body;
    
    if (!sub_department_name) {
      return res.status(400).json({ message: 'Department name is required' });
    }
    
    const query = `
      UPDATE sub_departments 
      SET sub_department_name = $1
      WHERE sub_department_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [sub_department_name, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating department:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update service type
router.put('/service-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { service_type_name } = req.body;
    
    if (!service_type_name) {
      return res.status(400).json({ message: 'Service type name is required' });
    }
    
    const query = `
      UPDATE service_types 
      SET service_type_name = $1
      WHERE service_type_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [service_type_name, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Service type not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating service type:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Update test
router.put('/tests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { test_name, unit, normal_min, normal_max } = req.body;
    
    if (!test_name || !unit || normal_min === undefined || normal_max === undefined) {
      return res.status(400).json({ message: 'All fields are required: test_name, unit, normal_min, normal_max' });
    }
    
    const query = `
      UPDATE tests 
      SET test_name = $1, unit = $2, normal_min = $3, normal_max = $4
      WHERE test_id = $5
      RETURNING *
    `;
    
    const result = await pool.query(query, [test_name, unit, normal_min, normal_max, id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Test not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error updating test:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete department (cascades to service types and tests)
router.delete('/departments/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `DELETE FROM sub_departments WHERE sub_department_id = $1 RETURNING *`;
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Department not found' });
    }
    
    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete service type (cascades to tests)
router.delete('/service-types/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `DELETE FROM service_types WHERE service_type_id = $1 RETURNING *`;
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Service type not found' });
    }
    
    res.json({ message: 'Service type deleted successfully' });
  } catch (error) {
    console.error('Error deleting service type:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Delete test
router.delete('/tests/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `DELETE FROM tests WHERE test_id = $1 RETURNING *`;
    const result = await pool.query(query, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Test not found' });
    }
    
    res.json({ message: 'Test deleted successfully' });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

export default router;
