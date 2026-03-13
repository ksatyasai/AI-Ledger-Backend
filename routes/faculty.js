const express = require('express');
const router = express.Router();
const Result = require('../models/Result');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');

// Configure Multer to save to a temp directory first, or directly if we trust fields
// We will simply use memory storage or a temp dir, then move it in the controller
// to ensure we have access to req.body.studentId and req.body.subjectName
const upload = multer({ dest: 'uploads/temp/' });

// GET /api/faculty/dashboard
router.get('/dashboard', (req, res) => {
    res.json({ message: 'Faculty dashboard data' });
});

// POST /api/faculty/results
// Use upload.any() to handle all multipart data, ensuring fields are parsed
router.post('/results', upload.any(), async (req, res) => {
    console.log('Received POST /results');
    console.log('Body:', req.body);
    console.log('Files:', req.files);

    const { studentId, subjectName, subjectCode, grade, marks, status, semester } = req.body;

    try {
        // Basic Validation
        if (!studentId || !subjectCode || !subjectName) {
            console.error('Missing required fields');
            // Clean up files if any
            if (req.files) {
                for (const f of req.files) await fs.remove(f.path);
            }
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        let answerScriptPath = null;

        // Find the specific file
        const pdfFile = req.files ? req.files.find(f => f.fieldname === 'pdfFile') : null;

        // Handle File Upload if present
        if (pdfFile) {
            // Sanitize names for file system
            const safeStudentId = studentId.replace(/[^a-zA-Z0-9]/g, '_');
            const safeSubjectName = subjectName.replace(/[^a-zA-Z0-9]/g, '_');
            const safeSubjectCode = subjectCode.replace(/[^a-zA-Z0-9]/g, '_');

            // Define final directory and filename
            const targetDir = path.join(__dirname, '..', 'uploads', safeStudentId);
            const targetFilename = `${safeSubjectCode}_${safeSubjectName}.pdf`;
            const targetPath = path.join(targetDir, targetFilename);

            // Ensure directory exists
            await fs.ensureDir(targetDir);

            // Move file
            await fs.move(pdfFile.path, targetPath, { overwrite: true });

            // Store relative path
            answerScriptPath = `uploads/${safeStudentId}/${targetFilename}`;
        }

        const newResult = new Result({
            studentId,
            subjectName,
            subjectCode,
            grade,
            marks,
            status,
            semester,
            revaluationStatus: 'none',
            revaluationPayment: false,
            answerScript: answerScriptPath
        });

        await newResult.save();
        res.json({ success: true, message: 'Result and Answer Script (if provided) saved successfully' });

    } catch (err) {
        console.error(err);
        // Clean up temp files if error occurs
        if (req.files) {
            for (const f of req.files) {
                if (await fs.pathExists(f.path)) await fs.remove(f.path);
            }
        }
        res.status(500).json({ success: false, message: 'Server error: ' + err.message });
    }
});

module.exports = router;
