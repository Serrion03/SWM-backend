const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const router = express.Router();

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password) {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
}

router.post("/register", async (req, res) => {
  try {
    const { email, password, confirmPassword } = req.body;

    if (!email) {
      return res.status(400).json({ field: "email", message: "Email không được để trống" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ field: "email", message: "Email không đúng định dạng" });
    }

    if (!email.endsWith("@gmail.com")) {
      return res.status(400).json({ field: "email", message: "Khách hàng phải dùng email gmail.com" });
    }

    if (!password) {
      return res.status(400).json({ field: "password", message: "Mật khẩu không được để trống" });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        field: "password",
        message: "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số"
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        field: "confirmPassword",
        message: "Xác nhận mật khẩu không trùng khớp"
      });
    }

    const [exists] = await pool.execute(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );

    if (exists.length > 0) {
      return res.status(400).json({
        field: "email",
        message: "Email này đã tồn tại"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.execute(
      "INSERT INTO users (email, password, role) VALUES (?, ?, 'customer')",
      [email, hashedPassword]
    );

    res.status(201).json({
      success: true,
      message: "Đăng ký thành công"
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email) {
      return res.status(400).json({ field: "email", message: "Email không được để trống" });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ field: "email", message: "Email không đúng định dạng" });
    }

    if (!password) {
      return res.status(400).json({ field: "password", message: "Mật khẩu không được để trống" });
    }

    if (role === "customer" && !email.endsWith("@gmail.com")) {
      return res.status(400).json({
        field: "email",
        message: "Email khách hàng phải có đuôi gmail.com"
      });
    }

    if (role === "staff" && !email.endsWith("@hawacom.vn")) {
      return res.status(400).json({
        field: "email",
        message: "Email nhân viên phải có đuôi hawacom.vn"
      });
    }

    const [users] = await pool.execute(
      "SELECT * FROM users WHERE email = ? AND role = ?",
      [email, role]
    );

    if (users.length === 0) {
      return res.status(400).json({
        field: "email",
        message: "Email chưa tồn tại"
      });
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({
        field: "password",
        message: "Mật khẩu không đúng"
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      success: true,
      message: "Đăng nhập thành công",
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.full_name,
        phone: user.phone,
        address: user.address
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Lỗi server" });
  }
});

const userAuth = require("../middleware/userAuth");

// Lấy thông tin cá nhân
router.get("/customer/profile", userAuth, async (req, res) => {
  try {

    // Chỉ cho customer truy cập
    if (req.user.role !== "customer") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền truy cập"
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        id,
        email,
        role,
        full_name,
        phone,
        province,
        ward,
        house_number
      FROM users
      WHERE id = ?
      `,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản khách hàng"
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Lỗi server"
    });
  }
});

router.get("/staff/profile", userAuth, async (req, res) => {
  try {

    // Chỉ cho staff truy cập
    if (req.user.role !== "staff") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền truy cập"
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        id,
        email,
        role,
        full_name,
        phone,
        position,
        branch_city
      FROM users
      WHERE id = ?
      `,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản nhân viên"
      });
    }

    res.json({
      success: true,
      data: rows[0]
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      message: "Lỗi server"
    });
  }
});

