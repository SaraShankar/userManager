const axios = require('axios');

// Environment variables with fallbacks
const AD_ACCOUNT_ID = process.env.META_AD_ACCOUNT_ID; // e.g., act_2180354086161978
const ACCESS_TOKEN = process.env.META_MARKETING_API_TOKEN || process.env.META_ACCESS_TOKEN;
const API_VERSION = process.env.META_API_VERSION || 'v20.0';

/**
 * Get all campaigns in the Sandbox Ad Account
 */
exports.getCampaigns = async () => {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/campaigns`;
    const response = await axios.get(url, {
      params: {
        fields: 'id,name,status,objective,buying_type,daily_budget,created_time',
        access_token: ACCESS_TOKEN
      }
    });
    return response.data;
  } catch (error) {
    console.error('Meta API - Fetch Campaigns Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Failed to fetch campaigns from Meta API');
  }
};

/**
 * Create a new campaign (PAUSED by default for safety)
 */
exports.createCampaign = async (name, objective = 'OUTCOME_LEADS') => {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${AD_ACCOUNT_ID}/campaigns`;
    const response = await axios.post(url, null, {
      params: {
        name,
        objective,
        status: 'PAUSED',
        special_ad_categories: JSON.stringify(['NONE']),
        is_adset_budget_sharing_enabled: false,
        access_token: ACCESS_TOKEN
      }
    });
    return response.data;
  } catch (error) {
    console.error('Meta API - Create Campaign Error:', error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Failed to create campaign via Meta API');
  }
};

/**
 * Update campaign status (ACTIVE, PAUSED, ARCHIVED)
 */
exports.updateCampaignStatus = async (campaignId, status) => {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${campaignId}`;
    const response = await axios.post(url, null, {
      params: {
        status,
        access_token: ACCESS_TOKEN
      }
    });
    return response.data;
  } catch (error) {
    console.error(`Meta API - Update Campaign Status Error (${campaignId}):`, error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Failed to update campaign status');
  }
};

/**
 * Fetch full lead details using Meta leadgen_id
 */
exports.getLeadDetails = async (leadgenId) => {
  try {
    const url = `https://graph.facebook.com/${API_VERSION}/${leadgenId}`;
    const response = await axios.get(url, {
      params: {
        access_token: ACCESS_TOKEN
      }
    });
    return response.data; // Returns field_data containing form answers
  } catch (error) {
    console.error(`Meta API - Fetch Lead Details Error (${leadgenId}):`, error.response?.data || error.message);
    throw new Error(error.response?.data?.error?.message || 'Failed to fetch lead details from Meta API');
  }
};