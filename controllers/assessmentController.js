const User = require('../models/userSchema');
const whatsappService = require('../services/whatsappService');

// Helper: Generates an authentic certification ID matching your AFK prefix standard
const generateCertificateId = () => {
  const randomSuffix = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `AFK-${randomSuffix}`;
};

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
      // Returns structure strictly mapped to backendResult in Vue proceedRegistration
      return res.status(200).json({
        isDuplicate: true,
        data: {
          _id: existingUser._id,
          certificateId: existingUser.certificateId || 'AFK-GEN',
          qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${existingUser._id}`,
          enrollmentStatus: existingUser.enrollmentStatus || 'PROMO_CLAIMED',
          promotionCode: existingUser.promotionCode || 'PRACTICE25'
        }
      });
    }

    return res.status(200).json({ isDuplicate: false });
  } catch (err) {
    console.error('Error checking duplicate:', err.message);
    res.status(500).json({ isDuplicate: false, error: err.message });
  }
};

// 2. Save Assessment & Issue Certification
exports.saveAssessment = async (req, res) => {
  try {
    const body = req.body;
    const cleanPhone = (body.parentPhone || '').replace(/\D/g, '');
    const cleanEmail = (body.parentEmail || '').trim().toLowerCase();

    // Query to avoid E11000 duplicate index conflicts
    const queryConditions = [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }];
    if (cleanEmail) {
      queryConditions.push({ email: cleanEmail });
    }

    const certId = generateCertificateId();
    const promoCode = 'BIGOFFER50';
    const status = 'PROMO_CLAIMED';

    const record = await User.findOneAndUpdate(
      { $or: queryConditions },
      {
        $set: {
          name: `${body.studentFirstName} ${body.studentSurname || ''}`.trim(),
          phone: cleanPhone,
          ...(cleanEmail ? { email: cleanEmail } : {}),
          postcode: body.parentPostcode,
          assessmentScores: body.scores,
          certificateId: certId,
          promotionCode: promoCode,
          enrollmentStatus: status,
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

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${record._id}`;

    // Dispatch WhatsApp confirmation to parent
    if (cleanPhone) {
      try {
        const textBody = 
          `🎉 *Congratulations!* ${body.studentFirstName} has successfully completed the Abacus Assessment!\n\n` +
          `📜 *Certificate ID:* ${certId}\n` +
          `🎁 *Special Promo Code:* ${promoCode}\n\n` +
          `Your official digital certificate is displayed on your screen. You can scan or save your QR verification directly.\n\n` +
          `Our team in Bushey/Harrow will review your child's numeracy evaluation shortly.`;

        if (typeof whatsappService.sendMessage === 'function') {
          await whatsappService.sendMessage(cleanPhone, textBody);
        } else if (typeof whatsappService.sendTextMessage === 'function') {
          await whatsappService.sendTextMessage(cleanPhone, textBody);
        }
      } catch (waErr) {
        console.error('Failed to send WhatsApp confirmation:', waErr.message);
      }
    }

    // Exact response structure consumed by submitLeadData in your Vue app
    return res.status(200).json({
      success: true,
      data: {
        _id: record._id,
        certificateId: certId,
        enrollmentStatus: status,
        promotionCode: promoCode
      },
      qrCodeUrl
    });
  } catch (err) {
    console.error('Error saving assessment:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// 3. Callback Request Handler
exports.requestCallback = async (req, res) => {
  try {
    const { recordId, parentPhone, parentEmail } = req.body;
    console.log(`📞 Callback requested for ${parentPhone || parentEmail || recordId}`);
    return res.status(200).json({ success: true, message: 'Callback request registered.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};