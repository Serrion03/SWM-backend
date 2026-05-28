const pool = require("../config/db");

async function deviceAuth(req, res, next) {
  try {
    const apiKey = req.headers["x-api-key"];
    const deviceId = req.body.deviceId || req.params.deviceId;

    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: "Missing deviceId"
      });
    }

    if (!apiKey) {
      return res.status(401).json({
        success: false,
        message: "Missing x-api-key"
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM devices
      WHERE device_id = ? AND api_key = ?
      LIMIT 1
      `,
      [deviceId, apiKey]
    );

    if (rows.length === 0) {
      return res.status(403).json({
        success: false,
        message: "Invalid deviceId or API key"
      });
    }

     if (rows[0].status === "LOCKED" || rows[0].status === "INACTIVE") {
      return res.status(403).json({
        success: false,
        message: "Thiết bị đang bị khoá hoặc ngừng hoạt động"
      });
    }

    req.device = rows[0];

    next();
  } catch (error) {
    console.error("Device auth error:", error);

    res.status(500).json({
      success: false,
      message: "Device authentication error"
    });
  }
}

module.exports = deviceAuth;