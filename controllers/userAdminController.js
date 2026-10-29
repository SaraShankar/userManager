// Local model imports from userManager/models directory
const User = require('../models/userSchema');
const PreUser = require('../models/preUserSchema');
const Message = require('../models/messageSchema');
const { sendTemplateMessage, sendTextMessage } = require('../services/whatsappService');

// --- User CRUD Operations ---

// 1. Get all users for the management table
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    return res.status(200).json(users);
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error fetching users', error: err.message });
  }
};

// 2. Create a new user (default password 'abacusforkids')
exports.createUser = async (req, res) => {
  try {
    const { name, email, phone, phone2, level, teacher, classDay, password } = req.body;

    const newUser = new User({
      name,
      email,
      phone,
      phone2,
      level,
      teacher,
      classDay,
      password: password || 'abacusforkids'
    });

    await newUser.save();
    
    const userObj = newUser.toObject();
    delete userObj.password;

    return res.status(201).json(userObj);
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Error creating user', error: err.message });
  }
};

// 3. Update existing user details
exports.updateUser = async (req, res) => {
  try {
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { returnDocument: 'after', runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json(updatedUser);
  } catch (err) {
    return res.status(400).json({ success: false, message: 'Error updating user', error: err.message });
  }
};

// 4. Delete user record
exports.deleteUser = async (req, res) => {
  try {
    const deletedUser = await User.findByIdAndDelete(req.params.id);

    if (!deletedUser) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.status(200).json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: 'Error deleting user', error: err.message });
  }
};

// --- WhatsApp Dispatch & Broadcast Logic ---

// 5. Fetch all active users who opted into WhatsApp communications
exports.getWhatsAppUsers = async (req, res) => {
  try {
    const users = await User.find({ isActive: true, 'whatsappConsent.optIn': true }).select('-password');
    return res.status(200).json({ success: true, count: users.length, data: users });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 6. Send a template message to a single user
exports.sendUserWhatsApp = async (req, res) => {
  const { userId, templateName = 'hello_world', languageCode = 'en_US', mediaUrl, mediaType, fileName } = req.body;
  
  try {
    const user = await User.findById(userId);
    if (!user || !user.phone) {
      return res.status(400).json({ success: false, error: 'User or phone number missing' });
    }

    if (!user.whatsappConsent?.optIn) {
      return res.status(403).json({ success: false, error: 'User has not opted in to WhatsApp messages' });
    }

    // Standard static hello_world requires no body parameters
    const parameters = templateName === 'hello_world' ? [] : [user.name || 'Student'];

    const waData = await sendTemplateMessage({
      recipientPhone: user.phone,
      templateName,
      languageCode,
      mediaUrl,
      mediaType,
      fileName,
      parameters
    });

    const cleanPhone = String(user.phone).replace(/\D/g, '');
    const wamid = waData?.messages?.[0]?.id;

    // Persist outbound record in MongoDB
    await Message.create({
      wamid,
      phone: cleanPhone,
      senderName: user.name || '',
      direction: 'outbound',
      text: `[Template: ${templateName}]`,
      status: 'sent'
    });

    return res.status(200).json({ success: true, waResponse: waData });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: err.response?.data?.error?.message || err.message 
    });
  }
};

// 7. Batch WhatsApp Dispatch Controller
exports.sendBatchWhatsApp = async (req, res) => {
  const { recipientIds, templateName = 'hello_world', languageCode = 'en_US', mediaUrl, mediaType, fileName } = req.body;

  if (!recipientIds || !Array.isArray(recipientIds) || recipientIds.length === 0) {
    return res.status(400).json({ success: false, error: 'No recipient user IDs provided' });
  }

  try {
    const users = await User.find({ _id: { $in: recipientIds } });
    const successful = [];
    const failures = [];

    for (const user of users) {
      const displayName = user.name || user.email || 'User';

      // Opt-in safety check
      if (!user.whatsappConsent?.optIn) {
        failures.push(`${displayName}: User has not opted in to WhatsApp messages`);
        continue;
      }

      if (!user.phone) {
        failures.push(`${displayName}: Phone number missing`);
        continue;
      }

      try {
        const parameters = templateName === 'hello_world' ? [] : [user.name || 'Student'];

        const waData = await sendTemplateMessage({
          recipientPhone: user.phone,
          templateName,
          languageCode,
          mediaUrl,
          mediaType,
          fileName,
          parameters
        });

        const cleanPhone = String(user.phone).replace(/\D/g, '');
        const wamid = waData?.messages?.[0]?.id;

        // Persist batch outbound template dispatch into Message collection
        await Message.create({
          wamid,
          phone: cleanPhone,
          senderName: user.name || '',
          direction: 'outbound',
          text: `[Template: ${templateName}]`,
          status: 'sent'
        });

        successful.push({
          userId: user._id,
          name: displayName,
          phone: user.phone,
          wamid
        });
      } catch (err) {
        const errorMessage = err.response?.data?.error?.message || err.message;
        failures.push(`${displayName}: ${errorMessage}`);
      }

      // Small throttling delay to maintain API quota compliance
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    return res.status(200).json({
      success: true,
      totalProcessed: users.length,
      successCount: successful.length,
      failedCount: failures.length,
      failures,
      successful
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// --- WhatsApp 2-Way Inbox Logic ---

// 8. Fetch active WhatsApp conversations grouped by phone number
exports.getWhatsAppConversations = async (req, res) => {
  try {
    const conversations = await Message.aggregate([
      { $sort: { createdAt: -1 } },       {$group: {
          _id: '$phone',
          phone: { $first: '$phone' },
          senderName: { $first: '$senderName' },
          lastMessage: { $first: '$text' },
          lastTimestamp: { $first: '$createdAt' },
          unreadCount: {
            $sum: {$cond: [
                { $and: [{$eq: ['$direction', 'inbound'] }, {$eq: ['$status', 'received'] }] },                 1,                 0               ]             }           }         }       },       {$sort: { lastTimestamp: -1 } }
    ]);

    return res.status(200).json(conversations);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 9. Fetch message thread for a specific phone number
exports.getPhoneMessages = async (req, res) => {
  try {
    const { phone } = req.params;
    const cleanPhone = String(phone).replace(/\D/g, '');

    const messages = await Message.find({ phone: cleanPhone }).sort({ createdAt: 1 });

    // Mark inbound unread messages as read
    await Message.updateMany(
      { phone: cleanPhone, direction: 'inbound', status: 'received' },
      { $set: { status: 'read' } }
    );

    return res.status(200).json(messages);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
};

// 10. Send direct text reply from Inbox UI
exports.sendReplyWhatsApp = async (req, res) => {
  try {
    const { phone, text } = req.body;
    if (!phone || !text) {
      return res.status(400).json({ success: false, error: 'Phone and message text are required' });
    }

    const cleanPhone = String(phone).replace(/\D/g, '');
    const waData = await sendTextMessage(cleanPhone, text);
    const wamid = waData?.messages?.[0]?.id;

    // Lookup user name for chat thread consistency if available
    const dbUser = await User.findOne({ 
      $or: [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }] 
    });

    const savedMsg = await Message.create({
      wamid,
      phone: cleanPhone,
      senderName: dbUser?.name || cleanPhone,
      direction: 'outbound',
      text,
      status: 'sent'
    });

    return res.status(200).json({ success: true, message: savedMsg });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: err.response?.data?.error?.message || err.message 
    });
  }
};