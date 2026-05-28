CREATE DATABASE IF NOT EXISTS smart_water_db
CHARACTER SET utf8mb4
COLLATE utf8mb4_unicode_ci;

USE smart_water_db;

CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('customer', 'staff', 'admin') NOT NULL,
  full_name VARCHAR(100),
  phone VARCHAR(20),
  province VARCHAR(100),
  ward VARCHAR(100),
  house_number VARCHAR(255),
  position VARCHAR(100),
  branch_city VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NULL,
  device_id VARCHAR(50) NOT NULL UNIQUE,
  device_name VARCHAR(100) NOT NULL,
  api_key VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  status ENUM('ACTIVE', 'INACTIVE', 'LOCKED') DEFAULT 'ACTIVE',
  contract_date DATE NULL,
  usage_purpose ENUM('HOUSEHOLD', 'ORGANIZATION') DEFAULT 'HOUSEHOLD',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS water_readings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  flow_rate FLOAT DEFAULT 0,
  total_water_l FLOAT DEFAULT 0,
  total_water_m3 FLOAT DEFAULT 0,
  daily_water_l FLOAT DEFAULT 0,
  valve_open BOOLEAN DEFAULT TRUE,
  warning BOOLEAN DEFAULT FALSE,
  status VARCHAR(100),
  alert_type VARCHAR(100),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_device_time (device_id, created_at)
);

CREATE TABLE IF NOT EXISTS device_commands (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL UNIQUE,
  valve_command ENUM('open', 'close', 'none') DEFAULT 'none',
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alert_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  alert_type VARCHAR(100),
  message VARCHAR(255),
  flow_rate FLOAT,
  daily_water_l FLOAT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS service_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  request_type VARCHAR(100) NOT NULL,
  full_name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  province VARCHAR(100) NOT NULL,
  ward VARCHAR(100) NOT NULL,
  house_number VARCHAR(255) NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  staff_id INT NULL,
  staff_note VARCHAR(255),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (staff_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sender_id INT NULL,
  receiver_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) DEFAULT 'system',
  is_read BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id),
  FOREIGN KEY (receiver_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS contracts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  customer_id INT NOT NULL,
  device_id VARCHAR(50) NOT NULL UNIQUE,
  usage_purpose ENUM('HOUSEHOLD', 'ORGANIZATION') DEFAULT 'HOUSEHOLD',
  water_address VARCHAR(255) NOT NULL,
  registered_at DATE NOT NULL,
  status ENUM('ACTIVE', 'INACTIVE') DEFAULT 'ACTIVE',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);

CREATE TABLE IF NOT EXISTS valve_control_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  staff_id INT NOT NULL,
  customer_id INT NOT NULL,
  device_id VARCHAR(50) NOT NULL,
  command ENUM('open', 'close') NOT NULL,
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (staff_id) REFERENCES users(id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (device_id) REFERENCES devices(device_id)
);


-- INSERT INTO devices (device_id, device_name, api_key, location)
-- VALUES
-- ('device_01', 'Đồng hồ nước hộ gia đình 01', 'KEY_DEVICE_01_ABC123', 'Nhà số 1'),
-- ('device_02', 'Đồng hồ nước hộ gia đình 02', 'KEY_DEVICE_02_DEF456', 'Nhà số 2'),
-- ('device_03', 'Đồng hồ nước hộ gia đình 03', 'KEY_DEVICE_03_GHI789', 'Nhà số 3')
-- ON DUPLICATE KEY UPDATE
-- device_name = VALUES(device_name),
-- api_key = VALUES(api_key),
-- location = VALUES(location);

-- INSERT INTO device_commands (device_id, valve_command)
-- VALUES
-- ('device_01', 'none'),
-- ('device_02', 'none'),
-- ('device_03', 'none')
-- ON DUPLICATE KEY UPDATE valve_command = 'none';

-- INSERT INTO users (email, password, role, full_name, phone, province, ward, house_number)
-- VALUES
-- ('nguyenvana@gmail.com', 'Chuyenhoa123^^', 'customer', 'Nguyễn Văn A', '0987654321', 'Hà Nội', 'Hoàn Kiếm', 'Số 1, đường Văn Miếu')

-- INSERT INTO users (email, password, role, full_name, phone, province, ward, house_number, position, brand_city)
-- VALUES
-- ('staff1@hawacom.vn', 'Staff1^^', 'staff', 'Trần Thị B', '19004600', ' ', ' ', ' ', 'Chuyên viên tư vấn', 'Ninh Bình')