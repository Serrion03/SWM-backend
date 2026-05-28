const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const userAuth = require("../middleware/userAuth");

const router = express.Router();

function staffOnly(req, res, next) {
  if (req.user.role !== "staff") {
    return res.status(403).json({
      success: false,
      message: "Chỉ nhân viên được thực hiện chức năng này"
    });
  }

  next();
}

function generateApiKey() {
  return crypto.randomBytes(24).toString("hex");
}

async function createOrUpdateContractIfEnoughInfo(deviceId) {
  const [devices] = await pool.execute(
    `
    SELECT 
      d.device_id,
      d.customer_id,
      d.location,
      d.contract_date,
      d.usage_purpose,
      u.full_name,
      u.phone
    FROM devices d
    LEFT JOIN users u ON d.customer_id = u.id
    WHERE d.device_id = ?
    `,
    [deviceId]
  );

  if (devices.length === 0) return;

  const device = devices[0];

  const hasEnoughInfo =
    device.customer_id &&
    device.full_name &&
    device.phone &&
    device.location &&
    device.contract_date;

  if (!hasEnoughInfo) {
    await pool.execute(
      "DELETE FROM contracts WHERE device_id = ?",
      [device.device_id]
    );
    return;
  }

  await pool.execute(
    `
    INSERT INTO contracts
    (customer_id, device_id, usage_purpose, water_address, registered_at, status)
    VALUES (?, ?, ?, ?, ?, 'ACTIVE')
    ON DUPLICATE KEY UPDATE
      customer_id = VALUES(customer_id),
      usage_purpose = VALUES(usage_purpose),
      water_address = VALUES(water_address),
      registered_at = VALUES(registered_at),
      status = 'ACTIVE'
    `,
    [
      device.customer_id,
      device.device_id,
      device.usage_purpose || "HOUSEHOLD",
      device.location,
      device.contract_date
    ]
  );
}

// Danh sách thiết bị
router.get("/", userAuth, staffOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT 
        d.id,
        d.device_id,
        d.device_name,
        d.status,
        d.customer_id,
        u.full_name AS customer_name,
        u.email AS customer_email
      FROM devices d
      LEFT JOIN users u ON d.customer_id = u.id
      ORDER BY d.created_at DESC
    `);

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("GET devices error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/customers/list", userAuth, staffOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT id, email, full_name, phone
      FROM users
      WHERE role = 'customer'
      ORDER BY id DESC
      `
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/customers/list", userAuth, staffOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT id, email, full_name, phone
      FROM users
      WHERE role = 'customer'
      ORDER BY id DESC
      `
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Chi tiết thiết bị
router.get("/:id", userAuth, staffOnly, async (req, res) => {
  try {
    const [devices] = await pool.execute(
  `
  SELECT 
    d.id,
    d.device_id,
    d.device_name,
    d.api_key,
    d.location,
    d.status,
    d.customer_id,
    d.contract_date,
    d.usage_purpose,
    d.created_at,
    u.full_name AS customer_name,
    u.email AS customer_email,
    u.phone AS customer_phone,
    u.province,
    u.ward,
    u.house_number
  FROM devices d
  LEFT JOIN users u ON d.customer_id = u.id
  WHERE d.id = ?
  `,
  [req.params.id]
);

    if (devices.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thiết bị"
      });
    }

    const device = devices[0];

    const [readings] = await pool.execute(
      `
      SELECT *
      FROM water_readings
      WHERE device_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [device.device_id]
    );

    res.json({
      success: true,
      data: {
        ...device,
        latestReading: readings[0] || null
      }
    });
  } catch (error) {
    console.error("GET device detail error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Thêm thiết bị
router.post("/", userAuth, staffOnly, async (req, res) => {
  try {
    const {
      deviceId,
      deviceName,
      customerId,
      location,
      status,
      usage_purpose,
      contractDate
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({ field: "deviceId", message: "Mã thiết bị không được để trống" });
    }

    if (!deviceName) {
      return res.status(400).json({ field: "deviceName", message: "Tên thiết bị không được để trống" });
    }

    if (!["ACTIVE", "INACTIVE", "LOCKED"].includes(status)) {
      return res.status(400).json({ field: "status", message: "Trạng thái không hợp lệ" });
    }

    const [exists] = await pool.execute(
      "SELECT id FROM devices WHERE device_id = ?",
      [deviceId]
    );

    if (exists.length > 0) {
      return res.status(400).json({
        field: "deviceId",
        message: "Mã thiết bị đã tồn tại"
      });
    }

    const apiKey = generateApiKey();

    await pool.execute(
    `
    INSERT INTO devices
    (device_id, device_name, api_key, customer_id, location, status, contract_date, usage_purpose)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
        deviceId,
        deviceName,
        apiKey,
        customerId || null,
        location || null,
        status || "ACTIVE",
        contractDate || null,
        usage_purpose || "HOUSEHOLD"
    ]
    );

    await pool.execute(
      `
      INSERT INTO device_commands (device_id, valve_command)
      VALUES (?, 'none')
      ON DUPLICATE KEY UPDATE valve_command = 'none'
      `,
      [deviceId]
    );

    await createOrUpdateContractIfEnoughInfo(deviceId);

    res.status(201).json({
      success: true,
      message: "Thêm thiết bị thành công",
      apiKey
    });
  } catch (error) {
    console.error("POST device error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Sửa thiết bị
router.put("/:id", userAuth, staffOnly, async (req, res) => {
  try {
    const {
      deviceName,
      customerId,
      location,
      status,
      usage_purpose,
      contractDate
    } = req.body;

    if (!deviceName) {
      return res.status(400).json({ field: "deviceName", message: "Tên thiết bị không được để trống" });
    }

    if (!["ACTIVE", "INACTIVE", "LOCKED"].includes(status)) {
      return res.status(400).json({ field: "status", message: "Trạng thái không hợp lệ" });
    }

    await pool.execute(
  `
  UPDATE devices
  SET device_name = ?,
      customer_id = ?,
      location = ?,
      status = ?,
      contract_date = ?,
      usage_purpose = ?
  WHERE id = ?
  `,
  [
    deviceName,
    customerId || null,
    location || null,
    status,
    contractDate || null,
    usage_purpose || "HOUSEHOLD",
    req.params.id
  ]
);

const [devices] = await pool.execute(
  "SELECT device_id FROM devices WHERE id = ?",
  [req.params.id]
);

if (devices.length > 0) {
  await createOrUpdateContractIfEnoughInfo(devices[0].device_id);
}
    res.json({
      success: true,
      message: "Cập nhật thiết bị thành công"
    });
  } catch (error) {
    console.error("PUT device error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Xoá thiết bị
router.delete("/:id", userAuth, staffOnly, async (req, res) => {
  try {
    const [devices] = await pool.execute(
      "SELECT device_id FROM devices WHERE id = ?",
      [req.params.id]
    );

    if (devices.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy thiết bị"
      });
    }

    const deviceId = devices[0].device_id;

    await pool.execute("DELETE FROM device_commands WHERE device_id = ?", [deviceId]);
    await pool.execute("DELETE FROM water_readings WHERE device_id = ?", [deviceId]);
    await pool.execute("DELETE FROM devices WHERE id = ?", [req.params.id]);

    res.json({
      success: true,
      message: "Xoá thiết bị thành công"
    });
  } catch (error) {
    console.error("DELETE device error:", error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Lấy danh sách khách hàng để gán thiết bị

module.exports = router;