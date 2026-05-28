const express = require("express");
const cors = require("cors");
require("dotenv").config();

const authRoutes = require("./routes/auth.routes");
const iotRoutes = require("./routes/iot.routes");
const requestRoutes = require("./routes/request.routes");
const notificationRoutes = require("./routes/notification.routes");
const deviceRoutes = require("./routes/device.routes");
const contractRoutes = require("./routes/contract.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    message: "Smart Water Meter Backend API is running"
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/iot", iotRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/devices", deviceRoutes);
app.use("/api/contracts", contractRoutes);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});