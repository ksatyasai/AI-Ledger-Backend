const QuestionPaper = require('../models/QuestionPaper');

/**
 * ============================================================
 * ADMIN CONTROLLER - Question Paper Management
 * ============================================================
 * This controller handles all admin operations for managing
 * dynamic, subject-specific question papers.
 * Only admins can create, update, and delete question papers.
 */

/**
 * POST /admin/create-question-paper
 *
 * Create a new question paper with questions and keywords
 * Admin can define the entire evaluation rubric via this endpoint
 *
 * Request Body:
 * {
 *   "subjectCode": "BCS101",
 *   "subjectName": "Blockchain Systems",
 *   "questions": [
 *     {
 *       "questionId": "Q1",
 *       "maxMarks": 10,
 *       "keywords": ["decentralization", "immutability", "security"],
 *       "definitionMarks": 3,
 *       "keywordMarks": 4,
 *       "explanationMarks": 3
 *     }
 *   ]
 * }
 */
exports.createQuestionPaper = async (req, res) => {
  try {
    const { subjectCode, subjectName, questions, createdBy } = req.body;

    // Validate required fields
    if (!subjectCode || !subjectName || !questions || !Array.isArray(questions)) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: subjectCode, subjectName, questions (array)'
      });
    }

    // Validate questions array is not empty
    if (questions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Questions array cannot be empty'
      });
    }

    // Check if subject code already exists
    const existingPaper = await QuestionPaper.findOne({
      subjectCode: subjectCode.toUpperCase()
    });

    if (existingPaper) {
      return res.status(409).json({
        success: false,
        message: `Question paper for subject ${subjectCode} already exists. Use UPDATE endpoint to modify.`
      });
    }

    // Validate each question
    for (let question of questions) {
      if (!question.questionId || !question.maxMarks || !question.keywords) {
        return res.status(400).json({
          success: false,
          message: `Invalid question structure. Each question needs questionId, maxMarks, keywords`
        });
      }

      // Validate question ID format
      if (!/^Q\d+$/.test(question.questionId)) {
        return res.status(400).json({
          success: false,
          message: `Invalid questionId: ${question.questionId}. Must be in format Q1, Q2, etc.`
        });
      }

      // Calculate total allocated marks
      const definitionMarks = question.definitionMarks || 3;
      const keywordMarks = question.keywordMarks || 4;
      const explanationMarks = question.explanationMarks || 3;
      const totalAllocated = definitionMarks + keywordMarks + explanationMarks;

      if (totalAllocated > question.maxMarks) {
        return res.status(400).json({
          success: false,
          message: `Question ${question.questionId}: Sum of (definitionMarks + keywordMarks + explanationMarks) cannot exceed maxMarks`
        });
      }
    }

    // Create new question paper
    const newPaper = new QuestionPaper({
      subjectCode: subjectCode.toUpperCase(),
      subjectName,
      questions: questions.map((q) => ({
        questionId: q.questionId,
        maxMarks: q.maxMarks,
        keywords: q.keywords.map((kw) => kw.toLowerCase().trim()),
        definitionMarks: q.definitionMarks || 3,
        keywordMarks: q.keywordMarks || 4,
        explanationMarks: q.explanationMarks || 3
      })),
      createdBy: createdBy || 'admin'
    });

    await newPaper.save();

    return res.status(201).json({
      success: true,
      message: `Question paper for subject ${subjectCode} created successfully`,
      data: {
        subjectCode: newPaper.subjectCode,
        subjectName: newPaper.subjectName,
        totalQuestions: newPaper.questions.length,
        totalMarks: newPaper.getTotalMarks(),
        createdAt: newPaper.createdAt
      }
    });
  } catch (error) {
    console.error('Error creating question paper:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating question paper',
      error: error.message
    });
  }
};

/**
 * GET /admin/question-paper/:subjectCode
 *
 * Retrieve a question paper for a specific subject
 * Returns all questions, keywords, and mark distribution
 */
exports.getQuestionPaper = async (req, res) => {
  try {
    const { subjectCode } = req.params;

    if (!subjectCode) {
      return res.status(400).json({
        success: false,
        message: 'Subject code is required'
      });
    }

    // Find question paper using static method
    const paper = await QuestionPaper.findBySubjectCode(subjectCode);

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: `No question paper found for subject ${subjectCode}`
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        subjectCode: paper.subjectCode,
        subjectName: paper.subjectName,
        totalQuestions: paper.questions.length,
        totalMarks: paper.getTotalMarks(),
        questions: paper.questions,
        createdBy: paper.createdBy,
        createdAt: paper.createdAt,
        updatedAt: paper.updatedAt
      }
    });
  } catch (error) {
    console.error('Error fetching question paper:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching question paper',
      error: error.message
    });
  }
};

