const express = require("express");
const pool = require("../config/db");
const userAuth = require("../middleware/userAuth");

const router = express.Router();

router.get("/", userAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT *
      FROM notifications
      WHERE receiver_id = ?
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    const [countRows] = await pool.execute(
      `
      SELECT COUNT(*) AS unread
      FROM notifications
      WHERE receiver_id = ? AND is_read = FALSE
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      unread: countRows[0].unread,
      data: rows
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

router.get("/:id", userAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT *
      FROM notifications
      WHERE id = ? AND receiver_id = ?
      `,
      [req.params.id, req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy thông báo" });
    }

    await pool.execute(
      "UPDATE notifications SET is_read = TRUE WHERE id = ?",
      [req.params.id]
    );

    res.json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;