// Cập nhật thông tin cá nhân
router.put("/customer/profile", userAuth, async (req, res) => {
  try {
    const { fullName, phone, province, ward, houseNumber } = req.body;

    const nameRegex = /^[A-Za-zÀ-ỹ\s]+$/;
    const phoneRegex = /^[0-9]{10}$/;
    const houseRegex = /^[A-Za-zÀ-ỹ0-9\s,]+$/;

    if (!fullName) {
      return res.status(400).json({ field: "fullName", message: "Họ và tên không được để trống" });
    }

    if (!nameRegex.test(fullName)) {
      return res.status(400).json({ field: "fullName", message: "Họ và tên chỉ gồm chữ cái và dấu cách" });
    }

    if (!phone) {
      return res.status(400).json({ field: "phone", message: "Số điện thoại không được để trống" });
    }

    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ field: "phone", message: "Số điện thoại phải gồm đúng 10 chữ số" });
    }

    if (!province) {
      return res.status(400).json({ field: "province", message: "Vui lòng chọn Tỉnh/Thành phố" });
    }

    if (!ward) {
      return res.status(400).json({ field: "ward", message: "Vui lòng chọn Phường" });
    }

    if (!houseNumber) {
      return res.status(400).json({ field: "houseNumber", message: "Số nhà không được để trống" });
    }

    if (!houseRegex.test(houseNumber)) {
      return res.status(400).json({
        field: "houseNumber",
        message: "Số nhà chỉ gồm chữ cái, chữ số, dấu cách và dấu phẩy"
      });
    }

    await pool.execute(
      `
      UPDATE users
      SET full_name = ?, phone = ?, province = ?, ward = ?, house_number = ?
      WHERE id = ?
      `,
      [fullName, phone, province, ward, houseNumber, req.user.id]
    );

    res.json({
      success: true,
      message: "Cập nhật thông tin thành công"
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

router.put("/staff/profile", userAuth, async (req, res) => {
  try {
    if (req.user.role !== "staff") {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền cập nhật thông tin nhân viên"
      });
    }

    const { fullName, phone, branchCity } = req.body;

    const nameRegex = /^[A-Za-zÀ-ỹ\s]+$/;
    const phoneRegex = /^[0-9]{10}$/;

    if (!fullName) {
      return res.status(400).json({ field: "fullName", message: "Họ và tên không được để trống" });
    }

    if (!nameRegex.test(fullName)) {
      return res.status(400).json({ field: "fullName", message: "Họ và tên chỉ gồm chữ cái và dấu cách" });
    }

    if (!phone) {
      return res.status(400).json({ field: "phone", message: "Số điện thoại không được để trống" });
    }

    if (!phoneRegex.test(phone)) {
      return res.status(400).json({ field: "phone", message: "Số điện thoại phải gồm đúng 10 chữ số" });
    }

    if (!branchCity) {
      return res.status(400).json({ field: "branchCity", message: "Vui lòng chọn chi nhánh thành phố" });
    }

    await pool.execute(
      `
      UPDATE users
      SET full_name = ?, phone = ?, branch_city = ?
      WHERE id = ? AND role = 'staff'
      `,
      [fullName, phone, branchCity, req.user.id]
    );

    res.json({
      success: true,
      message: "Cập nhật thông tin nhân viên thành công"
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

// Đổi mật khẩu
router.put("/change-password", userAuth, async (req, res) => {
  try {
    const { oldPassword, newPassword, confirmNewPassword } = req.body;

    const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

    if (!oldPassword) {
      return res.status(400).json({ field: "oldPassword", message: "Mật khẩu cũ không được để trống" });
    }

    if (!newPassword) {
      return res.status(400).json({ field: "newPassword", message: "Mật khẩu mới không được để trống" });
    }

    if (!strongPasswordRegex.test(newPassword)) {
      return res.status(400).json({
        field: "newPassword",
        message: "Mật khẩu mới phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường và số"
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({
        field: "confirmNewPassword",
        message: "Xác nhận mật khẩu mới không trùng khớp"
      });
    }

    const [users] = await pool.execute(
      "SELECT password FROM users WHERE id = ?",
      [req.user.id]
    );

    const isMatch = await bcrypt.compare(oldPassword, users[0].password);

    if (!isMatch) {
      return res.status(400).json({
        field: "oldPassword",
        message: "Mật khẩu cũ không đúng"
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await pool.execute(
      "UPDATE users SET password = ? WHERE id = ?",
      [hashedPassword, req.user.id]
    );

    res.json({
      success: true,
      message: "Thay đổi mật khẩu thành công"
    });
  } catch (error) {
    res.status(500).json({ message: "Lỗi server" });
  }
});

module.exports = router;