/**
 * PUT /admin/update-question-paper/:subjectCode
 *
 * Update an existing question paper
 * Can modify questions, keywords, and mark distribution
 * Admin authority is absolute here
 */
exports.updateQuestionPaper = async (req, res) => {
  try {
    const { subjectCode } = req.params;
    const { subjectName, questions, updatedBy } = req.body;

    if (!subjectCode) {
      return res.status(400).json({
        success: false,
        message: 'Subject code is required'
      });
    }

    // Find existing paper
    const paper = await QuestionPaper.findBySubjectCode(subjectCode);

    if (!paper) {
      return res.status(404).json({
        success: false,
        message: `No question paper found for subject ${subjectCode}`
      });
    }

    // Update subject name if provided
    if (subjectName) {
      paper.subjectName = subjectName;
    }

    // Update questions if provided
    if (questions && Array.isArray(questions)) {
      // Validate new questions
      for (let question of questions) {
        if (!question.questionId || !question.maxMarks || !question.keywords) {
          return res.status(400).json({
            success: false,
            message: `Invalid question structure`
          });
        }

        const totalAllocated =
          (question.definitionMarks || 3) +
          (question.keywordMarks || 4) +
          (question.explanationMarks || 3);

        if (totalAllocated > question.maxMarks) {
          return res.status(400).json({
            success: false,
            message: `Question ${question.questionId}: Mark allocation exceeds maxMarks`
          });
        }
      }

      // Replace questions
      paper.questions = questions.map((q) => ({
        questionId: q.questionId,
        maxMarks: q.maxMarks,
        keywords: q.keywords.map((kw) => kw.toLowerCase().trim()),
        definitionMarks: q.definitionMarks || 3,
        keywordMarks: q.keywordMarks || 4,
        explanationMarks: q.explanationMarks || 3
      }));
    }

    // Set updated by
    paper.updatedBy = updatedBy || 'admin';

    await paper.save();

    return res.status(200).json({
      success: true,
      message: `Question paper for subject ${subjectCode} updated successfully`,
      data: {
        subjectCode: paper.subjectCode,
        subjectName: paper.subjectName,
        totalQuestions: paper.questions.length,
        totalMarks: paper.getTotalMarks(),
        updatedAt: paper.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating question paper:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating question paper',
      error: error.message
    });
  }
};

/**
 * GET /admin/all-question-papers
 *
 * Retrieve all question papers in the system
 * Useful for admin dashboard to see all subjects
 */
exports.getAllQuestionPapers = async (req, res) => {
  try {
    const papers = await QuestionPaper.find().select(
      'subjectCode subjectName questions createdAt updatedAt'
    );

    if (papers.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No question papers found',
        data: []
      });
    }

    const summary = papers.map((paper) => ({
      subjectCode: paper.subjectCode,
      subjectName: paper.subjectName,
      totalQuestions: paper.questions.length,
      totalMarks: paper.getTotalMarks(),
      createdAt: paper.createdAt,
      updatedAt: paper.updatedAt
    }));

    return res.status(200).json({
      success: true,
      count: papers.length,
      data: summary
    });
  } catch (error) {
    console.error('Error fetching all question papers:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching question papers',
      error: error.message
    });
  }
};

/**
 * DELETE /admin/question-paper/:subjectCode
 *
 * Delete a question paper (careful operation)
 * This prevents evaluation for that subject
 */
exports.deleteQuestionPaper = async (req, res) => {
  try {
    const { subjectCode } = req.params;

    if (!subjectCode) {
      return res.status(400).json({
        success: false,
        message: 'Subject code is required'
      });
    }

    const result = await QuestionPaper.findOneAndDelete({
      subjectCode: subjectCode.toUpperCase()
    });

    if (!result) {
      return res.status(404).json({
        success: false,
        message: `No question paper found for subject ${subjectCode}`
      });
    }

    return res.status(200).json({
      success: true,
      message: `Question paper for subject ${subjectCode} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting question paper:', error);
    return res.status(500).json({
      success: false,
      message: 'Error deleting question paper',
      error: error.message
    });
  }
};
