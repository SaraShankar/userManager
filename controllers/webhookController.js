const Message = require('../models/messageSchema');
const User = require('../models/userSchema');
const metaAdsService = require('../services/metaAdsService');
const { handleAutomatedFaqReply } = require('../services/whatsappService');

const ADMIN_FORWARD_PHONE = process.env.ADMIN_PHONE_NUMBER || '447943611154';

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
  res.status(200).send('EVENT_RECEIVED');

  try {
    const body = req.body;

    // --- A. Process WhatsApp Business Events ---
    if (body?.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          const value = change?.value;
          if (!value) continue;

          // 1. Process incoming WhatsApp messages
          if (value.messages && value.messages.length > 0) {
            const message = value.messages[0];
            const contact = value.contacts?.[0];

            const rawPhone = message.from;
            const cleanPhone = rawPhone.replace(/\D/g, '');
            const wamid = message.id;

            // Find user in MongoDB
            const dbUser = await User.findOne({
              $or: [{ phone: cleanPhone }, { phone: `+${cleanPhone}` }]
            });

            const senderName = dbUser?.name || contact?.profile?.name || cleanPhone;

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

            // Save incoming message in MongoDB
            await Message.findOneAndUpdate(
              { wamid },
              {
                $setOnInsert: {
                  wamid,
                  phone: cleanPhone,
                  senderName,
                  direction: 'inbound',
                  text: messageText,
                  status: 'received',
                  rawPayload: message,
                  timestamp: new Date()
                }
              },
              { upsert: true, returnDocument: 'after' }
            );

            console.log(`📥 Incoming WhatsApp from ${cleanPhone} (${senderName}): "${messageText}"`);

            // Ignore self-echoes or messages originating from the admin number
            if (cleanPhone === ADMIN_FORWARD_PHONE) {
              console.log('Admin number message received. Skipping bot auto-reply.');
              continue;
            }

            // --- Trigger FAQ RAG Reply / Admin Escalation ---
            if (message.type === 'text' && messageText.trim().length >= 3) {
              try {
                const autoReplyResult = await handleAutomatedFaqReply(
                  cleanPhone,
                  messageText,
                  0.70,
                  senderName
                );

                if (autoReplyResult.handled) {
                  // A. Normal FAQ Match -> Saved to messages collection
                  if (autoReplyResult.type === 'faq_match') {
                    await Message.create({
                      wamid: autoReplyResult.wamid || `bot_${Date.now()}`,
                      phone: cleanPhone,
                      senderName: 'Abacus AI Copilot',
                      direction: 'outbound',
                      text: autoReplyResult.answer,
                      status: 'sent',
                      metadata: {
                        isAutomated: true,
                        matchedFaqId: autoReplyResult.matchedFaqId,
                        confidenceScore: autoReplyResult.score
                      },
                      timestamp: new Date()
                    });

                    console.log(`🤖 Auto-replied to ${cleanPhone} [FAQ: ${autoReplyResult.matchedFaqId}, Score: ${autoReplyResult.score?.toFixed(4)}]`);
                  }

                  // B. Unmatched Fallback -> Save holding message & admin alert log
                  if (autoReplyResult.type === 'forwarded_to_admin') {
                    // Record holding message sent to parent
                    await Message.create({
                      wamid: autoReplyResult.parentWamid || `bot_fallback_${Date.now()}`,
                      phone: cleanPhone,
                      senderName: 'Abacus AI Copilot',
                      direction: 'outbound',
                      text: autoReplyResult.answer,
                      status: 'sent',
                      metadata: {
                        isAutomated: true,
                        escalatedToAdmin: true,
                        confidenceScore: autoReplyResult.score
                      },
                      timestamp: new Date()
                    });

                    // Record notification dispatched to admin
                    await Message.create({
                      wamid: autoReplyResult.adminWamid || `admin_alert_${Date.now()}`,
                      phone: ADMIN_FORWARD_PHONE,
                      senderName: 'Abacus Lead Escalator',
                      direction: 'outbound',
                      text: autoReplyResult.adminAlertText,
                      status: 'sent',
                      metadata: {
                        isAlert: true,
                        originatingParentPhone: cleanPhone
                      },
                      timestamp: new Date()
                    });

                    console.log(`🚨 Unmatched question from ${cleanPhone}. Forwarded to admin (${ADMIN_FORWARD_PHONE}).`);
                  }
                } else {
                  console.log(`ℹ️ Auto-reply skipped: ${autoReplyResult.reason || 'Unhandled'}`);
                }
              } catch (ragError) {
                console.error(`⚠️ RAG auto-reply failed for ${cleanPhone}:`, ragError.message);
              }
            }
          }

          // 2. Process status updates (sent / delivered / read)
          if (value.statuses && value.statuses.length > 0) {
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

    // --- B. Process Meta Lead Ads Events ---
    if (body?.object === 'page' || body?.object === 'ad_account') {
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
                    email = field.values?.[0] || '';
                  }
                  if (fieldName === 'phone_number' || fieldName === 'phone') {
                    phone = (field.values?.[0] || '').replace(/\D/g, '');
                  }
                });
              }

              if (phone || email) {
                const searchQuery = [];
                if (phone) searchQuery.push({ phone });
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