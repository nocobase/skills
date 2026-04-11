-- Seed data for Helpdesk System

-- Agents (5 records)
INSERT INTO "nb_helpdesk_agents" ("name", "email", "role", "department", "phone", "status", "workload") VALUES
('John Smith', 'john.smith@company.com', 'Admin', 'Technical Support', '+1-555-0101', 'Active', 12),
('Sarah Johnson', 'sarah.j@company.com', 'Supervisor', 'Customer Success', '+1-555-0102', 'Active', 8),
('Mike Chen', 'mike.chen@company.com', 'Agent', 'Technical Support', '+1-555-0103', 'Active', 15),
('Emily Davis', 'emily.d@company.com', 'Agent', 'Billing', '+1-555-0104', 'Active', 6),
('Alex Wilson', 'alex.w@company.com', 'Agent', 'Sales', '+1-555-0105', 'On Leave', 0);

-- SLA Configs (4 records)
INSERT INTO "nb_helpdesk_sla_configs" ("name", "priority", "responseTimeMinutes", "resolveTimeMinutes", "businessHours", "isActive", "description") VALUES
('Critical SLA', 'P0-Critical', 15, 240, '24x7', true, 'Critical issues requiring immediate attention'),
('High Priority SLA', 'P1-High', 60, 480, 'Weekdays 9-5', true, 'High priority business impacting issues'),
('Medium Priority SLA', 'P2-Medium', 240, 1440, 'Weekdays 9-5', true, 'Medium priority standard issues'),
('Low Priority SLA', 'P3-Low', 480, 2880, 'Weekdays 9-5', true, 'Low priority feature requests and questions');

-- KB Categories (3 records)
INSERT INTO "nb_helpdesk_kb_categories" ("name", "description", "sortOrder", "isActive") VALUES
('Getting Started', 'Basic setup and getting started guides', 1, true),
('Troubleshooting', 'Common issues and troubleshooting steps', 2, true),
('API Documentation', 'Technical API reference and examples', 3, true);

-- KB Articles (5 records)
INSERT INTO "nb_helpdesk_kb_articles" ("title", "content", "categoryId", "status", "views", "tags") VALUES
('How to Reset Your Password', 'Step-by-step guide to reset your password...', 1, 'Published', 1250, ['FAQ', 'How-To']),
('Common Login Issues', 'Solutions for login problems including 2FA issues...', 2, 'Published', 890, ['Troubleshooting', 'FAQ']),
('API Authentication Guide', 'Learn how to authenticate with our REST API...', 3, 'Published', 567, ['API', 'Guide']),
('Billing FAQ', 'Frequently asked questions about billing and payments...', 1, 'Published', 432, ['FAQ', 'How-To']),
('System Status Page', 'How to check system status and incident reports...', 2, 'Draft', 0, ['Troubleshooting']);

-- Tickets (8 records)
INSERT INTO "nb_helpdesk_tickets" ("ticketNo", "title", "description", "status", "priority", "category", "requesterEmail") VALUES
('TKT-001', 'Cannot access dashboard', 'User reports 404 error when accessing dashboard', 'Open', 'P1-High', 'Technical', 'user1@example.com'),
('TKT-002', 'Password reset not working', 'Password reset email not being received', 'In Progress', 'P2-Medium', 'Technical', 'user2@example.com'),
('TKT-003', 'Feature request: Dark mode', 'Customer requesting dark mode for UI', 'New', 'P3-Low', 'Feature Request', 'user3@example.com'),
('TKT-004', 'Payment failed', 'Transaction declined but charged', 'Escalated', 'P0-Critical', 'Billing', 'user4@example.com'),
('TKT-005', 'API rate limit questions', 'Clarification on API rate limits', 'Resolved', 'P2-Medium', 'Technical', 'user5@example.com'),
('TKT-006', 'Export data to CSV', 'How to export reports to CSV format', 'Closed', 'P3-Low', 'General', 'user6@example.com'),
('TKT-007', 'Bug: Date picker broken', 'Date picker shows wrong month', 'Open', 'P1-High', 'Bug', 'user7@example.com'),
('TKT-008', 'Account cancellation', 'Request to cancel subscription', 'New', 'P2-Medium', 'Billing', 'user8@example.com');
