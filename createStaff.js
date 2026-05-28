const bcrypt = require("bcryptjs");
const pool = require("./config/db");

async function createStaff() {
  const email = "staff1@hawacom.vn";
  const password = "Staff1^^";
  const hashedPassword = await bcrypt.hash(password, 10);

  await pool.execute(
    `
    INSERT INTO users (email, password, role, full_name, phone, position, branch_city)
    VALUES
    (?, ?, 'staff', 'Trần Thị B', '19004600', 'Chuyên viên tư vấn', 'Ninh Bình')
    `,
    [email, hashedPassword]
  );

  console.log("Đã tạo tài khoản nhân viên:");
  console.log("Email:", email);
  console.log("Password:", password);

  process.exit();
}

createStaff();