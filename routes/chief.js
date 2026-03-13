const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Result = require('../models/Result');
const User = require('../models/User');
const Chief = require('../models/Chief');
const Notification = require('../models/Notification');
const { generateToken, verifyToken, checkRole } = require('../middleware/authMiddleware');

/**
 * ============================================================
 * CHIEF AUTHENTICATION ROUTES
 * ============================================================
 */

// POST /api/chief/register - Register a new Chief examiner
router.post('/register', async (req, res) => {
    try {
        const { chiefId, password, name, email, department, subject } = req.body;

        if (!chiefId || !password || !name) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chiefId, password, name'
            });
        }

        // Check if chief ID already exists
        const existingUser = await User.findOne({ userId: chiefId });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Chief ID already exists' 
            });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user record
        const newUser = new User({
            userId: chiefId,
            password: hashedPassword,
            role: 'chief',
            name,
            email,
            department
        });
        await newUser.save();

        // Create chief profile record
        const newChief = new Chief({
            chiefId,
            name,
            email,
            department,
            subject,
            isActive: true
        });
        await newChief.save();

        res.json({
            success: true,
            message: 'Chief registration successful'
        });

    } catch (err) {
        console.error('Chief registration error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/chief/login - Login for Chief examiner
router.post('/login', async (req, res) => {
    try {
        const { chiefId, password } = req.body;

        if (!chiefId || !password) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chiefId, password'
            });
        }

        // Find user by chiefId with role: chief
        const user = await User.findOne({ userId: chiefId, role: 'chief' });
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Chief ID not found' 
            });
        }

        // Check password with bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid password' 
            });
        }

        // Generate JWT token
        const token = generateToken(user.userId, user.role);

        // Get chief profile
        const chief = await Chief.findOne({ chiefId });

        res.json({
            success: true,
            token,
            user: {
                userId: user.userId,
                chiefId: chiefId,
                name: user.name,
                role: user.role,
                email: user.email,
                department: user.department,
                subject: chief?.subject
            }
        });

    } catch (err) {
        console.error('Chief login error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * ============================================================
 * CHIEF EXAMINER ROUTES
 * ============================================================
 * Routes for Chief Examiners to:
 * - Receive assignments
 * - View student details and AI marks
 * - Submit corrected marks
 * - View notifications
 */

// GET /api/chief/assignments - Get all assignments for a chief
// PROTECTED: Requires JWT token
router.get('/assignments/:chiefId', verifyToken, checkRole(['chief']), async (req, res) => {
    try {
        const { chiefId } = req.params;

        // Verify the chief is requesting their own data
        if (req.userId !== chiefId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Cannot view other chief assignments'
            });
        }

        // Fetch all results assigned to this chief with pending/processing status
        const assignments = await Result.find({
            assignedChief: chiefId,
            revaluationStatus: { $in: ['pending_chief', 'processing'] }
        }).populate('studentId', 'name rollNumber');

        res.json({
            success: true,
            count: assignments.length,
            data: assignments
        });
    } catch (err) {
        console.error('Error fetching assignments:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/chief/assignment/:resultId - Get detailed view of one assignment
// PROTECTED: Requires JWT token
router.get('/assignment/:resultId', verifyToken, checkRole(['chief']), async (req, res) => {
    try {
        const { resultId } = req.params;

        const result = await Result.findById(resultId);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Assignment not found' });
        }

        // Fetch student details
        const student = await User.findOne({ userId: result.studentId }).select('-password');

        res.json({
            success: true,
            data: {
                // Flatten the result fields for easy access
                _id: result._id,
                studentId: result.studentId,
                subjectName: result.subjectName,
                subjectCode: result.subjectCode,
                originalMarks: result.marks,
                aiMarks: result.aiMarks,
                aiBreakdown: result.aiBreakdown,
                answerScriptPath: result.answerScript,
                revaluationStatus: result.revaluationStatus,
                
                // Chief marks fields
                chiefMarks: result.chiefMarks,
                chiefBreakdown: result.chiefBreakdown,
                chiefComments: result.chiefComments,
                
                // Student info
                studentName: student?.name || 'N/A',
                rollNumber: student?.rollNumber || 'N/A'
            }
        });
    } catch (err) {
        console.error('Error fetching assignment details:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// POST /api/chief/submit-marks - Chief submits corrected marks
// PROTECTED: Requires JWT token
router.post('/submit-marks', verifyToken, checkRole(['chief']), async (req, res) => {
    try {
        const { resultId, chiefId, marks, breakdown, comments } = req.body;

        // Verify chief is submitting for themselves
        if (req.userId !== chiefId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Cannot submit marks for another chief'
            });
        }

        if (!resultId || !chiefId || marks === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing required fields: resultId, chiefId, marks'
            });
        }

        const result = await Result.findById(resultId);
        if (!result) {
            return res.status(404).json({ success: false, message: 'Result not found' });
        }

        // Verify this result is assigned to this chief
        if (result.assignedChief !== chiefId) {
            return res.status(403).json({ 
                success: false, 
                message: 'This assignment is not assigned to you'
            });
        }

        // Update result with chief marks
        result.chiefMarks = marks;
        result.chiefBreakdown = breakdown || [];
        result.chiefComments = comments || null;
        result.chiefSubmittedAt = new Date();
        result.revaluationStatus = 'pending_approval'; // Now waiting for admin approval

        await result.save();

        // Create notification for admin
        const chief = await User.findOne({ userId: chiefId });
        const notif = new Notification({
            audience: ['admin'],
            title: 'Chief Marks Submitted',
            message: `Chief ${chief?.name || chiefId} has submitted marks for ${result.studentId} - ${result.subjectCode}`,
            type: 'chief_marks_submitted',
            relatedId: result._id,
            date: new Date()
        });
        await notif.save();

        res.json({
            success: true,
            message: 'Marks submitted successfully. Awaiting admin approval.',
            data: result
        });

    } catch (err) {
        console.error('Error submitting marks:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/chief/notifications/:chiefId - Get notifications for chief
// PROTECTED: Requires JWT token
router.get('/notifications/:chiefId', verifyToken, checkRole(['chief']), async (req, res) => {
    try {
        const { chiefId } = req.params;

        // Verify chief is requesting their own notifications
        if (req.userId !== chiefId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Cannot view other chief notifications'
            });
        }

        const notifications = await Notification.find({
            audience: { $in: ['all', 'chief', chiefId] }
        }).sort({ date: -1 }).limit(20);

        res.json({
            success: true,
            count: notifications.length,
            data: notifications
        });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// GET /api/chief/profile/:chiefId - Get chief profile
// PROTECTED: Requires JWT token
router.get('/profile/:chiefId', verifyToken, checkRole(['chief']), async (req, res) => {
    try {
        const { chiefId } = req.params;

        // Verify chief is requesting their own profile
        if (req.userId !== chiefId) {
            return res.status(403).json({
                success: false,
                message: 'Unauthorized: Cannot view other chief profile'
            });
        }

        const chiefUser = await User.findOne({ userId: chiefId }).select('-password');
        const chiefProfile = await Chief.findOne({ chiefId });
        
        if (!chiefUser && !chiefProfile) {
            return res.status(404).json({ success: false, message: 'Chief not found' });
        }

        const pendingCount = await Result.countDocuments({
            assignedChief: chiefId,
            revaluationStatus: { $in: ['pending_chief', 'processing'] }
        });

        const submittedCount = await Result.countDocuments({
            assignedChief: chiefId,
            revaluationStatus: 'pending_approval'
        });

        const approvedCount = await Result.countDocuments({
            assignedChief: chiefId,
            revaluationStatus: 'completed'
        });

        res.json({
            success: true,
            data: {
                ...chiefUser?.toObject(),
                ...chiefProfile?.toObject(),
                pendingCount,
                submittedCount,
                approvedCount
            }
        });
    } catch (err) {
        console.error('Error fetching chief profile:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

module.exports = router;
