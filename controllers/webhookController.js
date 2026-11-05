const Message = require('../models/messageSchema');
const User = require('../models/userSchema');
const metaAdsService = require('../services/metaAdsService');
const { askFaqAssistant } = require('../services/faqRagService');
const { sendWhatsAppMessage } = require('../services/whatsappService');

const ADMIN_FORWARD_PHONE = process.env.ADMIN_PHONE_NUMBER || '447943611154';
const APP_BASE_URL =
  process.env.APP_BASE_URL ||
  process.env.PUBLIC_URL ||
  'https://usermanager-production-a71a.up.railway.app';

/**
 * Meta Webhook Verification (GET)
 */
exports.verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const VERIFY_TOKEN =
    process.env.META_WA_VERIFY_TOKEN ||
    process.env.WEBHOOK_VERIFY_TOKEN ||
    'eynko_webhook_secret_2026';

  if (mode && token) {
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('✅ WEBHOOK VERIFIED SUCCESSFULLY BY META');
      return res.status(200).send(challenge);
    }
    console.error('❌ WEBHOOK VERIFICATION FAILED: Token Mismatch');
    return res.sendStatus(403);
  }

  return res.sendStatus(400);
};

/**
 * Incoming Webhook Receiver (POST)
 */
exports.handleWebhook = async (req, res) => {
  // Acknowledge receipt to Meta immediately (prevents duplicate retries/timeouts)
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;
    if (!body?.object) return;

    // =========================================================================
    // A. PROCESS WHATSAPP BUSINESS EVENTS
    // =========================================================================
    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change?.value;
          if (!value) continue;

          // 1. Inbound Messages
          if (Array.isArray(value.messages) && value.messages.length > 0) {
            const message = value.messages[0];
            const contact = value.contacts?.[0];

            const rawPhone = message.from || '';
            const cleanPhone = rawPhone.replace(/\D/g, '');
            const wamid = message.id;

            if (!cleanPhone) continue;

            // Resolve existing user in MongoDB
            let dbUser = await User.findOne({
              $or: [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }]
            });

            // Extract real parent name (Profile Name -> Existing DB Name -> Fallback)
            const profileName = (contact?.profile?.name || '').trim();
            let parentDisplayName = 'Parent';

            if (dbUser?.name && dbUser.name !== cleanPhone) {
              parentDisplayName = dbUser.name;
            } else if (profileName && profileName !== cleanPhone) {
              parentDisplayName = profileName;
            }

            // Upsert / update User record with the resolved identity
            if (!dbUser || (profileName && dbUser.name === cleanPhone)) {
              dbUser = await User.findOneAndUpdate(
                { $or: [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }] },
                {
                  $set: {
                    name: parentDisplayName,
                    phone: cleanPhone,
                    updatedAt: new Date()
                  },
                  $setOnInsert: {
                    source: 'WHATSAPP_INBOUND',
                    createdAt: new Date()
                  }
                },
                { upsert: true, returnDocument: 'after' }
              );
            }

            // Extract message content across all interactive types
            let messageText = '';
            switch (message.type) {
              case 'text':
                messageText = message.text?.body || '';
                break;
              case 'button':
                messageText = message.button?.text || '';
                break;
              case 'interactive':
                messageText =
                  message.interactive?.button_reply?.title ||
                  message.interactive?.list_reply?.title ||
                  '[Interactive Response]';
                break;
              default:
                messageText = `[Received ${message.type}]`;
            }

            // Log inbound message into MongoDB
            await Message.findOneAndUpdate(
              { wamid },
              {
                $setOnInsert: {
                  wamid,
                  phone: cleanPhone,
                  senderName: parentDisplayName,
                  direction: 'inbound',
                  text: messageText,
                  status: 'received',
                  rawPayload: message,
                  timestamp: new Date()
                }
              },
              { upsert: true, returnDocument: 'after' }
            );

            console.log(`📥 Incoming WhatsApp from ${cleanPhone} (${parentDisplayName}): "${messageText}"`);

            // Prevent loops: Ignore admin number messages from triggering the AI Copilot
            if (cleanPhone === ADMIN_FORWARD_PHONE) {
              console.log('Admin number message received. Skipping bot auto-reply.');
              continue;
            }

            // --- Unified 3-Tier RAG Execution ---
            if (message.type === 'text' && messageText.trim().length >= 2) {
              try {
                // Pass user context for dynamic assessment URL generation
                const ragResult = await askFaqAssistant(messageText, {
                  name: parentDisplayName !== 'Parent' ? parentDisplayName : '',
                  phone: cleanPhone
                });

                const { tier, answer, score, matchedFaqId } = ragResult;
                console.log(`🎯 RAG Evaluated: Tier=${tier}, Score=${score?.toFixed(4)}, FAQ=${matchedFaqId}`);

                // TIER 1 & TIER 2: HIGH (>= 0.60) or BORDERLINE (0.30 - 0.59 with answer)
                if ((tier === 'HIGH' || tier === 'MEDIUM') && answer) {
                  const sendRes = await sendWhatsAppMessage(cleanPhone, answer);
                  const outboundWamid = sendRes?.messages?.[0]?.id || `bot_${Date.now()}`;

                  await Message.create({
                    wamid: outboundWamid,
                    phone: cleanPhone,
                    senderName: parentDisplayName,
                    botPersona: 'Abacus AI Copilot',
                    direction: 'outbound',
                    text: answer,
                    status: 'sent',
                    metadata: {
                      isAutomated: true,
                      botName: 'Abacus AI Copilot',
                      tier,
                      matchedFaqId,
                      confidenceScore: score
                    },
                    timestamp: new Date()
                  });

                  console.log(`🤖 Auto-replied to ${cleanPhone} [Tier: ${tier}, FAQ: ${matchedFaqId}, Score: ${score?.toFixed(4)}]`);
                } 
                // TIER 3: LOW CONFIDENCE (< 0.30) -> Escalation to Dr. Geetha
                else {
                  const fallbackHoldingText =
                    `Thank you for reaching out! Our team has received your inquiry, and Dr. Geetha will personally get back to you shortly.\n\n` +
                    `In the meantime, you can explore our free online assessment or reserve a free trial session directly at your preferred time:\n` +
                    `👉 Assessment: ${APP_BASE_URL}/assessment/?phone=${cleanPhone}&name=${encodeURIComponent(parentDisplayName !== 'Parent' ? parentDisplayName : '')}`;

                  const parentSendRes = await sendWhatsAppMessage(cleanPhone, fallbackHoldingText);
                  const parentWamid = parentSendRes?.messages?.[0]?.id || `bot_fallback_${Date.now()}`;

                  await Message.create({
                    wamid: parentWamid,
                    phone: cleanPhone,
                    senderName: parentDisplayName,
                    botPersona: 'Abacus AI Copilot',
                    direction: 'outbound',
                    text: fallbackHoldingText,
                    status: 'sent',
                    metadata: {
                      isAutomated: true,
                      botName: 'Abacus AI Copilot',
                      escalatedToAdmin: true,
                      confidenceScore: score
                    },
                    timestamp: new Date()
                  });

                  // Forward alert notification to Admin phone
                  const adminAlertText =
                    `🚨 *Unmatched Parent Query Alert*\n\n` +
                    `*From:* ${parentDisplayName} (+${cleanPhone})\n` +
                    `*Query:* "${messageText}"\n` +
                    `*Best Score:* ${score ? score.toFixed(4) : 'N/A'}\n\n` +
                    `Reply directly via WhatsApp: https://wa.me/${cleanPhone}`;

                  const adminSendRes = await sendWhatsAppMessage(ADMIN_FORWARD_PHONE, adminAlertText);
                  const adminWamid = adminSendRes?.messages?.[0]?.id || `admin_alert_${Date.now()}`;

                  await Message.create({
                    wamid: adminWamid,
                    phone: ADMIN_FORWARD_PHONE,
                    senderName: 'Abacus Lead Escalator',
                    botPersona: 'Abacus Lead Escalator',
                    direction: 'outbound',
                    text: adminAlertText,
                    status: 'sent',
                    metadata: {
                      isAlert: true,
                      originatingParentPhone: cleanPhone
                    },
                    timestamp: new Date()
                  });

                  console.log(`🚨 Low confidence query from ${cleanPhone}. Escalated to admin (${ADMIN_FORWARD_PHONE}).`);
                }
              } catch (ragError) {
                console.error(`⚠️ RAG execution failed for ${cleanPhone}:`, ragError.message);
              }
            }
          }

          // 2. Message Status Updates (sent / delivered / read)
          if (Array.isArray(value.statuses) && value.statuses.length > 0) {
            const statusUpdate = value.statuses[0];
            await Message.updateOne(
              { wamid: statusUpdate.id },
              { $set: { status: statusUpdate.status, updatedAt: new Date() } }
            );
          }
        }
      }
      return;
    }

    // =========================================================================
    // B. PROCESS META LEAD ADS EVENTS
    // =========================================================================
    if (body.object === 'page' || body.object === 'ad_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === 'leadgen') {
            const leadgenId = change.value?.leadgen_id;
            const formId = change.value?.form_id;

            console.log(`📥 Received Lead Ads Event (Lead ID: ${leadgenId})`);

            try {
              const leadData = await metaAdsService.getLeadDetails(leadgenId);

              let name = 'Meta Lead';
              let email = '';
              let phone = '';

              if (leadData?.field_data) {
                leadData.field_data.forEach((field) => {
                  const fieldName = (field.name || '').toLowerCase();
                  if (fieldName === 'full_name' || fieldName === 'name') {
                    name = field.values?.[0] || name;
                  }
                  if (fieldName === 'email') {
                    email = (field.values?.[0] || '').trim().toLowerCase();
                  }
                  if (fieldName === 'phone_number' || fieldName === 'phone') {
                    phone = (field.values?.[0] || '').replace(/\D/g, '');
                  }
                });
              }

              if (phone || email) {
                const searchQuery = [];
                if (phone) searchQuery.push({ phone }, { phone: `+${phone}` });
                if (email) searchQuery.push({ email });

                const updatedUser = await User.findOneAndUpdate(
                  { $or: searchQuery },
                  {
                    $set: {
                      name,
                      email,
                      phone,
                      source: 'META_ADS',
                      leadgenId,
                      formId,
                      updatedAt: new Date()
                    }
                  },
                  { upsert: true, returnDocument: 'after' }
                );

                console.log(`✅ Lead synced to MongoDB: ${updatedUser.name} (${updatedUser.phone || updatedUser.email})`);
              }
            } catch (leadError) {
              console.error(`❌ Failed to process Lead ID ${leadgenId}:`, leadError.message);
            }
          }
        }
      }
      return;
    }
  } catch (err) {
    console.error('Webhook Processing Error:', err.message);
  }
};