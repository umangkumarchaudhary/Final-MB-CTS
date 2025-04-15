const express = require("express");
const router = express.Router();
const Vehicle = require("./models/vehicle");
const {authMiddleware} = require("./userAuth");

// ✅ 1️⃣ POST: Handle Vehicle Check-in and Stage Updates

router.post("/vehicle-check", authMiddleware, async (req, res) => {
  console.log("🔹 Incoming Request Data:", req.body);

  try {
    let {
      vehicleNumber,
      role,
      stageName,
      eventType,
      inKM,
      outKM,
      inDriver,
      outDriver,
      workType,
      bayNumber,
    } = req.body;

    // Validate required fields
    if (!vehicleNumber || !stageName || !eventType) {
      console.log("❌ Missing required fields");
      return res.status(400).json({
        success: false,
        message: "Vehicle number, stage name and event type are required."
      });
    }

    // Validate user role matches the role in request
    if (req.user.role !== role) {
      return res.status(403).json({
        success: false,
        message: "Your user role doesn't match the requested action role"
      });
    }

    const formattedVehicleNumber = vehicleNumber.trim().toUpperCase();
    
    // Find the most recent active vehicle entry
    let vehicle = await Vehicle.findOne({
      vehicleNumber: formattedVehicleNumber,
      exitTime: null
    }).sort({ entryTime: -1 });

    // SECURITY GUARD SPECIFIC LOGIC
    if (role === "Security Guard") {
      // ENTRY LOGIC
      if (eventType === "Start") {
        const twelveHoursAgo = new Date();
        twelveHoursAgo.setHours(twelveHoursAgo.getHours() - 12);

        // Check for recent entries
        const recentVehicle = await Vehicle.findOne({
          vehicleNumber: formattedVehicleNumber,
          entryTime: { $gte: twelveHoursAgo },
          exitTime: null,
        });

        if (recentVehicle) {
          // Close all previous open entries
          await Vehicle.updateMany(
            { vehicleNumber: formattedVehicleNumber, exitTime: null },
            { $set: { exitTime: new Date() } }
          );
          console.log(`🔹 Closed previous open entries for ${formattedVehicleNumber}`);
        }

        // Create new entry
        const newVehicle = new Vehicle({
          vehicleNumber: formattedVehicleNumber,
          entryTime: new Date(),
          exitTime: null,
          stages: [{
            stageName,
            role,
            eventType,
            timestamp: new Date(),
            performedBy: {
              userId: req.user._id,
              userName: req.user.name
            },
            inKM: inKM || null,
            outKM: null,
            inDriver: inDriver || null,
            outDriver: null
          }]
        });

        await newVehicle.save();
        return res.status(201).json({
          success: true,
          message: "New vehicle entry recorded",
          vehicle: newVehicle
        });
      }

      // EXIT LOGIC
      if (eventType === "End") {
        if (!vehicle) {
          return res.status(400).json({
            success: false,
            message: "No active vehicle entry found to close"
          });
        }

        // Update the vehicle exit
        vehicle.exitTime = new Date();
        vehicle.stages.push({
          stageName,
          role,
          eventType,
          timestamp: new Date(),
          performedBy: {
            userId: req.user._id,
            userName: req.user.name
          },
          inKM: null,
          outKM: outKM || null,
          inDriver: null,
          outDriver: outDriver || null
        });

        await vehicle.save();
        return res.status(200).json({
          success: true,
          message: "Vehicle exit recorded",
          vehicle
        });
      }
    }

    // FOR OTHER ROLES - ALLOW NEW ENTRY IF VEHICLE DOESN'T EXIST
    if (!vehicle && eventType === "Start") {
      // Create new entry for non-security roles
      const newVehicle = new Vehicle({
        vehicleNumber: formattedVehicleNumber,
        entryTime: new Date(),
        exitTime: null,
        stages: [{
          stageName,
          role,
          eventType,
          timestamp: new Date(),
          performedBy: {
            userId: req.user._id,
            userName: req.user.name
          },
          workType: role === "Bay Technician" ? workType || null : null,
          bayNumber: role === "Bay Technician" ? bayNumber || null : null
        }]
      });

      await newVehicle.save();
      return res.status(201).json({
        success: true,
        message: "New vehicle entry recorded",
        vehicle: newVehicle
      });
    } else if (!vehicle && eventType !== "Start") {
      return res.status(400).json({
        success: false,
        message: "No active vehicle entry found. Please start a new entry first."
      });
    }

    // BAY WORK SPECIFIC LOGIC
    if (stageName.startsWith("Bay Work")) {
      const bayWorkStages = vehicle.stages.filter(stage =>
        stage.stageName.startsWith("Bay Work")
      );
    
      const bayNum = isNaN(bayNumber) ? bayNumber : Number(bayNumber);
    
      if (eventType === "Start") {
        const bayWorkCount = bayWorkStages.filter(stage =>
          stage.workType === workType &&
          stage.bayNumber == bayNum &&
          stage.eventType === "Start"
        ).length;
    
        const unfinishedSameBayWork = bayWorkStages.find(stage =>
          stage.workType === workType &&
          stage.bayNumber == bayNum &&
          stage.eventType === "Start" &&
          !bayWorkStages.some(s =>
            s.workType === workType &&
            s.bayNumber == bayNum &&
            s.eventType === "End" &&
            s.timestamp > stage.timestamp
          )
        );
    
        if (unfinishedSameBayWork) {
          return res.status(400).json({
            success: false,
            message: `Please end the previous ${workType} work in bay ${bayNum} first`
          });
        }
    
        const unfinishedAnyWork = bayWorkStages.find(stage =>
          stage.eventType === "Start" &&
          !bayWorkStages.some(s =>
            s.eventType === "End" &&
            s.timestamp > stage.timestamp
          )
        );
    
        if (unfinishedAnyWork) {
          vehicle.stages.push({
            stageName: unfinishedAnyWork.stageName,
            role: unfinishedAnyWork.role,
            eventType: "End",
            timestamp: new Date(),
            performedBy: {
              userId: req.user._id,
              userName: req.user.name
            },
            workType: null,
            bayNumber: null,
            autoClosed: true
          });
          console.log(`⚠️ Auto-closed previous unfinished Bay Work: ${unfinishedAnyWork.stageName}`);
        }
    
        stageName = `Bay Work: ${workType}: ${bayWorkCount + 1}`;
      }
    
      if (["Pause", "Resume", "End"].includes(eventType)) {
        const lastStart = bayWorkStages
          .filter(stage =>
            stage.workType === workType &&
            stage.bayNumber == bayNum &&
            stage.eventType === "Start" &&
            stage.stageName.startsWith("Bay Work")
          )
          .sort((a, b) => b.timestamp - a.timestamp)[0];
    
        if (!lastStart) {
          return res.status(400).json({
            success: false,
            message: `Cannot ${eventType.toLowerCase()} - no active ${workType} work in bay ${bayNum}`
          });
        }
    
        const hasEnded = bayWorkStages.some(stage =>
          stage.workType === workType &&
          stage.bayNumber == bayNum &&
          stage.eventType === "End" &&
          stage.timestamp > lastStart.timestamp
        );
    
        if (hasEnded) {
          return res.status(400).json({
            success: false,
            message: `Cannot ${eventType.toLowerCase()} - work has already ended`
          });
        }
    
        const pauses = bayWorkStages
          .filter(stage =>
            stage.workType === workType &&
            stage.bayNumber == bayNum &&
            stage.eventType === "Pause" &&
            stage.timestamp > lastStart.timestamp
          )
          .sort((a, b) => b.timestamp - a.timestamp);
    
        const resumes = bayWorkStages
          .filter(stage =>
            stage.workType === workType &&
            stage.bayNumber == bayNum &&
            stage.eventType === "Resume" &&
            stage.timestamp > lastStart.timestamp
          )
          .sort((a, b) => b.timestamp - a.timestamp);
    
        if (eventType === "Pause" && pauses.length > resumes.length) {
          return res.status(400).json({
            success: false,
            message: "Work is already paused"
          });
        }
    
        if (eventType === "Resume" && (pauses.length === 0 || resumes.length >= pauses.length)) {
          return res.status(400).json({
            success: false,
            message: "Work is not paused"
          });
        }
    
        if (eventType === "End" && pauses.length > resumes.length) {
          return res.status(400).json({
            success: false,
            message: "Cannot end while work is paused - please resume first"
          });
        }
      }
    }

    // PREVENT DUPLICATE STAGE STARTS
    if (eventType === "Start") {
      const existingStage = vehicle.stages.find(stage => 
        stage.stageName === stageName && stage.eventType === "Start"
      );
      
      if (existingStage && !vehicle.stages.some(stage => 
        stage.stageName === stageName && stage.eventType === "End"
      )) {
        return res.status(400).json({
          success: false,
          message: `${stageName} has already been started and can only be started once.`
        });
      }
    }

    // SERVICE ADVISOR LOGIC
    if (role === "Service Advisor") {
      if (stageName === "Additional Work Job Approval" && eventType === "Start") {
        const additionalWorkCount = vehicle.stages.filter(stage => 
          stage.stageName.startsWith("Additional Work Job Approval") && stage.eventType === "Start"
        ).length;
        stageName = `Additional Work Job Approval ${additionalWorkCount + 1}`;
      }

      if (stageName === "Ready for Washing" && eventType === "Start") {
        const hasJobCardCreation = vehicle.stages.some(stage => 
          stage.stageName === "Job Card Creation + Customer Approval" && stage.eventType === "Start"
        );
        
        if (!hasJobCardCreation) {
          console.log(`⚠️ Alert: ${formattedVehicleNumber} attempted Ready for Washing without Job Card Creation`);
          const warningMessage = `Warning: You should have started Job Card Creation + Customer Approval first. Alert has been sent to admin.`;
          
          vehicle.stages.push({
            stageName,
            role,
            eventType,
            timestamp: new Date(),
            performedBy: {
              userId: req.user._id,
              userName: req.user.name
            },
            warning: warningMessage
          });
          
          await vehicle.save();
          return res.status(200).json({
            success: true,
            message: warningMessage,
            vehicle
          });
        }

        const existingWashingStage = vehicle.stages.find(stage => 
          stage.stageName === "Ready for Washing" && stage.eventType === "Start"
        );
        
        if (existingWashingStage && !vehicle.stages.some(stage => 
          stage.stageName === "Ready for Washing" && stage.eventType === "End"
        )) {
          return res.status(400).json({
            success: false,
            message: "Ready for Washing has already been started and not yet ended."
          });
        }
      }
    }

    // JOB CONTROLLER LOGIC - UPDATED WITH ALL THREE STAGES
    if (role === "Job Controller") {
      // 1. Job Card Received + Bay Allocation
      if (stageName === "Job Card Received + Bay Allocation" && eventType === "Start") {
        const lastJobCardReceived = vehicle.stages
          .filter(stage => stage.stageName.startsWith("Job Card Received + Bay Allocation") && stage.eventType === "Start")
          .sort((a, b) => b.timestamp - a.timestamp)[0];
        
        // 30-minute cooldown check
        if (lastJobCardReceived && (new Date() - new Date(lastJobCardReceived.timestamp)) / 60000 < 10) {
          return res.status(400).json({
            success: false,
            message: "Job Card Received + Bay Allocation cannot be restarted within 10 minutes."
          });
        }

        // Sequential numbering
        const jobCardCount = vehicle.stages.filter(stage => 
          stage.stageName.startsWith("Job Card Received + Bay Allocation") && stage.eventType === "Start"
        ).length;
        stageName = `Job Card Received + Bay Allocation ${jobCardCount + 1}`;
      }

      // 2. Job Card Received (by Technician) - After Final Completion of work
      if (stageName === "Job Card Received (by Technician)" && eventType === "Start") {
        
        

        // Check if already received
        const alreadyReceived = vehicle.stages.some(stage => 
          stage.stageName === "Job Card Received (by Technician)" && stage.eventType === "Start"
        );
        
        if (alreadyReceived) {
          return res.status(400).json({
            success: false,
            message: "Job card already received from Technician in this session."
          });
        }
      }

      // 3. Job Card Received (by FI) - After Completion of Final Inspection
      if (stageName === "Job Card Received (by FI)" && eventType === "Start") {

        // Check if already received
        const alreadyReceived = vehicle.stages.some(stage => 
          stage.stageName === "Job Card Received (by FI)" && stage.eventType === "Start"
        );
        
        if (alreadyReceived) {
          return res.status(400).json({
            success: false,
            message: "Job card already received from Final Inspector in this session."
          });
        }
      }
    }

    // TIME RESTRICTIONS FOR CERTAIN STAGES
   const restrictedStages = ["Interactive Bay", "Washing", "Final Inspection", "Creation of Parts Estimate"];
    if (restrictedStages.includes(stageName) && eventType === "End") {
      const starts = vehicle.stages
        .filter(stage => stage.stageName === stageName && stage.eventType === "Start")
        .sort((a, b) => b.timestamp - a.timestamp);

      const ends = vehicle.stages
        .filter(stage => stage.stageName === stageName && stage.eventType === "End")
        .sort((a, b) => b.timestamp - a.timestamp);

      let lastUnendedStart = null;
      for (const start of starts) {
        if (!ends.some(end => end.timestamp > start.timestamp)) {
          lastUnendedStart = start;
          break;
        }
      }

      if (lastUnendedStart && (new Date() - new Date(lastUnendedStart.timestamp)) / 60000 < 1) {
        return res.status(400).json({
          success: false,
          message: `${stageName} cannot be ended within 10 minutes of starting.`
        });
      }
    }

    // Add the new stage to the existing vehicle document
    const newStage = {
      stageName,
      role,
      eventType,
      timestamp: new Date(),
      performedBy: {
        userId: req.user._id,
        userName: req.user.name
      },
      inKM: role === "Security Guard" ? inKM : null,
      outKM: role === "Security Guard" ? outKM : null,
      inDriver: role === "Security Guard" ? inDriver : null,
      outDriver: role === "Security Guard" ? outDriver : null,
      workType: role === "Bay Technician" ? workType || null : null,
      bayNumber: role === "Bay Technician" ? bayNumber || null : null,
    };

    vehicle.stages.push(newStage);
    await vehicle.save();

    return res.status(200).json({
      success: true,
      message: `${stageName} updated successfully.`,
      vehicle
    });

  } catch (error) {
    console.error("❌ Error in /vehicle-check:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message
    });
  }
});

