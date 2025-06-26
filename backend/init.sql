-- Users table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    department VARCHAR(255),
    phone_number VARCHAR(50),
    job_title VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- Inserted sample user (password is 'password123')
INSERT INTO users (email, password_hash) VALUES 
('admin@company.com', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/GNxhHZ7P2')
ON CONFLICT (email) DO NOTHING;

-- Inserted sample contacts
INSERT INTO contacts (email, full_name, department, phone_number, job_title) VALUES 
('john.doe@company.com', 'John Doe', 'Engineering', '+1-555-0123', 'Senior Software Engineer'),
('jane.smith@company.com', 'Jane Smith', 'Marketing', '+1-555-0124', 'Marketing Manager'),
('bob.johnson@company.com', 'Bob Johnson', 'Sales', '+1-555-0125', 'Sales Director'),
('alice.brown@company.com', 'Alice Brown', 'HR', '+1-555-0126', 'HR Specialist'),
('charlie.wilson@company.com', 'Charlie Wilson', 'Finance', '+1-555-0127', 'Financial Analyst'),
('diana.davis@company.com', 'Diana Davis', 'Engineering', '+1-555-0128', 'Frontend Developer'),
('erik.miller@company.com', 'Erik Miller', 'Operations', '+1-555-0129', 'Operations Manager'),
('fiona.garcia@company.com', 'Fiona Garcia', 'Design', '+1-555-0130', 'UX Designer'),
('george.rodriguez@company.com', 'George Rodriguez', 'Security', '+1-555-0131', 'Security Analyst'),
('helen.martinez@company.com', 'Helen Martinez', 'Legal', '+1-555-0132', 'Legal Counsel')
ON CONFLICT (email) DO NOTHING;