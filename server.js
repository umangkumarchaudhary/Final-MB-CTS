const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const cookieParser = require("cookie-parser");
require("dotenv").config();
const dashboardRoute = require("./dashboardRoute");

const { router: userAuthRoutes } = require("./userAuth");
const vehicleRoutes = require("./vehicleRoute");


const app = express();

// ✅ Middleware
app.use(express.json({ limit: "10mb" })); // Handle large requests
app.use(cookieParser());

// ✅ CORS: Allow all for mobile app
app.use(cors({ origin: "*", credentials: true }));

// ✅ Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Failed:", err));

mongoose.connection.on("disconnected", () => {
  console.log("❌ MongoDB disconnected! Reconnecting...");
  mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
});

// ✅ Use Routes
app.use("/api", userAuthRoutes);
app.use("/api", vehicleRoutes);
app.use("/api", dashboardRoute);
// ✅ Health Check Route
app.get("/health", (req, res) => {
  res.status(200).json({ status: "Server is healthy" });
});

// ✅ Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));