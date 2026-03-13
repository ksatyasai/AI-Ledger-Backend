const express = require('express');
const router = express.Router();
const questionPaperController = require('../controllers/questionPaperController');

/**
 * ============================================================
 * ADMIN ROUTES - Question Paper Management
 * ============================================================
 * All routes for creating, reading, updating, and deleting
 * question papers (rubrics) for subjects
 *
 * In production, these should be protected by authentication
 * middleware that verifies admin role
 */

/**
 * POST /admin/create-question-paper
 * Create a new question paper with questions and keywords
 */
router.post('/create-question-paper', questionPaperController.createQuestionPaper);

/**
 * GET /admin/question-paper/:subjectCode
 * Retrieve an existing question paper by subject code
 */
router.get('/question-paper/:subjectCode', questionPaperController.getQuestionPaper);

/**
 * PUT /admin/update-question-paper/:subjectCode
 * Update an existing question paper (questions, keywords, marks)
 */
router.put(
  '/update-question-paper/:subjectCode',
  questionPaperController.updateQuestionPaper
);

/**
 * GET /admin/all-question-papers
 * Retrieve all question papers in the system
 * Useful for admin dashboard
 */
router.get('/all-question-papers', questionPaperController.getAllQuestionPapers);

/**
 * DELETE /admin/question-paper/:subjectCode
 * Delete a question paper (careful operation)
 */
router.delete(
  '/question-paper/:subjectCode',
  questionPaperController.deleteQuestionPaper
);

module.exports = router;
