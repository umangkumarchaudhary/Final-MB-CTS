const mongoose = require("mongoose");

const stageSchema = new mongoose.Schema({
  stageName: { type: String, required: true },
  role: { type: String, required: true },
  eventType: { type: String, enum: ["Start", "End","Pause","Resume"], required: true },
  timestamp: { type: Date, default: Date.now },
  performedBy: { 
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // Stores the User ID
    userName: { type: String, required: true } // Stores the User's Name
  },
  inKM: { type: Number, default: null },
  outKM: { type: Number, default: null },
  inDriver: { type: String, default: null },
  outDriver: { type: String, default: null },
  workType: { 
    type: String, 
    enum: ["PM", "GR", "Body and Paint", "Diagnosis", 'PMGR', 'PMGR + Body&Paint', 'GR+ Body & Paint', 'PM+ Body and Paint'], 
    default: null 
  },
  bayNumber: { 
    type: Number, 
    min: 1, 
    max: 15, 
    default: null 
  }
});

const vehicleSchema = new mongoose.Schema({
  vehicleNumber: { type: String, required: true, unique: false },
  entryTime: { type: Date, default: Date.now },
  exitTime: { type: Date, default: null },
  stages: [stageSchema]
});

const Vehicle = mongoose.model("Vehicle", vehicleSchema);
module.exports = Vehicle;
