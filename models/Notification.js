const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
    title: { type: String, required: true },
    message: { type: String, required: true },
    date: { type: Date, default: Date.now },
    audience: { 
        type: mongoose.Schema.Types.Mixed, // Allow both string and array
        default: 'all'
    },
    type: { type: String, default: 'general' }, // 'general', 'chief_assignment', 'revaluation_result', etc.
    relatedId: { type: String }, // Reference to related document (result ID, etc.)
    read: { type: Boolean, default: false }
});

module.exports = mongoose.model('Notification', notificationSchema);
