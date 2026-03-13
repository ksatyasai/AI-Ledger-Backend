const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Result = require('../models/Result');
const Chief = require('../models/Chief');
const Notification = require('../models/Notification');
const { verifyToken, checkRole } = require('../middleware/authMiddleware');

// GET /api/admin/users
// Fetch all users with optional filtering
router.get('/users', async (req, res) => {
    try {
        const { role } = req.query;
        let query = {};
        if (role) query.role = role;

        const users = await User.find(query).select('-password'); // Exclude password
        res.json(users);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// POST /api/admin/notifications
// Create a new notification
router.post('/notifications', async (req, res) => {
    const { title, message, audience } = req.body;
    try {
        const newNotif = new Notification({
            title,
            message,
            audience
        });
        await newNotif.save();
        res.json({ success: true, message: 'Notification released successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// PUT /api/admin/users/:userId
// Update user details
router.put('/users/:userId', async (req, res) => {
    try {
        const { name, email, department } = req.body;
        const user = await User.findOne({ userId: req.params.userId });
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (name) user.name = name;
        if (email) user.email = email;
        if (department) user.department = department;

        await user.save();
        res.json({ success: true, message: 'User updated successfully' });
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/admin/chief-list - Get all available chief examiners
router.get('/chief-list', async (req, res) => {
    try {
        const chiefs = await User.find({ role: 'chief' }).select('-password');
        res.json({
            success: true,
            count: chiefs.length,
            data: chiefs
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/assign-chief - Assign a chief examiner to a revaluation
// PROTECTED: Requires JWT token and admin role
router.post('/assign-chief', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const { resultId, chiefId } = req.body;

        if (!resultId || !chiefId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: resultId, chiefId'
            });
        }

        const result = await Result.findById(resultId);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result not found' });
        }

        const chief = await User.findOne({ userId: chiefId, role: 'chief' });
        if (!chief) {
            return res.status(404).json({ success: false, message: 'Chief not found' });
        }

        // Assign chief and update status
        result.assignedChief = chiefId;
        result.revaluationStatus = 'pending_chief'; // Waiting for Chief's review
        await result.save();

        // Notify chief
        const notif = new Notification({
            audience: [chiefId],
            title: 'New Revaluation Assignment',
            message: `You have been assigned to review revaluation for ${result.studentId} - ${result.subjectCode}`,
            type: 'chief_assignment',
            relatedId: result._id,
            date: new Date()
        });
        await notif.save();

        res.json({
            success: true,
            message: 'Chief assigned successfully. Notification sent.',
            data: result
        });
    } catch (err) {
        console.error('Error assigning chief:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/reval-pending-chief - Get revaluations waiting for chief review
router.get('/reval-pending-chief', async (req, res) => {
    try {
        const requests = await Result.find({ revaluationStatus: 'pending_chief' });
        res.json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/reval-requests (UPDATED) - Get revaluations waiting for admin approval (chief-submitted)
router.get('/reval-requests', async (req, res) => {
    try {
        // Get requests that are pending_approval (Chief has submitted marks)
        // For admin to review: AI marks vs Chief marks
        const requests = await Result.find({ revaluationStatus: 'pending_approval' });
        res.json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/admin/payment-pending - Get students who paid for revaluation but AI not done yet
// These are the ones waiting in approval queue for admin to trigger AI correction
router.get('/payment-pending', async (req, res) => {
    try {
        // Get requests where payment is made but AI correction not yet done
        const requests = await Result.find({
            revaluationPayment: true,
            revaluationStatus: 'pending'
        }).select('studentId subjectCode marks originalMarks revaluationPayment revaluationStatus createdAt');

        res.json({
            success: true,
            count: requests.length,
            data: requests
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/trigger-ai-correction - Admin clicks button to trigger AI correction for a specific student
router.post('/trigger-ai-correction', async (req, res) => {
    try {
        const { resultId, studentId, subjectCode } = req.body;

        if (!resultId || !studentId || !subjectCode) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: resultId, studentId, subjectCode'
            });
        }

        const result = await Result.findById(resultId);
        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Result not found'
            });
        }

        // Ensure the result has payment marked and is in pending status
        if (!result.revaluationPayment || result.revaluationStatus !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'This result is not in correct state for AI correction'
            });
        }

        // Ensure we have an answer script
        if (!result.answerScript) {
            return res.status(400).json({
                success: false,
                message: 'No answer script found for this subject. Cannot proceed with AI Correction.'
            });
        }

        const absolutePdfPath = require('path').join(__dirname, '..', result.answerScript);
        const fs = require('fs');

        if (!fs.existsSync(absolutePdfPath)) {
            console.warn(`File missing at ${absolutePdfPath}`);
            if (!fs.existsSync(result.answerScript)) {
                return res.status(404).json({
                    success: false,
                    message: 'Answer script file is missing on server.'
                });
            }
        }

        // Set status to processing
        result.revaluationStatus = 'processing';
        await result.save();

        // Call the AI Module (Python script)
        const { spawn } = require('child_process');
        const path = require('path');
        const QuestionPaper = require('../models/QuestionPaper');

        const scriptPath = path.join(__dirname, '..', 'ai-module', 'revaluation.py');

        // Try to load rubric for this subject from QuestionPaper collection
        let rubricForPython = {};
        try {
            const paper = await QuestionPaper.findOne({ subjectCode: result.subjectCode });
            if (paper && paper.questions && paper.questions.length > 0) {
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

        // Spawn Python and send rubric JSON to stdin
        const pythonProcess = spawn('python', [scriptPath, "", absolutePdfPath]);

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
                const jsonStartIndex = dataString.indexOf('[');
                const jsonEndIndex = dataString.lastIndexOf(']');

                if (jsonStartIndex === -1 || jsonEndIndex === -1) {
                    throw new Error("No JSON array found in output");
                }

                const jsonStr = dataString.substring(jsonStartIndex, jsonEndIndex + 1);
                const aiResults = JSON.parse(jsonStr);

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

                console.log(`✅ AI Correction completed for ${studentId} - ${subjectCode}`);

            } catch (parseError) {
                console.error("Failed to parse Python output:", dataString);
                // Revert status if failed
                result.revaluationStatus = 'pending';
                await result.save();
            }
        });

        // Return immediately - AI processing happens in background
        res.json({
            success: true,
            message: 'AI Correction started. Processing in background...',
            data: {
                resultId: result._id,
                studentId: result.studentId,
                subjectCode: result.subjectCode,
                status: 'processing'
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

// POST /api/admin/approve-chief-marks - Admin approves and selects which marks to post
// PROTECTED: Requires JWT token and admin role
router.post('/approve-chief-marks', verifyToken, checkRole(['admin']), async (req, res) => {
    try {
        const { resultId, adminId, selectedMarksType } = req.body; // 'ai' or 'chief'

        if (!resultId || !adminId || !selectedMarksType) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields'
            });
        }

        const result = await Result.findById(resultId);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result not found' });
        }

        if (result.revaluationStatus !== 'pending_approval') {
            return res.status(400).json({
                success: false,
                message: 'This result is not pending admin approval'
            });
        }

        let finalSelectedMarks = selectedMarksType === 'ai' ? result.aiMarks : result.chiefMarks;

        if (finalSelectedMarks === undefined || finalSelectedMarks === null) {
            return res.status(400).json({
                success: false,
                message: 'Selected marks are not available'
            });
        }

        // Final Logic: Automatically select highest marks
        let isRevised = false;
        if (result.originalMarks !== null && result.originalMarks >= finalSelectedMarks) {
            finalSelectedMarks = result.originalMarks;
        } else {
            isRevised = true;
        }

        // Apply marks and grade
        result.finalMarks = finalSelectedMarks;
        result.marks = finalSelectedMarks; // Update original marks field for Student Portal display
        result.status = finalSelectedMarks >= 40 ? 'PASS' : 'FAIL';
        result.grade = finalSelectedMarks >= 90 ? 'A' : finalSelectedMarks >= 75 ? 'B' : finalSelectedMarks >= 60 ? 'C' : finalSelectedMarks >= 40 ? 'D' : 'F';

        result.revaluationStatus = 'completed';
        result.approvedBy = adminId;
        result.approvedAt = new Date();

        await result.save();

        // Notify student
        const notif = new Notification({
            audience: ['student', result.studentId],
            title: `Revaluation Completed`,
            message: `Your revaluation for ${result.subjectCode} has been completed. Final marks: ${result.finalMarks}`,
            type: 'revaluation_result',
            relatedId: result._id,
            date: new Date()
        });
        await notif.save();

        res.json({
            success: true,
            message: `Marks approved and successfully posted`,
            data: result
        });

    } catch (err) {
        console.error('Error approving chief marks:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/admin/approve-reval (OLDER ENDPOINT - NOW DEPRECATED, kept for backward compat)
router.post('/approve-reval', async (req, res) => {
    const { resultId, action } = req.body; // action: 'approve' | 'reject'
    try {
        const result = await Result.findById(resultId);
        if (!result) return res.status(404).json({ message: 'Result not found' });

        if (action === 'approve') {
            result.marks = result.aiMarks;
            // Recalculate Grade/Status
            result.status = result.marks >= 40 ? 'PASS' : 'FAIL';
            result.grade = result.marks >= 90 ? 'A' : result.marks >= 75 ? 'B' : result.marks >= 60 ? 'C' : result.marks >= 40 ? 'D' : 'F';
            result.revaluationStatus = 'completed';
        } else {
            result.revaluationStatus = 'completed';
        }

        await result.save();
        res.json({ success: true, message: `Revaluation ${action}d successfully` });

    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/admin/results
// Check Marks - Fetch all student results with optional filters
router.get('/results', async (req, res) => {
    try {
        const { studentId, subject } = req.query;
        let query = {};
        if (studentId) query.studentId = { $regex: studentId, $options: 'i' };
        if (subject) query.subjectCode = { $regex: subject, $options: 'i' };

        const results = await Result.find(query);
        res.json(results);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// GET /api/admin/results - Get all student results with optional filtering
router.get('/results', async (req, res) => {
    try {
        const { studentId, subject } = req.query;
        let query = {};

        if (studentId && studentId.trim()) {
            query.studentId = studentId.trim();
        }
        if (subject && subject.trim()) {
            query.subjectCode = subject.trim().toUpperCase();
        }

        const results = await Result.find(query).sort({ createdAt: -1 });
        res.json(results);
    } catch (err) {
        console.error('Error fetching results:', err);
        res.status(500).json({ message: err.message });
    }
});

// GET /api/admin/payments
// Payment History - Fetch students who paid for revaluation
router.get('/payments', async (req, res) => {
    try {
        // Find results where payment is true meaning they paid
        const payments = await Result.find({ revaluationPayment: true });
        res.json(payments);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

module.exports = router;
