const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    wamid: { type: String, unique: true, sparse: true },
    phone: { type: String, required: true, index: true },
    senderName: { type: String, default: '' },
    direction: { type: String, enum: ['inbound', 'outbound'], required: true },
    text: { type: String, required: true },
    status: { 
      type: String, 
      enum: ['received', 'sent', 'delivered', 'read', 'failed'], 
      default: 'received' 
    },
    rawPayload: { type: Object }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);