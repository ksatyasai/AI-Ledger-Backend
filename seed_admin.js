const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) { console.error("Missing MONGO_URI"); process.exit(1); }

mongoose.connect(MONGO_URI)
    .then(() => console.log('MongoDB connected for admin seeding...'))
    .catch(err => console.log(err));

const seedAdmin = async () => {
    try {
        // Check if admin exists to avoid duplicate error or just upsert
        const adminId = 'ADMIN01';

        const existingAdmin = await User.findOne({ userId: adminId });
        if (existingAdmin) {
            console.log('Admin user already exists.');
        } else {
            const adminUser = new User({
                userId: adminId,
                password: 'password123', // Simple password for demo
                role: 'admin',
                name: 'System Administrator',
                department: 'Administration',
                email: 'admin@examchain.com'
            });

            await adminUser.save();
            console.log('✅ Admin user created successfully!');
        }

        process.exit();
    } catch (err) {
        console.error('Error creating admin:', err);
        process.exit(1);
    }
};

seedAdmin();
