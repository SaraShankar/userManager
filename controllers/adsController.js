const metaAdsService = require('../services/metaAdsService');

exports.getCampaigns = async (req, res) => {
  try {
    const result = await metaAdsService.getCampaigns();
    return res.status(200).json({ success: true, data: result.data || [] });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: err.response?.data || err.message 
    });
  }
};

exports.createCampaign = async (req, res) => {
  try {
    const { name, objective } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: 'Campaign name is required.' });
    }
    const result = await metaAdsService.createCampaign(name, objective);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: err.response?.data || err.message 
    });
  }
};

exports.updateCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const result = await metaAdsService.updateCampaignStatus(id, status);
    return res.status(200).json({ success: true, result });
  } catch (err) {
    return res.status(500).json({ 
      success: false, 
      error: err.response?.data || err.message 
    });
  }
};