const mongoose = require('mongoose');

const preUserSchema = new mongoose.Schema({
  stuName: {
    type: String,
    required: true,
    trim: true
  },
  parName: {
    type: String,
    required: true,
    trim: true
  },
  phone1: {
    type: String,
    required: true,
    trim: true
  },
  phone2: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    lowercase: true,
    trim: true,
    default: ''
  },
  dateEnquired: {
    type: Date,
    default: Date.now
  },
  asked: {
    day: { type: String, default: '' },
    time: { type: String, default: '' }
  },
  offered: {
    day: { type: String, default: '' },
    time: { type: String, default: '' }
  },
  isFresh: {
    type: Boolean,
    default: true
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  referred: {
    type: String,
    default: ''
  },
  isLive: {
    type: Boolean,
    default: true
  },

  // WhatsApp Business API Compliance & Consent Tracking
  whatsappConsent: {
    optIn: { 
      type: Boolean, 
      default: false, 
      index: true 
    },
    optInDate: { 
      type: Date, 
      default: null 
    },
    optInSource: { 
      type: String, 
      enum: ['enquiry_form', 'inbound_msg', 'manual_optin', null], 
      default: null 
    },
    optOutDate: { 
      type: Date, 
      default: null 
    },
    optOutReason: { 
      type: String, 
      default: null // Logs 'STOP', 'UNSUBSCRIBE', or admin action
    }
  },

  sibling: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  knowHow: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.PreUser || mongoose.model('PreUser', preUserSchema);