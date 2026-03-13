const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken } = require('../middleware/authMiddleware');

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { userId, password, role } = req.body;

    try {
        // Find user by ID and Role
        const user = await User.findOne({ userId, role });

        if (!user) {
            return res.status(401).json({ success: false, message: 'User not found or incorrect role' });
        }

        // Check password with bcrypt
        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({ success: false, message: 'Invalid password' });
        }

        // Generate JWT token
        const token = generateToken(user.userId, user.role);

        // Return success with token
        res.json({
            success: true,
            token,
            user: {
                userId: user.userId,
                name: user.name,
                role: user.role,
                email: user.email,
                department: user.department
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Helper: Validate student roll number (format: 22MH1A0501 to 23MH1A05J7)
function isValidStudentRoll(rollNumber) {
    if (!rollNumber || !/^(22|23)MH1A05[0-9A-J][0-9A-J7]$/.test(rollNumber.toUpperCase())) {
        return false;
    }
    
    const roll = rollNumber.toUpperCase();
    const suffix = roll.substring(8); // Last 2 chars
    
    // Valid: 01-99, then A0-J7
    const numeric = parseInt(suffix);
    
    // Case 1: Both digits (01-99)
    if (!isNaN(numeric) && numeric >= 1 && numeric <= 99) {
        return true;
    }
    
    // Case 2: Letter + digit (A0-J7)
    if (suffix[0] >= 'A' && suffix[0] <= 'J') {
        if (suffix[0] === 'J' && parseInt(suffix[1]) > 7) return false;
        return !isNaN(parseInt(suffix[1]));
    }
    
    return false;
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { userId, password, role, name, department, rollNumber } = req.body;

    try {
        // Validate student roll number
        if (role === 'student') {
            if (!isValidStudentRoll(rollNumber)) {
                return res.status(403).json({ 
                    success: false, 
                    message: 'Unauthorized student registration',
                    reason: 'Roll number must be between 22MH1A0501 and 23MH1A05J7'
                });
            }
        }

        const existingUser = await User.findOne({ userId });
        if (existingUser) {
            return res.status(400).json({ success: false, message: 'User ID already exists' });
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const newUser = new User({
            userId,
            rollNumber: role === 'student' ? rollNumber.toUpperCase() : undefined,
            password: hashedPassword,
            role,
            name,
            department
        });

        await newUser.save();
        res.json({ success: true, message: 'Registration successful' });

    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// GET /api/auth/profile
// Fetch user profile by ID
router.get('/profile', async (req, res) => {
    const { userId } = req.query;
    try {
        const user = await User.findOne({ userId }).select('-password');
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// PUT /api/auth/profile
// Update user profile
router.put('/profile', async (req, res) => {
    const { userId, name, email, department, password } = req.body;
    try {
        const user = await User.findOne({ userId });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        if (name) user.name = name;
        if (email) user.email = email;
        if (department) user.department = department;
        
        // Hash password if provided
        if (password && password.trim() !== "") {
            const saltRounds = 10;
            user.password = await bcrypt.hash(password, saltRounds);
        }

        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                userId: user.userId,
                name: user.name,
                role: user.role,
                email: user.email,
                department: user.department
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

module.exports = router;
