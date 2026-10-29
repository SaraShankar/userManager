const sanitizePhone = (phone) => {
  if (!phone) return null;
  // Strip spaces, dashes, parentheses, and '+' symbols
  let cleaned = phone.replace(/[\s\-\+\(\)]/g, '');
  
  // Example: If 10 digits without country code (e.g. India), append country code '91'
  if (cleaned.length === 10) {
    cleaned = '91' + cleaned;
  }
  return cleaned;
};

module.exports = sanitizePhone;