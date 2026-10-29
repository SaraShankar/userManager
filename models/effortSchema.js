// models/effortSchema.js
const mongoose = require('mongoose');

// Sub-schema for individual belt attempt details
const effortDetailSchema = new mongoose.Schema({
  beltId: { type: Number, required: true },
  completed: { type: Boolean, required: true, default: false },
  mistakes: { type: Number, required: true, default: 0 },
  speed: { type: Number, required: true },       // speed calculation metric
  duration: { type: Number, required: true },    // duration per belt session (in seconds or mins)
  points: { type: Number, required: true, default: 0 }
}, { _id: false });

const effortSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  date: { type: Date, default: Date.now },
  attempt: { type: Number, required: true },     // Attempt number for the day/session
  details: [effortDetailSchema],                 // Array of belt performance objects
  score: { type: Number, required: true, default: 0 }, // Overall calculated attempt score
  duration: { type: Number, required: true }     // Total duration spent on the entire attempt
}, { timestamps: true });

module.exports = mongoose.model('Effort', effortSchema);