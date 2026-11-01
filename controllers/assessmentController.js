const axios = require('axios');
const User = require('../models/userSchema');

// Replace or ensure you have an Assessment model or use User model
const WHATSAPP_PHONE_ID = '1443484902172789';
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN || process.env.META_ACCESS_TOKEN;

// 1. Check Duplicate Handler
exports.checkDuplicate = async (req, res) => {
  try {
    const { parentPhone, studentDob } = req.body;
    const cleanPhone = (parentPhone || '').replace(/\D/g, '');

    const existingUser = await User.findOne({
      $or: [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }],
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

    // Upsert or save student assessment data into MongoDB
    const record = await User.findOneAndUpdate(
      { $or: [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }] },
      {
        $set: {
          name: `${body.studentFirstName} ${body.studentSurname || ''}`.trim(),
          phone: cleanPhone,
          email: body.parentEmail,
          postcode: body.parentPostcode,
          assessmentScores: body.scores,
          updatedAt: new Date()
        },
        $setOnInsert: {
          createdAt: new Date(),
          source: 'ASSESSMENT_APP'
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Send WhatsApp Cloud API confirmation message
    if (cleanPhone && WHATSAPP_TOKEN) {
      try {
        await axios.post(
          `https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_ID}/messages`,
          {
            messaging_product: 'whatsapp',
            to: cleanPhone,
            type: 'text',
            text: {
              body: `🎉 Congratulations! ${body.studentFirstName} has completed the Abacus Assessment!\n\nOur team in Bushey/Harrow will review the assessment scores and follow up with your report shortly.`
            }
          },
          {
            headers: {
              Authorization: `Bearer ${WHATSAPP_TOKEN}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (waErr) {
        console.error('Failed to send WhatsApp confirmation:', waErr.response?.data || waErr.message);
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