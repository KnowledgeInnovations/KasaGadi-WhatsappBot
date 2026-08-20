import mongoose from "mongoose";

const messageSchema = new mongoose.Schema({
  role:      { type: String, enum: ["user", "assistant"], required: true },
  content:   { type: String, required: true },
  timestamp: { type: Number, default: Date.now },
  mediaUrl:  { type: String, default: null },
}, { _id: false });

const profileSchema = new mongoose.Schema({
  name:       String,
  email:      String,
  phone:      String,
  registered: { type: Boolean, default: false },
  memberId:   String,
}, { _id: false });

const sessionSchema = new mongoose.Schema({
  userId:        { type: String, required: true, unique: true, index: true },
  history:       [messageSchema],
  state:         { type: String, default: "GREETING" },
  profile:       { type: profileSchema, default: () => ({}) },
  lastActivity:  { type: Number, default: Date.now },
  metadata:      { type: mongoose.Schema.Types.Mixed, default: {} },
}, {
  timestamps: true,
});

// Index for cleanup queries
sessionSchema.index({ lastActivity: 1 });

export default mongoose.model("Session", sessionSchema);