// GET /api/bay-work-status
router.get("/bay-work-status", authMiddleware, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find work in progress
    const inProgress = await Vehicle.aggregate([
      { $unwind: "$stages" },
      {
        $match: {
          "stages.role": "Bay Technician",
          "stages.eventType": "Start",
          "stages.performedBy.userId": userId,
          exitTime: null,
        },
      },
      {
        $group: {
          _id: "$_id",
          vehicleNumber: { $first: "$vehicleNumber" },
          workType: { $first: "$stages.workType" },
          bayNumber: { $first: "$stages.bayNumber" },
        },
      },
      { $project: { _id: 0, vehicleNumber: 1, workType: 1, bayNumber: 1 } },
    ]);

    // Find paused work
    const paused = await Vehicle.aggregate([
      { $unwind: "$stages" },
      {
        $match: {
          "stages.role": "Bay Technician",
          "stages.eventType": "Pause",
          "stages.performedBy.userId": userId,
          exitTime: null,
        },
      },
      {
        $lookup: {
          from: "vehicles",
          let: { vehicleId: "$_id", pauseTimestamp: "$stages.timestamp" },
          pipeline: [
            { $match: { _id: "$$vehicleId" } },
            { $unwind: "$stages" },
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$stages.role", "Bay Technician"] },
                    { $in: ["$stages.eventType", ["Resume", "End"]] },
                    { $gt: ["$stages.timestamp", "$$pauseTimestamp"] },
                  ],
                },
              },
            },
          ],
          as: "nextStages",
        },
      },
      { $match: { "nextStages": { $size: 0 } } },
      {
        $group: {
          _id: "$_id",
          vehicleNumber: { $first: "$vehicleNumber" },
          workType: { $first: "$stages.workType" },
          bayNumber: { $first: "$stages.bayNumber" },
        },
      },
      { $project: { _id: 0, vehicleNumber: 1, workType: 1, bayNumber: 1 } },
    ]);
    // Find ended work - Adjust date range as needed
    const ended = await Vehicle.aggregate([
      { $unwind: "$stages" },
      {
        $match: {
          "stages.role": "Bay Technician",
          "stages.eventType": "End",
          "stages.performedBy.userId": userId,
          "stages.timestamp": { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
          exitTime: null
        },
      },
      {
        $group: {
          _id: "$_id",
          vehicleNumber: { $first: "$vehicleNumber" },
          workType: { $first: "$stages.workType" },
          bayNumber: { $first: "$stages.bayNumber" },
        },
      },
      { $project: { _id: 0, vehicleNumber: 1, workType: 1, bayNumber: 1 } },
    ]);

    // Respond with the results
    res.status(200).json({
      success: true,
      inProgress: inProgress,
      paused: paused,
      ended: ended,
    });
  } catch (error) {
    console.error("❌ Error fetching bay work status:", error);
    res.status(500).json({ success: false, message: "Failed to fetch bay work status", error: error.message });
  }
});


