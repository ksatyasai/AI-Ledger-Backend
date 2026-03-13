const mongoose = require('mongoose');

const chiefSchema = new mongoose.Schema({
    chiefId: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    email: { type: String },
    department: { type: String },
    subject: { type: String }, // Subject specialty (optional)
    isActive: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Chief', chiefSchema);