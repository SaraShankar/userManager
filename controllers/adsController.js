const metaAdsService = require('../services/metaAdsService');

exports.getCampaigns = async (req, res) => {
  try {
    const result = await metaAdsService.getCampaigns();
    return res.status(200).json({ 
      success: true, 
      data: result?.data || result || [] 
    });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    return res.status(statusCode).json({ 
      success: false, 
      error: err.response?.data?.error?.message || err.response?.data || err.message 
    });
  }
};

exports.createCampaign = async (req, res) => {
  try {
    const { name, objective = 'OUTCOME_LEADS' } = req.body;
    
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Campaign name is required.' });
    }

    const result = await metaAdsService.createCampaign(name.trim(), objective);
    return res.status(200).json({ 
      success: true, 
      data: result?.data || result 
    });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    return res.status(statusCode).json({ 
      success: false, 
      error: err.response?.data?.error?.message || err.response?.data || err.message 
    });
  }
};

exports.updateCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, error: 'Campaign ID parameter is required.' });
    }

    const normalizedStatus = (status || '').toUpperCase();
    if (!['ACTIVE', 'PAUSED', 'ARCHIVED'].includes(normalizedStatus)) {
      return res.status(400).json({ 
        success: false, 
        error: "Status must be either 'ACTIVE', 'PAUSED', or 'ARCHIVED'." 
      });
    }

    const result = await metaAdsService.updateCampaignStatus(id, normalizedStatus);
    return res.status(200).json({ 
      success: true, 
      data: result?.data || result 
    });
  } catch (err) {
    const statusCode = err.response?.status || 500;
    return res.status(statusCode).json({ 
      success: false, 
      error: err.response?.data?.error?.message || err.response?.data || err.message 
    });
  }
};