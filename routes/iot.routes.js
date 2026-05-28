const express = require("express");
const router = express.Router();

const pool = require("../config/db");
const deviceAuth = require("../middleware/deviceAuth");
const userAuth = require("../middleware/userAuth");

// ESP32 gửi dữ liệu lên backend
router.post("/readings", deviceAuth, async (req, res) => {
  try {
    const {
      deviceId,
      flowRate,
      totalWaterL,
      totalWaterM3,
      dailyWaterL,
      valveOpen,
      warning,
      status,
      alertType
    } = req.body;

    if (!deviceId) {
      return res.status(400).json({ message: "Thiếu deviceId" });
    }

    await pool.execute(
      "INSERT INTO devices (device_id) VALUES (?) ON DUPLICATE KEY UPDATE device_id = device_id",
      [deviceId]
    );

    await pool.execute(
      `
      INSERT INTO water_readings
      (
        device_id,
        flow_rate,
        total_water_l,
        total_water_m3,
        daily_water_l,
        valve_open,
        warning,
        status,
        alert_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        deviceId,
        flowRate || 0,
        totalWaterL || 0,
        totalWaterM3 || 0,
        dailyWaterL || 0,
        valveOpen ? 1 : 0,
        warning ? 1 : 0,
        status || "NORMAL",
        alertType || "NONE"
      ]
    );

    if (warning) {
      await pool.execute(
        `
        INSERT INTO alert_logs
        (
          device_id,
          alert_type,
          message,
          flow_rate,
          daily_water_l
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          deviceId,
          alertType || "UNKNOWN",
          `Cảnh báo từ thiết bị ${deviceId}: ${alertType || "UNKNOWN"}`,
          flowRate || 0,
          dailyWaterL || 0
        ]
      );
    }

    res.status(201).json({
      success: true,
      message: "Reading saved successfully",
      deviceId
    });
  } catch (error) {
    console.error("POST /readings error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// ESP32 đọc lệnh đóng/mở van
router.get("/devices/:deviceId/command", deviceAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;

    const [rows] = await pool.execute(
      `
      SELECT valve_command
      FROM device_commands
      WHERE device_id = ?
      LIMIT 1
      `,
      [deviceId]
    );

    if (rows.length === 0) {
      await pool.execute(
        `
        INSERT INTO device_commands (device_id, valve_command)
        VALUES (?, 'none')
        `,
        [deviceId]
      );

      return res.json({
        valveCommand: "none"
      });
    }

    res.json({
      valveCommand: rows[0].valve_command
    });
  } catch (error) {
    console.error("GET /command error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Web/App xem danh sách thiết bị
router.get("/devices", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT 
        device_id,
        device_name,
        location,
        status,
        created_at
      FROM devices
      ORDER BY created_at DESC
      `
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("GET /devices error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Web/App thêm thiết bị mới
router.post("/devices", async (req, res) => {
  try {
    const { deviceId, deviceName, apiKey, location } = req.body;

    if (!deviceId || !deviceName || !apiKey) {
      return res.status(400).json({
        success: false,
        message: "deviceId, deviceName and apiKey are required"
      });
    }

    await pool.execute(
      `
      INSERT INTO devices
      (
        device_id,
        device_name,
        api_key,
        location
      )
      VALUES (?, ?, ?, ?)
      `,
      [
        deviceId,
        deviceName,
        apiKey,
        location || null
      ]
    );

    await pool.execute(
      `
      INSERT INTO device_commands (device_id, valve_command)
      VALUES (?, 'none')
      `,
      [deviceId]
    );

    res.status(201).json({
      success: true,
      message: "Device created successfully",
      deviceId
    });
  } catch (error) {
    console.error("POST /devices error:", error);

    res.status(500).json({
      success: false,
      message: "Server error or device already exists"
    });
  }
});

// Web/App xem dữ liệu realtime mới nhất của một thiết bị
router.get("/devices/:deviceId/realtime", userAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;

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

    res.json({
      success: true,
      data: rows[0] || null
    });
  } catch (error) {
    console.error("GET /realtime error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Web/App xem realtime của tất cả thiết bị
router.get("/realtime/all", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT wr.*
      FROM water_readings wr
      INNER JOIN (
        SELECT device_id, MAX(created_at) AS max_time
        FROM water_readings
        GROUP BY device_id
      ) latest
      ON wr.device_id = latest.device_id
      AND wr.created_at = latest.max_time
      ORDER BY wr.created_at DESC
      `
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("GET /realtime/all error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Web/App xem lịch sử của một thiết bị
router.get("/devices/:deviceId/history", userAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = Number(req.query.limit || 50);

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM water_readings
      WHERE device_id = ?
      ORDER BY created_at DESC
      LIMIT 100
      `,
      [deviceId]
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("GET /history error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Web/App xem cảnh báo của một thiết bị
router.get("/devices/:deviceId/alerts", userAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const limit = Number(req.query.limit || 50);

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM alert_logs
      WHERE device_id = ?
      ORDER BY created_at DESC
      LIMIT ?
      `,
      [deviceId, limit]
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("GET /alerts error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Web/App xem cảnh báo tất cả thiết bị
router.get("/alerts/all", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 100);

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM alert_logs
      ORDER BY created_at DESC
      LIMIT ?
      `,
      [limit]
    );

    res.json({
      success: true,
      data: rows
    });
  } catch (error) {
    console.error("GET /alerts/all error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Web/App gửi lệnh điều khiển van cho từng thiết bị
router.post("/devices/:deviceId/command", userAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { valveCommand } = req.body;

    if (!["open", "close", "none"].includes(valveCommand)) {
      return res.status(400).json({
        success: false,
        message: "valveCommand must be open, close, or none"
      });
    }

    await pool.execute(
      `
      INSERT INTO device_commands (device_id, valve_command)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE valve_command = VALUES(valve_command)
      `,
      [deviceId, valveCommand]
    );

    res.json({
      success: true,
      message: "Command updated successfully",
      deviceId,
      valveCommand
    });
  } catch (error) {
    console.error("POST /command error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// Web/App khóa hoặc mở lại thiết bị
router.patch("/devices/:deviceId/status", userAuth, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { status } = req.body;

    if (!["ACTIVE", "INACTIVE", "LOCKED"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be ACTIVE, INACTIVE, or LOCKED"
      });
    }

    await pool.execute(
      `
      UPDATE devices
      SET status = ?
      WHERE device_id = ?
      `,
      [status, deviceId]
    );

    res.json({
      success: true,
      message: "Device status updated successfully",
      deviceId,
      status
    });
  } catch (error) {
    console.error("PATCH /status error:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

module.exports = router;