const express = require("express");
const pool = require("../config/db");
const userAuth = require("../middleware/userAuth");

const router = express.Router();

function staffOnly(req, res, next) {
  if (req.user.role !== "staff") {
    return res.status(403).json({ success: false, message: "Chỉ nhân viên được truy cập" });
  }
  next();
}

async function getLatestReading(deviceId) {
  const [rows] = await pool.execute(
    `
    SELECT *
    FROM water_readings
    WHERE device_id = ?
    ORDER BY created_at DESC
    LIMIT 1
    `,
    [deviceId]
  );

  return rows[0] || null;
}

async function getDailyChart(deviceId) {
  const [rows] = await pool.execute(
    `
    SELECT 
      DATE(created_at) AS label,
      MAX(daily_water_l) AS value
    FROM water_readings
    WHERE device_id = ?
    GROUP BY DATE(created_at)
    ORDER BY label DESC
    LIMIT 7
    `,
    [deviceId]
  );

  return rows.reverse();
}

async function getMonthlyChart(deviceId) {
  const [rows] = await pool.execute(
    `
    SELECT 
      DATE_FORMAT(created_at, '%Y-%m') AS label,
      MAX(total_water_l) AS value
    FROM water_readings
    WHERE device_id = ?
    GROUP BY DATE_FORMAT(created_at, '%Y-%m')
    ORDER BY label DESC
    LIMIT 6
    `,
    [deviceId]
  );

  return rows.reverse();
}

// Khách hàng xem hợp đồng của mình
router.get("/my", userAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT 
        c.*,
        u.full_name AS customer_name,
        u.phone AS customer_phone,
        d.device_name,
        d.status AS device_status
      FROM contracts c
      JOIN users u ON c.customer_id = u.id
      JOIN devices d ON c.device_id = d.device_id
      WHERE c.customer_id = ?
      ORDER BY c.created_at DESC
      `,
      [req.user.id]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Nhân viên xem tất cả hợp đồng
router.get("/", userAuth, staffOnly, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT 
        c.*,
        u.full_name AS customer_name,
        u.phone AS customer_phone,
        d.device_name,
        d.status AS device_status
      FROM contracts c
      JOIN users u ON c.customer_id = u.id
      JOIN devices d ON c.device_id = d.device_id
      ORDER BY c.created_at DESC
      `
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Chi tiết hợp đồng
router.get("/:id", userAuth, async (req, res) => {
  try {
    let sql = `
      SELECT 
        c.*,
        u.full_name AS customer_name,
        u.phone AS customer_phone,
        u.email AS customer_email,
        d.device_name,
        d.status AS device_status
      FROM contracts c
      JOIN users u ON c.customer_id = u.id
      JOIN devices d ON c.device_id = d.device_id
      WHERE c.id = ?
    `;

    const params = [req.params.id];

    if (req.user.role === "customer") {
      sql += " AND c.customer_id = ?";
      params.push(req.user.id);
    }

    const [rows] = await pool.execute(sql, params);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hợp đồng" });
    }

    const contract = rows[0];
    const latestReading = await getLatestReading(contract.device_id);
    const dailyChart = await getDailyChart(contract.device_id);
    const monthlyChart = await getMonthlyChart(contract.device_id);

    res.json({
      success: true,
      data: {
        ...contract,
        latestReading,
        dailyChart,
        monthlyChart
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Khách hàng tự đóng/mở van
router.post("/:id/valve", userAuth, async (req, res) => {
  try {
    const { command } = req.body;

    if (!["open", "close"].includes(command)) {
      return res.status(400).json({ success: false, message: "Lệnh không hợp lệ" });
    }

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM contracts
      WHERE id = ? AND customer_id = ?
      `,
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hợp đồng" });
    }

    const contract = rows[0];

    await pool.execute(
      `
      INSERT INTO device_commands (device_id, valve_command)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE valve_command = VALUES(valve_command)
      `,
      [contract.device_id, command]
    );

    await pool.execute(
      `
      INSERT INTO notifications (sender_id, receiver_id, title, message, type)
      VALUES (?, ?, ?, ?, 'valve')
      `,
      [
        req.user.id,
        req.user.id,
        "Điều khiển van thành công",
        `Bạn đã gửi lệnh ${command === "open" ? "mở van" : "đóng van"} cho thiết bị ${contract.device_id}.`
      ]
    );

    res.json({
      success: true,
      message: command === "open" ? "Đã gửi lệnh mở van" : "Đã gửi lệnh đóng van"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Nhân viên gửi yêu cầu đóng/mở van cho khách hàng xác nhận
router.post("/:id/valve-request", userAuth, staffOnly, async (req, res) => {
  try {
    const { command } = req.body;

    if (!["open", "close"].includes(command)) {
      return res.status(400).json({ success: false, message: "Lệnh không hợp lệ" });
    }

    const [rows] = await pool.execute(
      "SELECT * FROM contracts WHERE id = ?",
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy hợp đồng" });
    }

    const contract = rows[0];

    const [result] = await pool.execute(
      `
      INSERT INTO valve_control_requests
      (staff_id, customer_id, device_id, command)
      VALUES (?, ?, ?, ?)
      `,
      [req.user.id, contract.customer_id, contract.device_id, command]
    );

    await pool.execute(
      `
      INSERT INTO notifications (sender_id, receiver_id, title, message, type)
      VALUES (?, ?, ?, ?, 'valve_request')
      `,
      [
        req.user.id,
        contract.customer_id,
        "Yêu cầu điều khiển van",
        `Nhân viên yêu cầu ${command === "open" ? "mở van" : "đóng van"} cho thiết bị ${contract.device_id}. Mã yêu cầu: #${result.insertId}`
      ]
    );

    res.json({
      success: true,
      message: "Đã gửi yêu cầu xác nhận đến khách hàng"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Khách hàng xử lý yêu cầu đóng/mở van từ nhân viên
router.post("/valve-requests/:requestId/respond", userAuth, async (req, res) => {
  try {
    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: "Trạng thái không hợp lệ" });
    }

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM valve_control_requests
      WHERE id = ? AND customer_id = ? AND status = 'pending'
      `,
      [req.params.requestId, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: "Không tìm thấy yêu cầu" });
    }

    const request = rows[0];

    await pool.execute(
      "UPDATE valve_control_requests SET status = ? WHERE id = ?",
      [status, req.params.requestId]
    );

    if (status === "approved") {
      await pool.execute(
        `
        INSERT INTO device_commands (device_id, valve_command)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE valve_command = VALUES(valve_command)
        `,
        [request.device_id, request.command]
      );
    }

    await pool.execute(
      `
      INSERT INTO notifications (sender_id, receiver_id, title, message, type)
      VALUES (?, ?, ?, ?, 'valve_request')
      `,
      [
        req.user.id,
        request.staff_id,
        "Khách hàng đã phản hồi yêu cầu",
        `Khách hàng đã ${status === "approved" ? "xác nhận" : "huỷ"} yêu cầu ${request.command === "open" ? "mở van" : "đóng van"} thiết bị ${request.device_id}.`
      ]
    );

    res.json({
      success: true,
      message: status === "approved" ? "Đã xác nhận yêu cầu" : "Đã huỷ yêu cầu"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;