const User = require('../models/userSchema');
const whatsappService = require('../services/whatsappService');

// Helper: Generates a short, professional certificate reference (e.g., AFK-2026-8A3F)
const generateCertificateId = () => {
  const year = new Date().getFullYear();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `AFK-${year}-${randomSuffix}`;
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

// 2. Save Assessment, Issue Certificate & Send WhatsApp Confirmation
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

    // Generate certificate metadata
    const certId = generateCertificateId();
    const issueDate = new Date();

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
          certificateIssuedAt: issueDate,
          updatedAt: issueDate
        },
        $setOnInsert: {
          createdAt: issueDate,
          source: 'ASSESSMENT_APP',
          status: 'lead'
        }
      },
      { upsert: true, returnDocument: 'after' }
    );

    // Dynamic QR & Certificate URLs pointing to this record
    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${record._id}`;
    const certificateUrl = `https://abacusforkids.co.uk/certificate?id=${record._id}&cert=${certId}`;

    // Send WhatsApp Cloud API confirmation message with certificate access
    if (cleanPhone) {
      try {
        const textBody = 
          `🎉 *Congratulations!* ${body.studentFirstName} has successfully completed the Abacus Assessment!\n\n` +
          `📜 *Certificate ID:* ${certId}\n` +
          `🔗 *View Official Certificate:* ${certificateUrl}\n\n` +
          `Our team in Bushey/Harrow will review the scores and follow up with your child's personalized evaluation shortly.`;
        
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
      certificateId: certId,
      certificateUrl,
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
    const { recordId, parentPhone } = req.body;
    console.log(`📞 Callback requested for ${parentPhone || recordId}`);
    return res.status(200).json({ success: true, message: 'Callback request registered.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};