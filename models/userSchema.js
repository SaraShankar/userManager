const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Schema for tracking record breaks per belt
const recordBreakSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    belt: { type: Number, required: true },
    duration: { type: Number, required: true },
    sCount: { type: Number, required: true },
    points: { type: Number, required: true },
    speed: { type: Number, required: true }
  },
  { _id: false }
);

// Main User Schema (Unifying Active Students & New WhatsApp/Meta Leads)
const userSchema = new mongoose.Schema(
  {
    // Identification & Authentication
    name: { 
      type: String, 
      required: true, 
      trim: true 
    },
    phone: { 
      type: String, 
      required: true, 
      unique: true, 
      index: true,
      trim: true 
    },
    phone2: { 
      type: String, 
      default: null,
      trim: true 
    },
    email: { 
      type: String, 
      unique: true, 
      sparse: true, // Crucial: Allows multiple leads without an email
      lowercase: true, 
      trim: true,
      default: undefined // Ensures empty fields aren't stored as null
    },
    password: { 
      type: String, 
      default: 'abacusforkids' 
    },

    // Lifecycle Status & Lead Attribution (For Reporting & Segmentation)
    status: {
      type: String,
      enum: ['lead', 'trial_booked', 'registered', 'inactive'],
      default: 'lead',
      index: true
    },
    source: {
      type: String,
      enum: ['WHATSAPP_INBOUND', 'META_ADS', 'WEB_FORM', 'MANUAL'],
      default: 'WHATSAPP_INBOUND',
      index: true
    },
    registeredAt: { 
      type: Date, 
      default: null 
    },
    leadgenId: { 
      type: String, 
      default: null 
    },
    formId: { 
      type: String, 
      default: null 
    },

    // Academic & Classroom Details (Populated for Enrolled Students)
    level: { 
      type: Number, 
      default: 1 
    },
    teacher: { 
      type: String, 
      default: null 
    },
    classDay: { 
      type: String, 
      default: null 
    },
    
    // Status flag to soft-archive active vs inactive/completed students
    isActive: {
      type: Boolean,
      default: true,
      index: true
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
        enum: ['web_form', 'in_app', 'qr_code', 'inbound_msg', null], 
        default: null 
      },
      optOutDate: { 
        type: Date, 
        default: null 
      },
      optOutReason: { 
        type: String, 
        default: null // Stores triggers like 'STOP', 'UNSUBSCRIBE', or manual admin action
      }
    },
    
    // Reference to the User's Personal Best Effort document
    bestEffortId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Effort',
      default: null
    },

    recordBreak: [recordBreakSchema],
    
    lastDateWorked: { 
      type: Date, 
      default: null 
    },

    beltsCollected: [{ 
      type: Number, 
      default: []
    }],
    
    beltsOrder: [{ 
      type: Number 
    }],

    // Password Reset / Verification Fields
    resetCode: { 
      type: String, 
      default: null 
    },
    resetCodeExpires: { 
      type: Date, 
      default: null 
    }
  }, 
  { timestamps: true }
);

// Async pre-save hook for password hashing
userSchema.pre('save', async function () {
  if (!this.isModified('password') || !this.password) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Helper method to compare passwords during login
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.models.User || mongoose.model('User', userSchema);