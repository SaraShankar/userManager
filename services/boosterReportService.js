const mongoose = require('mongoose');

function normalizeDigits(phone) {
  return String(phone || '').replace(/\D/g, '');
}

async function buildWeeklyBoosterReport(rawPhone) {
  const digits = normalizeDigits(rawPhone);
  const last10 = digits.slice(-10);
  if (last10.length < 7) return null;

  const boosterDb = mongoose.connection.useDb('BoosterDB', { useCache: true });
  const studentsCol = boosterDb.collection('students');

  const phoneRegex = new RegExp(last10 + '$');
  const students = await studentsCol
    .find({
      isActive: true,
      parentWhatsapp: { $regex: phoneRegex }
    })
    .sort({ name: 1 })
    .toArray();

  if (!students.length) {
    return (
      '📊 *100Sums Abacus & Mental Booster — Weekly Report*\n\n' +
      'We could not find an active Booster student linked to this WhatsApp number.\n' +
      'Please reply with your child\'s full name or Student Code (e.g. BST-10001) so our team can link your number!'
    );
  }

  const lines = ['📊 *100Sums Abacus & Mental Booster — Weekly Report*', ''];

  for (const s of students) {
    const completed = s.weeklyGoal?.completedThisWeek || 0;
    const minReq = s.weeklyGoal?.minRequiredSessions || 3;
    const target = s.weeklyGoal?.targetSessions || 5;
    const statusIcon = completed >= minReq ? '✅ On Track' : '⏳ Needs Practice';

    const tp = s.toolProgress || {};
    const abacusAcc = tp['Abacus-Oral']?.accuracy ?? tp.AbacusOral?.accuracy ?? null;
    const anzanAcc = tp['Anzan-Gym']?.accuracy ?? tp.AnzanGym?.accuracy ?? null;
    const mentalAcc = tp['Mental-Oral']?.accuracy ?? tp.MentalOral?.accuracy ?? null;

    lines.push(`👦 *${s.name}* (${s.studentCode})`);
    lines.push(`• Level ${s.level} • AMAS Stage ${s.currentAmasStage || 1} • Batch: ${s.batchCode}`);
    lines.push(`• Weekly Sessions: *${completed}/${target}* (Min ${minReq}) — ${statusIcon}`);
    lines.push(`• Weekly XP: *${s.weeklyXp || 0} XP* | Streak: *🔥 ${s.streakDays || 0}d*`);

    const toolStats = [];
    if (abacusAcc !== null) toolStats.push(`Abacus: ${Math.round(abacusAcc)}%`);
    if (anzanAcc !== null) toolStats.push(`Anzan: ${Math.round(anzanAcc)}%`);
    if (mentalAcc !== null) toolStats.push(`Mental: ${Math.round(mentalAcc)}%`);
    if (toolStats.length) {
      lines.push(`• Accuracy: ${toolStats.join(' | ')}`);
    }
    lines.push('');
  }

  lines.push('_Reply "WeekReport" anytime for your child\'s latest live booster stats._');
  return lines.join('\n');
}

module.exports = { buildWeeklyBoosterReport };
