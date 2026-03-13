const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // For parsing form data

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const connectDB = require('./config/db');

// Connect to MongoDB
connectDB();

// Routes
const authRoutes = require('./routes/authIds');
const studentRoutes = require('./routes/student');
const studentRoutesBlockchain = require('./routes/studentRoutes');
const facultyRoutes = require('./routes/faculty');
const adminRoutesBlockchain = require('./routes/adminRoutes');
const questionPaperRoutes = require('./routes/questionPaperRoutes');
const evaluationRoutes = require('./routes/evaluationRoutes');
const chiefRoutes = require('./routes/chief'); // Chief examiner routes

app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/student', studentRoutesBlockchain); // Blockchain routes for students
app.use('/api/faculty', facultyRoutes);
app.use('/api/chief', chiefRoutes); // Chief examiner workflow routes
app.use('/api/admin', require('./routes/admin'));
app.use('/api/admin', adminRoutesBlockchain); // Blockchain routes for admins
app.use('/api/admin', questionPaperRoutes); // Question paper management routes (CREATE, READ, UPDATE rubrics)
app.use('/api/evaluate', evaluationRoutes); // AI evaluation routes (EVALUATE answers against rubrics)

// Base Route
app.get('/', (req, res) => {
    res.send('ExamChain API is running...');
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
