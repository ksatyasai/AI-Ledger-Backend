const mongoose = require('mongoose');
const User = require('./models/User');
const Result = require('./models/Result');
const Notification = require('./models/Notification');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error("Missing MONGO_URI"); process.exit(1); }

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected for seeding...'))
    .catch(err => console.log(err));

const seedData = async () => {
    try {
        // Clear existing data
        await User.deleteMany({});
        await Result.deleteMany({});
        await Notification.deleteMany({});

        // Hash passwords before inserting
        const saltRounds = 10;
        
        const users = [
            { 
                userId: '19A81A0501', 
                password: await bcrypt.hash('password123', saltRounds), 
                role: 'student', 
                name: 'Satyasai', 
                department: 'CSE',
                rollNumber: '22MH1A0501'
            },
            { 
                userId: '19A81A0502', 
                password: await bcrypt.hash('password123', saltRounds), 
                role: 'student', 
                name: 'John Doe', 
                department: 'CSE',
                rollNumber: '22MH1A0502'
            },
            { 
                userId: 'FAC001', 
                password: await bcrypt.hash('admin123', saltRounds), 
                role: 'faculty', 
                name: 'Dr. Smith', 
                department: 'CSE'
            },
            { 
                userId: 'CHIEF001', 
                password: await bcrypt.hash('chief123', saltRounds), 
                role: 'chief', 
                name: 'Dr. Chief Examiner', 
                department: 'CSE'
            },
            { 
                userId: 'ADMIN001', 
                password: await bcrypt.hash('adminpass123', saltRounds), 
                role: 'admin', 
                name: 'Admin User', 
                department: 'Administration'
            }
        ];
        await User.insertMany(users);
        console.log('✅ Users seeded with hashed passwords');

        // Results
        const results = [
            { studentId: '19A81A0501', subjectName: 'Cryptography', subjectCode: 'CS401', grade: 'A', marks: 85, status: 'PASS', semester: 4 },
            { studentId: '19A81A0501', subjectName: 'Distributed Systems', subjectCode: 'CS402', grade: 'F', marks: 28, status: 'FAIL', semester: 4 },
            { studentId: '19A81A0501', subjectName: 'Data Mining', subjectCode: 'CS403', grade: 'B+', marks: 72, status: 'PASS', semester: 4 }
        ];
        await Result.insertMany(results);
        console.log('Results seeded');

        // Notifications
        const notifications = [
            { title: 'Exam Results Released', message: 'Semester 4 regular exam results are now available.', date: new Date('2026-01-28') },
            { title: 'Revaluation Fee Date', message: 'Last date for revaluation fee payment is Feb 15th.', date: new Date('2026-01-30') }
        ];
        await Notification.insertMany(notifications);
        console.log('Notifications seeded');

        console.log('✅ Seeding complete!');
        process.exit();
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

seedData();
