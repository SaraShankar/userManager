const Message = require('../models/messageSchema');
const User = require('../models/userSchema');
const metaAdsService = require('../services/metaAdsService');
const { askFaqAssistant } = require('../services/faqRagService');
const { sendWhatsAppMessage } = require('../services/whatsappService');
const { buildWeeklyBoosterReport } = require('../services/boosterReportService');
const { askStudentPerformanceRag } = require('../services/studentPerformanceRagService');

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

            // --- Instant Booster WeekReport Command (Before RAG) ---
            const normalizedCmd = messageText.trim().toLowerCase().replace(/[^a-z]/g, '');
            if (['weekreport', 'weeklyreport', 'boosterreport'].includes(normalizedCmd)) {
              try {
                const reportText = await buildWeeklyBoosterReport(cleanPhone);
                if (reportText) {
                  const reportSendRes = await sendWhatsAppMessage(cleanPhone, reportText);
                  const reportWamid = reportSendRes?.messages?.[0]?.id || `weekreport_${Date.now()}`;

                  await Message.create({
                    wamid: reportWamid,
                    phone: cleanPhone,
                    senderName: parentDisplayName,
                    botPersona: 'Abacus Weekly Reporter',
                    direction: 'outbound',
                    text: reportText,
                    status: 'sent',
                    metadata: {
                      isAutomated: true,
                      botName: 'Abacus Weekly Reporter',
                      command: 'WeekReport'
                    },
                    timestamp: new Date()
                  });

                  console.log(`📊 Sent Weekly Booster Report to ${cleanPhone} (${parentDisplayName})`);
                  continue;
                }
              } catch (reportErr) {
                console.error(`⚠️ Weekly Booster Report failed for ${cleanPhone}:`, reportErr.message);
              }
            }

            
            // --- Parent-Initiated Booster Unlock ("BST-29711 unlock") ---
            if (message.type === 'text') {
              const unlockMatch =
                messageText.match(/\b(BST-\d{4,6})\b[\s\S]*?\bunlock\b/i) ||
                messageText.match(/\bunlock\b[\s\S]*?\b(BST-\d{4,6})\b/i);

              if (unlockMatch) {
                const studentCode = (unlockMatch[1] || unlockMatch[2] || '').toUpperCase();
                const boosterBaseUrl = (process.env.BOOSTER_SERVER_URL || 'https://booster-server-production.up.railway.app').replace(/\/$/, '');
                let replyText = '';

                try {
                  const unlockResp = await fetch(`${boosterBaseUrl}/api/boosters/unlock/by-code`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ studentCode, requesterPhone: cleanPhone })
                  });
                  const unlockData = await unlockResp.json();

                  if (unlockResp.ok && unlockData?.ok) {
                    const s = unlockData.student;
                    replyText = [
                      `🔓 *Booster Access Unlocked!*`,
                      `👤 Student: *${s.name}* (${s.studentCode})`,
                      `🎓 Level ${s.level} | Batch: ${s.batchCode}`,
                      `✅ Status: Active student verified & unlocked. Tap *"Refresh Status"* on the Booster screen to enter today's lobby!`
                    ].join('\n');
                  } else {
                    replyText = `⚠️ ${unlockData?.error || `Could not unlock ${studentCode}. Please contact your Abacus Centre admin.`}`;
                  }
                } catch (unlockErr) {
                  console.error(`❌ Booster unlock-by-code error for ${studentCode}:`, unlockErr.message);
                  replyText = `⚠️ We could not reach the Booster server to unlock ${studentCode} right now. Please try again in a moment.`;
                }

                const sendRes = await sendWhatsAppMessage(cleanPhone, replyText);
                const outboundWamid = sendRes?.messages?.[0]?.id || `unlock_${Date.now()}`;

                await Message.create({
                  wamid: outboundWamid,
                  phone: cleanPhone,
                  senderName: parentDisplayName,
                  botPersona: '100Sums Booster Copilot',
                  direction: 'outbound',
                  text: replyText,
                  status: 'sent',
                  metadata: {
                    isAutomated: true,
                    botName: '100Sums Booster Copilot',
                    command: 'BoosterUnlock',
                    studentCode
                  },
                  timestamp: new Date()
                });

                console.log(`🔓 Processed WhatsApp Booster unlock for ${studentCode} from ${cleanPhone}`);
                continue;
              }
            }

            // --- Student Performance RAG (Centre-Admin Approved Evaluations Only) ---
            if (message.type === 'text' && messageText.trim().length >= 3) {
              try {
                const perfRag = await askStudentPerformanceRag(cleanPhone, messageText);
                if (perfRag?.answer) {
                  const perfSendRes = await sendWhatsAppMessage(cleanPhone, perfRag.answer);
                  const perfWamid = perfSendRes?.messages?.[0]?.id || `perfrag_${Date.now()}`;

                  await Message.create({
                    wamid: perfWamid,
                    phone: cleanPhone,
                    senderName: parentDisplayName,
                    botPersona: 'Abacus Student Progress AI',
                    direction: 'outbound',
                    text: perfRag.answer,
                    status: 'sent',
                    metadata: {
                      isAutomated: true,
                      botName: 'Abacus Student Progress AI',
                      ragType: 'STUDENT_PERFORMANCE',
                      score: perfRag.topScore
                    },
                    timestamp: new Date()
                  });

                  console.log(`🎓 Sent Approved Student Performance RAG reply to ${cleanPhone}`);
                  continue;
                }
              } catch (perfErr) {
                console.error(`⚠️ Student Performance RAG error for ${cleanPhone}:`, perfErr.message);
              }
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