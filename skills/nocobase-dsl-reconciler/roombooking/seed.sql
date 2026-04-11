-- Seed Departments
INSERT INTO nb_booking_departments (name, code, manager, email, phone, description, status, "createdAt", "updatedAt") VALUES
('Human Resources', 'HR', 'Alice Chen', 'hr@company.com', '13800138001', 'HR department manages employees', 'Active', NOW(), NOW()),
('Engineering', 'ENG', 'Bob Wang', 'eng@company.com', '13800138002', 'Software development team', 'Active', NOW(), NOW()),
('Marketing', 'MKT', 'Carol Li', 'mkt@company.com', '13800138003', 'Marketing and brand team', 'Active', NOW(), NOW()),
('Sales', 'SAL', 'David Zhang', 'sales@company.com', '13800138004', 'Sales and business dev', 'Active', NOW(), NOW()),
('Finance', 'FIN', 'Eva Liu', 'finance@company.com', '13800138005', 'Finance and accounting', 'Active', NOW(), NOW()),
('Operations', 'OPS', 'Frank Wu', 'ops@company.com', '13800138006', 'Operations team', 'Active', NOW(), NOW());

-- Seed Rooms
INSERT INTO nb_booking_rooms (name, code, capacity, location, "roomType", department, "hasProjector", "hasVideoConf", status, "createdAt", "updatedAt") VALUES
('Conference Room A', 'CR-A', 20, '3F North', 'Conference', 1, true, true, 'Available', NOW(), NOW()),
('Meeting Room B1', 'MR-B1', 8, '2F East', 'Meeting', 2, true, false, 'Available', NOW(), NOW()),
('Meeting Room B2', 'MR-B2', 8, '2F East', 'Meeting', 2, true, false, 'Available', NOW(), NOW()),
('Training Room C', 'TR-C', 50, '1F West', 'Training', 3, true, true, 'Available', NOW(), NOW()),
('Interview Room D', 'IR-D', 4, '4F South', 'Interview', 1, false, false, 'Available', NOW(), NOW()),
('Board Room', 'BR-01', 30, '5F Center', 'Conference', 4, true, true, 'Available', NOW(), NOW()),
('Meeting Room E1', 'MR-E1', 12, '2F West', 'Meeting', 5, true, true, 'Maintenance', NOW(), NOW()),
('Training Room F', 'TR-F', 40, '1F East', 'Training', 6, true, true, 'Available', NOW(), NOW());

-- Seed Equipment
INSERT INTO nb_booking_equipment (name, code, type, room, "serialNumber", "purchaseDate", status, notes, "createdAt", "updatedAt") VALUES
('Projector HD1', 'PROJ-001', 'Projector', 1, 'SN123456789', '2023-01-15', 'Available', '1080p projector', NOW(), NOW()),
('Projector HD2', 'PROJ-002', 'Projector', 2, 'SN123456790', '2023-02-20', 'Available', '4K projector', NOW(), NOW()),
('Video Conf System A', 'VC-001', 'VideoConf', 1, 'SN987654321', '2023-03-10', 'Available', 'Zoom certified', NOW(), NOW()),
('Whiteboard Mobile', 'WB-001', 'Whiteboard', 3, 'SN555666777', '2023-01-05', 'Available', 'Magnetic whiteboard', NOW(), NOW()),
('TV 65 inch', 'TV-001', 'TV', 4, 'SN111222333', '2023-04-12', 'Available', 'Smart TV with casting', NOW(), NOW()),
('Audio System A', 'AUDIO-001', 'Audio', 6, 'SN444555666', '2023-05-18', 'Available', 'Wireless microphones', NOW(), NOW()),
('Projector HD3', 'PROJ-003', 'Projector', 6, 'SN123456791', '2023-06-01', 'Maintenance', 'Needs lamp replacement', NOW(), NOW()),
('Video Conf System B', 'VC-002', 'VideoConf', 8, 'SN987654322', '2023-07-22', 'Available', 'Teams certified', NOW(), NOW());

-- Seed Bookings
INSERT INTO nb_booking_bookings (title, room, requester, department, "startTime", "endTime", purpose, attendees, status, "createdAt", "updatedAt") VALUES
('Weekly Team Standup', 1, 'Alice Chen', 1, NOW() + INTERVAL '1 hour', NOW() + INTERVAL '2 hours', 'Weekly sync meeting', 10, 'Approved', NOW(), NOW()),
('Product Roadmap Review', 2, 'Bob Wang', 2, NOW() + INTERVAL '3 hours', NOW() + INTERVAL '5 hours', 'Q4 planning session', 6, 'Pending', NOW(), NOW()),
('Marketing Campaign Kickoff', 4, 'Carol Li', 3, NOW() + INTERVAL '2 days', NOW() + INTERVAL '2 days 3 hours', 'New product launch', 25, 'Approved', NOW(), NOW()),
('Sales Training', 4, 'David Zhang', 4, NOW() + INTERVAL '3 days', NOW() + INTERVAL '3 days 4 hours', 'New hire training', 30, 'Pending', NOW(), NOW()),
('Finance Audit Meeting', 6, 'Eva Liu', 5, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day 2 hours', 'Quarterly audit review', 8, 'Completed', NOW(), NOW()),
('All Hands Meeting', 8, 'Frank Wu', 6, NOW() + INTERVAL '5 days', NOW() + INTERVAL '5 days 2 hours', 'Monthly all hands', 35, 'Approved', NOW(), NOW()),
('Candidate Interview', 5, 'Alice Chen', 1, NOW() + INTERVAL '4 hours', NOW() + INTERVAL '5 hours', 'Senior dev position', 3, 'Approved', NOW(), NOW()),
('Project Retrospective', 3, 'Bob Wang', 2, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days 1 hour', 'Sprint 10 retro', 7, 'Completed', NOW(), NOW());
