const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const Notification = require('../models/Notification');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const QuestionPaper = require('../models/QuestionPaper');

// GET /api/student/results/:studentId
router.get('/results/:studentId', async (req, res) => {
    try {
        const results = await Result.find({ studentId: req.params.studentId });
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/student/result/:studentId/:resultId - Get specific result details
router.get('/result/:studentId/:resultId', async (req, res) => {
    try {
        const { studentId, resultId } = req.params;
        const result = await Result.findOne({ _id: resultId, studentId: studentId });

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Result not found or does not belong to this student'
            });
        }

        res.json({
            success: true,
            data: result
        });
    } catch (err) {
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

// GET /api/student/notifications
router.get('/notifications', async (req, res) => {
    try {
        const notifications = await Notification.find({ audience: { $in: ['all', 'student'] } }).sort({ date: -1 });
        res.json(notifications);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// Revaluation handler (supports POST body or GET query)
async function handleReval(req, res) {
    const source = req.method === 'GET' ? req.query : req.body;
    const studentId = source.studentId;
    const subjectCode = source.subjectCode || source.subject;
    const type = source.type;

    console.log(`Reval requested for ${studentId} - ${subjectCode} (via ${req.method})`);

    try {
        const result = await Result.findOne({ studentId, subjectCode });
        if (!result) return res.status(404).json({ message: 'Result not found' });

        // Ensure we have a file or can handle it
        if (!result.answerScript) {
            return res.status(400).json({ message: 'No answer script found for this subject. Cannot proceed with AI Revaluation.' });
        }

        const absolutePdfPath = path.join(__dirname, '..', result.answerScript);
        if (!fs.existsSync(absolutePdfPath)) {
            console.warn(`File missing at ${absolutePdfPath}, checking if path is absolute or relative...`);
            // Fallback check if path is already absolute (sometimes saved differently)
            if (!fs.existsSync(result.answerScript)) {
                return res.status(404).json({ message: 'Answer script file is missing on server.' });
            }
        }

        result.revaluationStatus = 'processing';
        result.revaluationPayment = true;
        await result.save();

        // Call New AI Module
        // We will fetch rubric from DB (Node) and pass it to Python via stdin to avoid Python HTTP dependency
        const scriptPath = path.join(__dirname, '..', 'ai-module', 'revaluation.py');

        // Try to load rubric for this subject from QuestionPaper collection
        let rubricForPython = {};
        try {
            const paper = await QuestionPaper.findOne({ subjectCode: result.subjectCode });
            if (paper && paper.questions && paper.questions.length > 0) {
                // Build expected structure: { "Q1": { max_marks, keywords, definition_marks, keyword_marks, explanation_marks }, ... }
                paper.questions.forEach(q => {
                    rubricForPython[q.questionId] = {
                        max_marks: q.maxMarks,
                        keywords: q.keywords || [],
                        definition_marks: q.definitionMarks || 0,
                        keyword_marks: q.keywordMarks || 0,
                        explanation_marks: q.explanationMarks || 0
                    };
                });
            }
        } catch (e) {
            console.error('Error loading QuestionPaper for reval:', e);
        }

        // Spawn Python and send rubric JSON to stdin (may be empty object)
        const pythonProcess = spawn('python', [scriptPath, "", absolutePdfPath]);

        // Write rubric JSON to stdin and close
        try {
            pythonProcess.stdin.write(JSON.stringify(rubricForPython));
            pythonProcess.stdin.end();
        } catch (e) {
            console.warn('Failed to write rubric to python stdin:', e);
        }

        let dataString = '';
        let errorString = '';

        pythonProcess.stdout.on('data', (data) => {
            dataString += data.toString();
        });

        pythonProcess.stderr.on('data', (data) => {
            errorString += data.toString();
            console.error(`Python Stderr: ${data}`);
        });

        pythonProcess.on('close', async (code) => {
            console.log(`Python script exited with code ${code}`);

            try {
                // The python script might output other things, so we need to find the JSON array part
                // In case there are print statements before the JSON
                const jsonStartIndex = dataString.indexOf('[');
                const jsonEndIndex = dataString.lastIndexOf(']');

                if (jsonStartIndex === -1 || jsonEndIndex === -1) {
                    throw new Error("No JSON array found in output");
                }

                const jsonStr = dataString.substring(jsonStartIndex, jsonEndIndex + 1);
                const aiResults = JSON.parse(jsonStr);

                // aiResults is an array: [{ question, suggested_marks, max_marks, ... }]

                // Calculate total suggested marks
                let totalAiMarks = 0;
                aiResults.forEach(item => {
                    totalAiMarks += (item.suggested_marks || 0);
                });

                // Update Record
                result.aiMarks = totalAiMarks;
                result.aiBreakdown = aiResults;
                result.revaluationStatus = 'pending_approval';

                await result.save();

                res.json({
                    success: true,
                    message: 'AI Revaluation Completed. Sent for Admin Approval.',
                    data: {
                        totalMarks: totalAiMarks,
                        breakdown: aiResults
                    }
                });

            } catch (parseError) {
                console.error("Failed to parse Python output:", dataString);
                // Revert status if failed
                result.revaluationStatus = 'pending';
                await result.save();

                res.status(500).json({
                    message: 'AI Revaluation Failed internally.',
                    error: parseError.message,
                    raw_output: dataString,
                    stderr: errorString
                });
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ message: err.message });
    }
}

// POST /api/student/reval - AI Revaluation (called by admin panel)
router.post('/reval', handleReval);
// Support GET for legacy links or direct URL access
router.get('/reval', handleReval);

// POST /api/student/process-payment - Mark payment received, don't start AI yet
// This is called when student pays the fee
// AI correction will only happen when admin clicks button in approval page
router.post('/process-payment', async (req, res) => {
    try {
        const { studentId, subjectCode, type } = req.body;

        if (!studentId || !subjectCode) {
            return res.status(400).json({
                success: false,
                message: 'Student ID and Subject Code are required'
            });
        }

        const result = await Result.findOne({ studentId, subjectCode });
        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Result not found'
            });
        }

        // Mark that payment has been received
        result.revaluationPayment = true;
        result.revaluationStatus = 'pending'; // Waiting for admin to trigger AI correction

        // Preserve original marks if not already preserved
        if (result.originalMarks === null || result.originalMarks === undefined) {
            result.originalMarks = result.marks;
        }

        if (type && ['revaluation', 'recounting'].includes(type)) {
            result.correctionType = type;
        }

        await result.save();

        res.json({
            success: true,
            message: 'Payment received successfully. Please wait for admin approval.',
            data: {
                studentId: result.studentId,
                subjectCode: result.subjectCode,
                status: 'pending',
                paymentStatus: 'completed'
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({
            success: false,
            message: err.message
        });
    }
});

module.exports = router;
