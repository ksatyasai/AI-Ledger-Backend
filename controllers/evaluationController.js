const QuestionPaper = require('../models/QuestionPaper');
const Result = require('../models/Result');

/**
 * ============================================================
 * EVALUATION CONTROLLER - Dynamic AI Evaluation
 * ============================================================
 * This controller handles AI-based evaluation using subject-specific
 * rubrics retrieved from MongoDB.
 *
 * RULE-BASED EVALUATION LOGIC:
 * For each question:
 * 1. Check if definition is present (text length > 10 chars) → award definitionMarks
 * 2. Count keyword matches → distribute keywordMarks proportionally
 * 3. Check if explanation is present (text > 15 words) → award explanationMarks
 * 4. Don't exceed maxMarks for the question
 */

/**
 * POST /evaluate/:subjectCode
 *
 * Evaluate extracted answer text against a specific subject's rubric
 * This is the MAIN evaluation endpoint used during revaluation process
 *
 * Request Body:
 * {
 *   "extractedText": "full extracted answer text from OCR/PDF parsing",
 *   "studentId": "19A81A0501"
 * }
 *
 * Response:
 * {
 *   "success": true,
 *   "evaluation": {
 *     "subjectCode": "BCS101",
 *     "questions": [
 *       {
 *         "questionId": "Q1",
 *         "studentAnswer": "...",
 *         "suggestedMarks": 9,
 *         "maxMarks": 10,
 *         "breakdown": {
 *           "definition": 3,
 *           "keywords": 4,
 *           "explanation": 2,
 *           "matchedKeywords": ["keyword1", "keyword2"]
 *         }
 *       }
 *     ],
 *     "totalSuggestedMarks": 27,
 *     "totalMaxMarks": 30
 *   }
 * }
 */
exports.evaluateAnswer = async (req, res) => {
  try {
    const { subjectCode } = req.params;
    const { extractedText, studentId } = req.body;

    // Validate input
    if (!subjectCode || !extractedText) {
      return res.status(400).json({
        success: false,
        message: 'Subject code and extractedText are required'
      });
    }

    if (typeof extractedText !== 'string' || extractedText.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Extracted text must be a non-empty string'
      });
    }

    // Fetch question paper from database
    const questionPaper = await QuestionPaper.findBySubjectCode(subjectCode);

    if (!questionPaper) {
      return res.status(404).json({
        success: false,
        message: `No question paper found for subject ${subjectCode}. Admin must create one first.`
      });
    }

    // Normalize extracted text for evaluation
    const normalizedText = extractedText.toLowerCase().trim();

    // Extract questions from answer text
    // Supported formats: Q1, 1, 1., 1), Q2:, etc.
    const questionPattern = /(?:q)?(\d+)[\.\):\-]?\s*(.*?)(?=(?:q?\d+[\.\):\-]?\s)|$)/gi;
    const extractedAnswers = {};

    let match;
    while ((match = questionPattern.exec(normalizedText)) !== null) {
      const questionNum = match[1];
      const answerText = match[2].trim();
      const questionId = `Q${questionNum}`;

      // Aggregate if question appears multiple times (OCR fragmentation)
      if (extractedAnswers[questionId]) {
        extractedAnswers[questionId] += ' ' + answerText;
      } else {
        extractedAnswers[questionId] = answerText;
      }
    }

    // Evaluate each question
    const evaluationResults = [];
    let totalSuggestedMarks = 0;
    let totalMaxMarks = 0;

    for (const question of questionPaper.questions) {
      const questionId = question.questionId;
      const answerText = extractedAnswers[questionId] || '';

      let suggestedMarks = 0;
      const breakdown = {
        definition: 0,
        keywords: 0,
        explanation: 0,
        matchedKeywords: []
      };

      // ========== RULE 1: Check Definition ==========
      // If answer has meaningful text (>10 characters), award definition marks
      if (answerText.length > 10) {
        suggestedMarks += question.definitionMarks;
        breakdown.definition = question.definitionMarks;
      }

      // ========== RULE 2: Match Keywords ==========
      // Count how many keywords from rubric appear in student's answer
      let matchedKeywords = [];
      for (const keyword of question.keywords) {
        // Check exact word match or substring match
        if (answerText.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
        }
      }

      if (matchedKeywords.length > 0) {
        // Distribute keyword marks proportionally
        // If student matches all keywords → full keywordMarks
        // If student matches some → proportional marks
        const keywordPercentage = matchedKeywords.length / question.keywords.length;
        const keywordScore = Math.ceil(
          keywordPercentage * question.keywordMarks
        );
        suggestedMarks += keywordScore;
        breakdown.keywords = keywordScore;
        breakdown.matchedKeywords = matchedKeywords;
      }

      // ========== RULE 3: Check Explanation ==========
      // If answer has detailed explanation (>15 words), award explanation marks
      const wordCount = answerText.split(/\s+/).filter((w) => w.length > 0).length;
      if (wordCount > 15) {
        suggestedMarks += question.explanationMarks;
        breakdown.explanation = question.explanationMarks;
      }

      // ========== SAFETY: Don't exceed maxMarks ==========
      const finalMarks = Math.min(suggestedMarks, question.maxMarks);

      totalSuggestedMarks += finalMarks;
      totalMaxMarks += question.maxMarks;

      evaluationResults.push({
        questionId,
        studentAnswer: answerText.substring(0, 200) + (answerText.length > 200 ? '...' : ''),
        suggestedMarks: finalMarks,
        maxMarks: question.maxMarks,
        breakdown
      });
    }

    // Return comprehensive evaluation
    return res.status(200).json({
      success: true,
      evaluation: {
        subjectCode: questionPaper.subjectCode,
        subjectName: questionPaper.subjectName,
        studentId: studentId || 'unknown',
        questions: evaluationResults,
        totalSuggestedMarks,
        totalMaxMarks,
        percentage: Math.round((totalSuggestedMarks / totalMaxMarks) * 100),
        evaluatedAt: new Date()
      }
    });
  } catch (error) {
    console.error('Error during evaluation:', error);
    return res.status(500).json({
      success: false,
      message: 'Error during evaluation',
      error: error.message
    });
  }
};

