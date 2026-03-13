const mongoose = require('mongoose');

/**
 * QuestionPaper Schema
 * Stores subject-specific question papers with keywords and mark distribution
 * This is the single source of truth for all AI evaluation logic
 */
const questionPaperSchema = new mongoose.Schema(
  {
    subjectCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      description: 'Unique subject code (e.g., BCS101, CS102)'
    },

    subjectName: {
      type: String,
      required: true,
      trim: true,
      description: 'Full name of the subject (e.g., Blockchain Systems)'
    },

    questions: [
      {
        questionId: {
          type: String,
          required: true,
          description: 'Question identifier (Q1, Q2, etc.)',
          validate: {
            validator: function (v) {
              return /^Q\d+$/.test(v);
            },
            message: 'Question ID must be in format Q1, Q2, etc.'
          }
        },

        maxMarks: {
          type: Number,
          required: true,
          min: 1,
          max: 100,
          description: 'Maximum marks for this question'
        },

        keywords: {
          type: [String],
          required: true,
          description: 'Array of keywords that must be matched in answers',
          validate: {
            validator: function (v) {
              return v.length > 0;
            },
            message: 'At least one keyword is required'
          }
        },

        definitionMarks: {
          type: Number,
          required: true,
          default: 3,
          min: 0,
          description: 'Marks awarded for having a definition/concept explanation'
        },

        keywordMarks: {
          type: Number,
          required: true,
          default: 4,
          min: 0,
          description: 'Maximum marks for matching keywords'
        },

        explanationMarks: {
          type: Number,
          required: true,
          default: 3,
          min: 0,
          description: 'Marks awarded for detailed explanation'
        }
      }
    ],

    createdBy: {
      type: String,
      required: true,
      description: 'Admin ID who created this question paper'
    },

    updatedBy: {
      type: String,
      description: 'Admin ID who last updated this question paper'
    }
  },
  {
    timestamps: true,
    collection: 'questionPapers'
  }
);

/**
 * Pre-save validation to ensure mark distribution consistency
 */
questionPaperSchema.pre('save', function (next) {
  if (this.questions) {
    this.questions.forEach((question) => {
      const totalAllocated =
        question.definitionMarks + question.keywordMarks + question.explanationMarks;
      if (totalAllocated > question.maxMarks) {
        throw new Error(
          `Question ${question.questionId}: Total allocated marks (${totalAllocated}) exceeds maxMarks (${question.maxMarks})`
        );
      }
    });
  }
  next();
});

/**
 * Instance method: Get total marks for the entire question paper
 */
questionPaperSchema.methods.getTotalMarks = function () {
  return this.questions.reduce((total, q) => total + q.maxMarks, 0);
};

/**
 * Instance method: Get question by ID
 */
questionPaperSchema.methods.getQuestion = function (questionId) {
  return this.questions.find((q) => q.questionId === questionId);
};

/**
 * Static method: Find by subject code (frequently used, so as a helper)
 */
questionPaperSchema.statics.findBySubjectCode = function (subjectCode) {
  return this.findOne({ subjectCode: subjectCode.toUpperCase() });
};

module.exports = mongoose.model('QuestionPaper', questionPaperSchema);
