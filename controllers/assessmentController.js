const User = require('../models/userSchema');
const whatsappService = require('../services/whatsappService');

// 1. Check Duplicate Handler
exports.checkDuplicate = async (req, res) => {
  try {
    const { parentPhone, studentDob } = req.body;
    const cleanPhone = (parentPhone || '').replace(/\D/g, '');

    const existingUser = await User.findOne({
      $or: [
        { phone: cleanPhone },
        { phone: `+${cleanPhone}` }
      ],
      ...(studentDob ? { 'student.dob': studentDob } : {})
    });

    if (existingUser) {
      return res.status(200).json({
        isDuplicate: true,
        data: existingUser
      });
    }

    return res.status(200).json({ isDuplicate: false });
  } catch (err) {
    console.error('Error checking duplicate:', err.message);
    res.status(500).json({ isDuplicate: false, error: err.message });
  }
};

// 2. Save Assessment & Send WhatsApp Confirmation
exports.saveAssessment = async (req, res) => {
  try {
    const body = req.body;
    const cleanPhone = (body.parentPhone || '').replace(/\D/g, '');
    const cleanEmail = (body.parentEmail || '').trim().toLowerCase();

    // Query by either phone OR email to prevent E11000 duplicate key conflicts
    const queryConditions = [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }];
    if (cleanEmail) {
      queryConditions.push({ email: cleanEmail });
    }

    const record = await User.findOneAndUpdate(
      { $or: queryConditions },
      {
        $set: {
          name: `${body.studentFirstName} ${body.studentSurname || ''}`.trim(),
          phone: cleanPhone,
          ...(cleanEmail ? { email: cleanEmail } : {}),
          postcode: body.parentPostcode,
          assessmentScores: body.scores,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date(),
          source: 'ASSESSMENT_APP',
          status: 'lead'
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Send WhatsApp Cloud API confirmation message via your service helper
    if (cleanPhone) {
      try {
        const textBody = `🎉 Congratulations! ${body.studentFirstName} has completed the Abacus Assessment!\n\nOur team in Bushey/Harrow will review the assessment scores and follow up with your report shortly.`;
        
        if (typeof whatsappService.sendMessage === 'function') {
          await whatsappService.sendMessage(cleanPhone, textBody);
        } else if (typeof whatsappService.sendTextMessage === 'function') {
          await whatsappService.sendTextMessage(cleanPhone, textBody);
        }
      } catch (waErr) {
        console.error('Failed to send WhatsApp confirmation:', waErr.message);
      }
    }

    return res.status(200).json({
      success: true,
      data: record,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${record._id}`
    });
  } catch (err) {
    console.error('Error saving assessment:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// 3. Callback Request Handler
exports.requestCallback = async (req, res) => {
  try {
    const { recordId, parentPhone } = req.body;
    console.log(`📞 Callback requested for ${parentPhone || recordId}`);
    return res.status(200).json({ success: true, message: 'Callback request registered.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};