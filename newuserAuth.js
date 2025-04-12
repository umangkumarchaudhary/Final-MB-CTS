const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");
const cors = require("cors");
require("dotenv").config();

const router = express.Router();
const app = express();

// Middleware
app.use(express.json());
app.use(cors({ origin: true, credentials: true }));

// List of allowed roles
const allowedRoles = [
  "Admin",
  "Workshop Manager",
  "Security Guard",
  "Active Reception Technician",
  "Service Advisor",
  "Job Controller",
  "Bay Technician",
  "Final Inspection Technician",
  "Diagnosis Engineer",
  "Washing",
];

// MongoDB User Schema - With Password
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mobile: { type: String, unique: true, required: true },
    email: { type: String, sparse: true, default: null },
    password: { type: String, required: true },
    role: { type: String, enum: allowedRoles, required: true },
    isApproved: { type: Boolean, default: false },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

// JWT Middleware
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Access Denied" });

  try {
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    req.user = verified;
    next();
  } catch (error) {
    res.status(400).json({ message: "Invalid Token" });
  }
};

// ✅ Register User
router.post("/register", async (req, res) => {
  try {
    const { name, mobile, email, password, role } = req.body;

    if (!name || !mobile || !password || !allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid input data." });
    }

    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(400).json({ message: "User with this mobile already registered" });
    }

    const formattedEmail = email && email.trim() !== "" ? email.trim().toLowerCase() : null;

    if (formattedEmail) {
      const existingEmailUser = await User.findOne({ email: formattedEmail });
      if (existingEmailUser) {
        return res.status(400).json({ message: "User with this email already registered" });
      }
    }

    const isApproved = role === "Admin";

    const newUser = new User({
      name,
      mobile,
      email: formattedEmail,
      password,
      role,
      isApproved,
      approvedAt: isApproved ? new Date() : null,
    });

    await newUser.save();

    res.status(201).json({
      success: true,
      message: isApproved
        ? "Admin registered successfully. You can login immediately."
        : "User registered successfully. Please wait for admin approval before logging in.",
    });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error,
    });
  }
});

// ✅ Login as Another User Role
router.post("/login-as", authMiddleware, async (req, res) => {
  try {
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ message: "Target user ID is required." });
    }

    const targetUser = await User.findById(targetUserId);

    if (!targetUser) {
      return res.status(404).json({ message: "Target user not found." });
    }

    // Check permissions for Admin and Workshop Manager
    if (req.user.role === "Admin") {
      // Admin can log in as any user role
    } else if (req.user.role === "Workshop Manager") {
      // Workshop Manager cannot log in as Admin
      if (targetUser.role === "Admin") {
        return res.status(403).json({ message: "Workshop Manager cannot log in as Admin." });
      }
    } else {
      return res.status(403).json({ message: "Access Denied. Only Admin or Workshop Manager can use this feature." });
    }

    // Generate a new token for the target user
    const token = jwt.sign(
      { userId: targetUser._id, name: targetUser.name, role: targetUser.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      success: true,
      token,
      userInfo: {
        name: targetUser.name,
        mobile: targetUser.mobile,
        role: targetUser.role,
        isApproved: targetUser.isApproved,
      },
      message:
        req.user.role === "Admin"
          ? `Logged in as ${targetUser.role} by Admin.`
          : `Logged in as ${targetUser.role} by Workshop Manager.`,
    });
  } catch (error) {
    console.error("Login-As Error:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

// Other APIs remain unchanged...

module.exports = { router, authMiddleware, User };