// ✅ 2️⃣ GET: Fetch All Vehicles & Their Full Journey
router.get("/vehicles", async (req, res) => {
  try {
    const vehicles = await Vehicle.find().sort({ entryTime: -1 });

    if (vehicles.length === 0) {
      return res.status(404).json({ success: false, message: "No vehicles found." });
    }

    return res.status(200).json({ success: true, vehicles });
  } catch (error) {
    console.error("❌ Error in GET /vehicles:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});


router.get("/vehicles/:vehicleNumber", async (req, res) => {
  try {
    const { vehicleNumber } = req.params;
    const formattedVehicleNumber = vehicleNumber.trim().toUpperCase();

    const vehicle = await Vehicle.findOne({ vehicleNumber: formattedVehicleNumber }).sort({ entryTime: -1 });

    if (!vehicle) {
      return res.status(404).json({ success: false, message: "Vehicle not found." });
    }

    return res.status(200).json({ success: true, vehicle });
  } catch (error) {
    console.error("❌ Error in GET /vehicles/:vehicleNumber:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});


// Fetch vehicles based on the user (user-specific history)
router.get("/user-vehicles", authMiddleware, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({
      "stages.performedBy.userId": req.user._id
    }).sort({ entryTime: -1 });

    if (vehicles.length === 0) {
      return res.status(404).json({ success: false, message: "No vehicles found for the user." });
    }

    return res.status(200).json({ success: true, vehicles });
  } catch (error) {
    console.error("❌ Error in GET /user-vehicles:", error);
    res.status(500).json({ success: false, message: "Server error", error });
  }
});

module.exports = router;