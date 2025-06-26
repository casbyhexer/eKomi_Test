const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_key';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));
app.use(cors({
  origin: ['http://localhost:8080', 'https://localhost:8080', 'http://127.0.0.1:8080'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Auth rate limiting
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.'
});

// JWT verification middleware
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Database initialization check
const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
    // Check if tables exist, create if they don't
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        full_name VARCHAR(255),
        department VARCHAR(255),
        phone_number VARCHAR(50),
        job_title VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Inserted sample data if tables are empty
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    if (parseInt(userCount.rows[0].count) === 0) {
      const hashedPassword = await bcrypt.hash('password123', 12);
      await client.query(
        'INSERT INTO users (email, password_hash) VALUES ($1, $2)',
        ['admin@company.com', hashedPassword]
      );
    }

    const contactCount = await client.query('SELECT COUNT(*) FROM contacts');
    if (parseInt(contactCount.rows[0].count) === 0) {
      const sampleContacts = [
        ['john.doe@company.com', 'John Doe', 'Engineering', '+1-555-0123', 'Senior Software Engineer'],
        ['jane.smith@company.com', 'Jane Smith', 'Marketing', '+1-555-0124', 'Marketing Manager'],
        ['bob.johnson@company.com', 'Bob Johnson', 'Sales', '+1-555-0125', 'Sales Director'],
        ['alice.brown@company.com', 'Alice Brown', 'HR', '+1-555-0126', 'HR Specialist'],
        ['charlie.wilson@company.com', 'Charlie Wilson', 'Finance', '+1-555-0127', 'Financial Analyst']
      ];

      for (const contact of sampleContacts) {
        await client.query(
          'INSERT INTO contacts (email, full_name, department, phone_number, job_title) VALUES ($1, $2, $3, $4, $5)',
          contact
        );
      }
    }

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Database initialization error:', err);
  } finally {
    client.release();
  }
};

// Routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Authentication endpoint
app.post('/api/auth/login', 
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid input', details: errors.array() });
      }

      const { email, password } = req.body;
      
      const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const user = result.rows[0];
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { userId: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          email: user.email
        }
      });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// Token validation endpoint
app.get('/api/auth/validate', verifyToken, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// Contact enrichment endpoint
app.get('/api/contacts/:email', verifyToken, async (req, res) => {
  try {
    const { email } = req.params;
    
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ error: 'Valid email address required' });
    }

    const result = await pool.query(
      'SELECT email, full_name, department, phone_number, job_title FROM contacts WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        error: 'Contact not found',
        email: email,
        suggestion: 'Contact may not be in our directory'
      });
    }

    const contact = result.rows[0];
    res.json({
      email: contact.email,
      fullName: contact.full_name,
      department: contact.department,
      phoneNumber: contact.phone_number,
      jobTitle: contact.job_title,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Contact lookup error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Gets all contacts (for testing/admin purposes)
app.get('/api/contacts', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT email, full_name, department, phone_number, job_title FROM contacts ORDER BY full_name'
    );
    
    res.json({
      contacts: result.rows.map(contact => ({
        email: contact.email,
        fullName: contact.full_name,
        department: contact.department,
        phoneNumber: contact.phone_number,
        jobTitle: contact.job_title
      })),
      total: result.rows.length
    });
  } catch (error) {
    console.error('Contacts list error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const startServer = async () => {
  try {
    await initializeDatabase();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Backend API server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;