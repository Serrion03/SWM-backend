const express = require("express");
const pool = require("../config/db");
const userAuth = require("../middleware/userAuth");

const router = express.Router();

function validateRequestData(data) {
  const { fullName, phone, province, ward, houseNumber } = data;

  const nameRegex = /^[A-Za-zÀ-ỹ\s]+$/;
  const phoneRegex = /^[0-9]{10}$/;
  const houseRegex = /^[A-Za-zÀ-ỹ0-9\s,]+$/;

  if (!fullName) return { field: "fullName", message: "Họ và tên không được để trống" };
  if (!nameRegex.test(fullName)) return { field: "fullName", message: "Họ và tên chỉ gồm chữ cái và dấu cách" };

  if (!phone) return { field: "phone", message: "Số điện thoại không được để trống" };
  if (!phoneRegex.test(phone)) return { field: "phone", message: "Số điện thoại phải gồm đúng 10 chữ số" };

  if (!province) return { field: "province", message: "Vui lòng chọn Tỉnh/Thành phố" };
  if (!ward) return { field: "ward", message: "Vui lòng chọn Phường" };

  if (!houseNumber) return { field: "houseNumber", message: "Số nhà không được để trống" };
  if (!houseRegex.test(houseNumber)) {
    return {
      field: "houseNumber",
      message: "Số nhà chỉ gồm chữ cái, chữ số, dấu cách và dấu phẩy"
    };
  }

  return null;
}

// Khách hàng gửi yêu cầu
router.post("/", userAuth, async (req, res) => {
  try {
    if (req.user.role !== "customer") {
      return res.status(403).json({ message: "Chỉ khách hàng được gửi yêu cầu" });
    }

    const error = validateRequestData(req.body);
    if (error) return res.status(400).json(error);

    const { fullName, phone, province, ward, houseNumber } = req.body;

    const [result] = await pool.execute(
      `
      INSERT INTO service_requests
      (customer_id, request_type, full_name, phone, province, ward, house_number)
      VALUES (?, 'Đăng ký sử dụng đồng hồ nước IoT', ?, ?, ?, ?, ?)
      `,
      [req.user.id, fullName, phone, province, ward, houseNumber]
    );

    const requestId = result.insertId;

    const [staffs] = await pool.execute(
      "SELECT id FROM users WHERE role = 'staff'"
    );

    for (const staff of staffs) {
      await pool.execute(
        `
        INSERT INTO notifications (sender_id, receiver_id, title, message, type)
        VALUES (?, ?, ?, ?, 'request')
        `,
        [
          req.user.id,
          staff.id,
          "Yêu cầu mới từ khách hàng",
          `Khách hàng ${fullName} vừa gửi yêu cầu đăng ký sử dụng đồng hồ nước IoT. Mã yêu cầu: #${requestId}`
        ]
      );
    }

    await pool.execute(
      `
      INSERT INTO notifications (sender_id, receiver_id, title, message, type)
      VALUES (NULL, ?, ?, ?, 'request')
      `,
      [
        req.user.id,
        "Gửi yêu cầu thành công",
        `Yêu cầu đăng ký sử dụng đồng hồ nước IoT của bạn đã được gửi thành công. Mã yêu cầu: #${requestId}`
      ]
    );

    res.status(201).json({
      success: true,
      message: "Gửi yêu cầu thành công"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Khách hàng xem yêu cầu của mình
router.get("/my", userAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT *
      FROM service_requests
      WHERE customer_id = ?
      ORDER BY created_at DESC
      `,
      [req.user.id]
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Nhân viên xem tất cả yêu cầu
router.get("/", userAuth, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ message: "Chỉ nhân viên được xem danh sách yêu cầu" });
    }

    const [rows] = await pool.execute(
      `
      SELECT sr.*, u.email AS customer_email
      FROM service_requests sr
      JOIN users u ON sr.customer_id = u.id
      ORDER BY sr.created_at DESC
      `
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Xem chi tiết yêu cầu
router.get("/:id", userAuth, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT sr.*, u.email AS customer_email
      FROM service_requests sr
      JOIN users u ON sr.customer_id = u.id
      WHERE sr.id = ?
      `,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu" });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Nhân viên duyệt/từ chối yêu cầu
router.put("/:id/status", userAuth, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({ message: "Chỉ nhân viên được xử lý yêu cầu" });
    }

    const { status } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Trạng thái không hợp lệ" });
    }

    const [requests] = await pool.execute(
      "SELECT * FROM service_requests WHERE id = ?",
      [req.params.id]
    );

    if (requests.length === 0) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu" });
    }

    const request = requests[0];

    await pool.execute(
      `
      UPDATE service_requests
      SET status = ?, staff_id = ?
      WHERE id = ?
      `,
      [status, req.user.id, req.params.id]
    );

    const statusText = status === "approved" ? "được chấp nhận" : "bị từ chối";

    await pool.execute(
      `
      INSERT INTO notifications (sender_id, receiver_id, title, message, type)
      VALUES (?, ?, ?, ?, 'request')
      `,
      [
        req.user.id,
        request.customer_id,
        "Kết quả xử lý yêu cầu",
        `Yêu cầu đăng ký sử dụng đồng hồ nước IoT #${req.params.id} của bạn đã ${statusText}.`
      ]
    );

    await pool.execute(
      `
      INSERT INTO notifications (sender_id, receiver_id, title, message, type)
      VALUES (?, ?, ?, ?, 'request')
      `,
      [
        req.user.id,
        req.user.id,
        "Đã xử lý yêu cầu",
        `Bạn đã ${status === "approved" ? "chấp nhận" : "từ chối"} yêu cầu #${req.params.id}.`
      ]
    );

    res.json({
      success: true,
      message: `Yêu cầu đã ${statusText}`
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;