/**
 * POST /evaluate/:subjectCode/detailed
 *
 * More detailed evaluation with keyword matching information
 * Useful for transparency and debugging
 *
 * Same request as /evaluate/:subjectCode
 * Additional response fields:
 * - Keywords found in each answer
 * - Keywords NOT found
 * - Confidence score
 */
exports.evaluateAnswerDetailed = async (req, res) => {
  try {
    const { subjectCode } = req.params;
    const { extractedText, studentId } = req.body;

    if (!subjectCode || !extractedText) {
      return res.status(400).json({
        success: false,
        message: 'Subject code and extractedText are required'
      });
    }

    // Fetch question paper
    const questionPaper = await QuestionPaper.findBySubjectCode(subjectCode);

    if (!questionPaper) {
      return res.status(404).json({
        success: false,
        message: `No question paper found for subject ${subjectCode}`
      });
    }

    const normalizedText = extractedText.toLowerCase().trim();
    const questionPattern = /(?:q)?(\d+)[\.\):\-]?\s*(.*?)(?=(?:q?\d+[\.\):\-]?\s)|$)/gi;
    const extractedAnswers = {};

    let match;
    while ((match = questionPattern.exec(normalizedText)) !== null) {
      const questionNum = match[1];
      const answerText = match[2].trim();
      const questionId = `Q${questionNum}`;

      if (extractedAnswers[questionId]) {
        extractedAnswers[questionId] += ' ' + answerText;
      } else {
        extractedAnswers[questionId] = answerText;
      }
    }

    const detailedResults = [];
    let totalMarks = 0;

    for (const question of questionPaper.questions) {
      const questionId = question.questionId;
      const answerText = extractedAnswers[questionId] || '';

      let suggestedMarks = 0;
      const breakdown = {
        definition: { awarded: 0, condition: 'Text length > 10 chars', met: false },
        keywords: { awarded: 0, total: 0, matched: [], notMatched: [] },
        explanation: { awarded: 0, condition: 'Word count > 15', met: false }
      };

      // Definition check
      if (answerText.length > 10) {
        suggestedMarks += question.definitionMarks;
        breakdown.definition.awarded = question.definitionMarks;
        breakdown.definition.met = true;
      }

      // Keywords check
      let matchedKeywords = [];
      for (const keyword of question.keywords) {
        if (answerText.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
        } else {
          breakdown.keywords.notMatched.push(keyword);
        }
      }

      breakdown.keywords.matched = matchedKeywords;
      breakdown.keywords.total = matchedKeywords.length;

      if (matchedKeywords.length > 0) {
        const keywordPercentage = matchedKeywords.length / question.keywords.length;
        const keywordScore = Math.ceil(
          keywordPercentage * question.keywordMarks
        );
        suggestedMarks += keywordScore;
        breakdown.keywords.awarded = keywordScore;
      }

      // Explanation check
      const wordCount = answerText.split(/\s+/).filter((w) => w.length > 0).length;
      if (wordCount > 15) {
        suggestedMarks += question.explanationMarks;
        breakdown.explanation.awarded = question.explanationMarks;
        breakdown.explanation.met = true;
      }

      const finalMarks = Math.min(suggestedMarks, question.maxMarks);
      totalMarks += finalMarks;

      detailedResults.push({
        questionId,
        answerLength: answerText.length,
        wordCount,
        suggestedMarks: finalMarks,
        maxMarks: question.maxMarks,
        breakdown
      });
    }

    return res.status(200).json({
      success: true,
      detailedEvaluation: {
        subjectCode: questionPaper.subjectCode,
        studentId: studentId || 'unknown',
        questions: detailedResults,
        totalMarks,
        totalMaxMarks: questionPaper.getTotalMarks(),
        evaluationTimestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Error during detailed evaluation:', error);
    return res.status(500).json({
      success: false,
      message: 'Error during evaluation',
      error: error.message
    });
  }
};

/**
 * GET /evaluate/rubric/:subjectCode
 *
 * Retrieve the evaluation rubric for a subject
 * Useful for transparency: students can see what keywords will be matched
 */
exports.getRubric = async (req, res) => {
  try {
    const { subjectCode } = req.params;

    if (!subjectCode) {
      return res.status(400).json({
        success: false,
        message: 'Subject code is required'
      });
    }

    const questionPaper = await QuestionPaper.findBySubjectCode(subjectCode);

    if (!questionPaper) {
      return res.status(404).json({
        success: false,
        message: `No rubric found for subject ${subjectCode}`
      });
    }

    return res.status(200).json({
      success: true,
      rubric: {
        subjectCode: questionPaper.subjectCode,
        subjectName: questionPaper.subjectName,
        totalMarks: questionPaper.getTotalMarks(),
        questions: questionPaper.questions.map((q) => ({
          questionId: q.questionId,
          maxMarks: q.maxMarks,
          keywords: q.keywords,
          markBreakdown: {
            definition: q.definitionMarks,
            keywords: q.keywordMarks,
            explanation: q.explanationMarks
          }
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching rubric:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching rubric',
      error: error.message
    });
  }
};
