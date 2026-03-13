const express = require('express');
const router = express.Router();
const evaluationController = require('../controllers/evaluationController');

/**
 * ============================================================
 * EVALUATION ROUTES - AI Evaluation Engine
 * ============================================================
 * Routes for performing dynamic AI evaluation based on
 * subject-specific rubrics stored in MongoDB
 *
 * These routes are used during the revaluation process
 */

/**
 * POST /evaluate/:subjectCode
 * Main evaluation endpoint
 * Evaluates extracted answer text against subject's rubric
 *
 * Request Body:
 * {
 *   "extractedText": "full answer text",
 *   "studentId": "optional"
 * }
 */
router.post('/:subjectCode', evaluationController.evaluateAnswer);

/**
 * POST /evaluate/:subjectCode/detailed
 * Detailed evaluation with keyword matching information
 * Shows which keywords were found/not found
 *
 * Same request body as /:subjectCode
 * More comprehensive response
 */
router.post('/:subjectCode/detailed', evaluationController.evaluateAnswerDetailed);

/**
 * GET /evaluate/rubric/:subjectCode
 * Retrieve the evaluation rubric for a subject
 * Useful for transparency: students can see evaluation criteria
 */
router.get('/rubric/:subjectCode', evaluationController.getRubric);

module.exports = router;
