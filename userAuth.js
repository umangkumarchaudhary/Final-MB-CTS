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
  "Parts Team",
];

// MongoDB User Schema - With Password and Approval Status
const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    mobile: { type: String, unique: true, required: true },
    email: { type: String, sparse: true, default: null },
    password: { type: String, required: true }, // Plain-text password (for now)
    role: { type: String, enum: allowedRoles, required: true },
    isApproved: { type: Boolean, default: false }, // New field for approval status
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

// JWT Middleware
const authMiddleware = async (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    console.log("❌ No Token Provided");
    return res.status(401).json({ message: "Access Denied. No token provided." });
  }

  try {
    console.log("🔹 Verifying Token...");
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    console.log("✅ Token Verified:", verified);

    const user = await User.findById(verified.userId);
    if (!user) {
      console.log("❌ User Not Found in Database");
      return res.status(401).json({ message: "User not found." });
    }

    // Check if user is approved (except for Admin)
    if (user.role !== "Admin" && !user.isApproved) {
      console.log("❌ User Not Approved");
      return res.status(403).json({ message: "Your account is pending admin approval." });
    }

    console.log("✅ Authenticated User:", {
      id: user._id,
      role: user.role,
      name: user.name
    });

    req.user = user; // Attach full user object
    next();
  } catch (error) {
    console.error("❌ Token Verification Failed:", error);
    res.status(400).json({ message: "Invalid Token" });
  }
};

// ✅ Register User (Requires Admin Approval for non-Admin roles)
router.post("/register", async (req, res) => {
  try {
    const { name, mobile, email, password, role } = req.body;

    // Validate input
    if (!name || !mobile || !password || !allowedRoles.includes(role)) {
      return res.status(400).json({ message: "Invalid input data." });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(400).json({ message: "User with this mobile already registered" });
    }

    // Format email if provided
    const formattedEmail = email && email.trim() !== "" ? email.trim().toLowerCase() : null;

    if (formattedEmail) {
      const existingEmailUser = await User.findOne({ email: formattedEmail });
      if (existingEmailUser) {
        return res.status(400).json({ message: "User with this email already registered" });
      }
    }

    // Create user with approval status
    const newUser = new User({
      name,
      mobile,
      email: formattedEmail,
      password, // Store as plain-text for now (no hashing)
      role,
      isApproved: role === "Admin" // Auto-approve Admin, others need approval
    });

    await newUser.save();

    const message = role === "Admin" 
      ? "Admin user registered successfully. You can log in immediately."
      : "User registered successfully. Please wait for admin approval before logging in.";

    res.status(201).json({
      success: true,
      message,
      requiresApproval: role !== "Admin"
    });
  } catch (error) {
    console.error("Registration Error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message || error,
    });
  }
});

// ✅ Login (Mobile & Password Required, Check Approval Status)
router.post("/login", async (req, res) => {
  try {
    const { mobile, password } = req.body;

    if (!mobile || !password) {
      return res.status(400).json({ message: "Mobile and password are required." });
    }

    // Find user by Mobile
    const user = await User.findOne({ mobile });

    if (!user || user.password !== password) {
      return res.status(404).json({ message: "Invalid mobile or password." });
    }

    // Check if user is approved (except for Admin)
    if (user.role !== "Admin" && !user.isApproved) {
      return res.status(403).json({ 
        message: "Your account is pending admin approval. Please wait for approval before logging in." 
      });
    }

    // Generate JWT with long expiration
    const token = jwt.sign(
      { userId: user._id, name: user.name, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "365d" } // Users stay logged in for 1 year
    );

    res.json({
      success: true,
      token,
      user: {
        name: user.name,
        mobile: user.mobile,
        role: user.role,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

// ✅ Admin: Approve User
router.post("/admin/approve-user/:userId", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Access Denied. Admins only." });
    }

    const userId = req.params.userId;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isApproved) {
      return res.status(400).json({ message: "User is already approved" });
    }

    user.isApproved = true;
    await user.save();

    res.json({ 
      success: true, 
      message: "User approved successfully",
      user: {
        _id: user._id,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        isApproved: user.isApproved
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

router.get('/admin/pending-approvals', authenticateToken, async (req, res) => {
  if (req.user.role !== 'Admin' && req.user.role !== 'Workshop Manager') {
    return res.status(403).json({ message: 'Unauthorized' });
  }

  try {
    const pendingUsers = await User.find({ isApproved: false });
    res.json({ users: pendingUsers });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching pending approvals' });
  }
});


// ✅ Logout API - No action needed
router.post("/logout", (req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

// ✅ Get All Users (Admin Access)
router.get("/users", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Access Denied. Admins only." });
    }

    const users = await User.find();

    // Exclude passwords from response
    const sanitizedUsers = users.map(user => ({
      _id: user._id,
      name: user.name,
      mobile: user.mobile,
      email: user.email,
      role: user.role,
      isApproved: user.isApproved,
      createdAt: user.createdAt
    }));

    res.json({ success: true, users: sanitizedUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

// ✅ Get User Profile
router.get("/profile", authMiddleware, async (req, res) => {
  try {
    const user = req.user; // Authenticated user from middleware

    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({
      success: true,
      profile: {
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        isApproved: user.isApproved
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

// ✅ Delete User (Admin Only)
router.delete("/users/:userId", authMiddleware, async (req, res) => {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({ message: "Access Denied. Admins only." });
    }

    const userId = req.params.userId;
    const deletedUser = await User.findByIdAndDelete(userId);

    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({ success: true, message: "User deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

// ✅ Admin: Add User (Automatically approved)
router.post("/admin/add-user", authMiddleware, async (req, res) => {
  try {
    const { name, mobile, email, password, role } = req.body;

    if (req.user.role !== "Admin") {
      return res.status(403).json({ success: false, message: "Access Denied. Admins only." });
    }

    if (!name || !mobile || !password || !allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: "Invalid input data." });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ mobile });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User with this mobile already exists." });
    }

    // Create new user (automatically approved when added by admin)
    const newUser = new User({
      name,
      mobile,
      email: email?.trim() || null,
      password,
      role,
      isApproved: true
    });

    await newUser.save();

    res.status(201).json({ 
      success: true, 
      message: "User added successfully.", 
      user: {
        _id: newUser._id,
        name: newUser.name,
        mobile: newUser.mobile,
        role: newUser.role,
        isApproved: newUser.isApproved
      }
    });
  } catch (error) {
    console.error("Admin Add User Error:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

module.exports = { router, authMiddleware, User };