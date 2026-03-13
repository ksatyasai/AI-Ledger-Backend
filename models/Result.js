const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
    studentId: { type: String, required: true },
    subjectName: { type: String, required: true },
    subjectCode: { type: String, required: true },
    grade: { type: String, required: true },
    marks: { type: Number, required: true },
    status: { type: String, enum: ['PASS', 'FAIL'], required: true },
    semester: { type: Number, required: true },
    revaluationStatus: {
        type: String,
        enum: ['none', 'pending', 'processing', 'pending_chief', 'pending_approval', 'approved', 'rejected'],
        default: 'none'
    },
    // Original marks
    originalMarks: { type: Number, default: null },

    // AI Evaluation
    aiMarks: { type: Number, default: null },
    aiBreakdown: { type: Array, default: [] },

    // Chief Examiner Review
    assignedChief: { type: String, default: null }, // Chief's userId
    chiefMarks: { type: Number, default: null },
    chiefBreakdown: { type: Array, default: [] },
    chiefComments: { type: String, default: null },
    chiefSubmittedAt: { type: Date, default: null },

    // Final Approval
    finalMarks: { type: Number, default: null },
    approvedBy: { type: String, default: null }, // Admin userId
    approvedAt: { type: Date, default: null },

    // Metadata
    revaluationPayment: { type: Boolean, default: false },
    correctionType: { type: String, enum: ['revaluation', 'recounting'], default: 'revaluation' },
    answerScript: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', resultSchema);
