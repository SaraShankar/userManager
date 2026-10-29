const mongoose = require('mongoose');

// Schema for downloadable files, images, or curriculum PDFs
const downloadableResourceSchema = new mongoose.Schema({
  resource_id: { type: String, required: true },
  title: { type: String, required: true },
  file_type: { 
    type: String, 
    enum: ['pdf', 'image_png', 'image_jpg', 'workbook_pdf', 'brochure_pdf'],
    required: true 
  },
  download_url: { type: String, required: true },
  description: { type: String }
}, { _id: false });

// Main RAG Knowledge Base Schema
const faqVectorSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true }, // e.g., "faq_q19"
  question: { type: String, required: true },
  answer: { type: String, required: true },
  
  // Vector field for Atlas Vector Search (e.g., 1536 dimensions for OpenAI)
  embedding: { 
    type: [Number], 
    required: true,
    index: false // Managed via MongoDB Atlas Search Index
  },
  
  metadata: {
    category: { 
      type: String, 
      enum: ['Program Overview', 'Pedagogy & Technology', 'Logistics & Formats', 'Parent Support & Pricing', 'Teacher Training'],
      required: true 
    },
    target_age: { type: String, enum: ['Ages 4-5', 'Ages 6+', 'All Ages'] },
    last_updated: { type: Date, default: Date.now }
  },
  
  // Array of downloadable resources attached to this Q&A chunk
  downloadable_resources: [downloadableResourceSchema]
}, { 
  timestamps: true 
});

module.exports = mongoose.model('FaqVector', faqVectorSchema);