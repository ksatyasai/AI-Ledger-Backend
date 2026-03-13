const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const MONGO_URI = process.env.MONGO_URI;
        if (!MONGO_URI) {
            console.error("❌ MONGO_URI environment variable is missing.");
            process.exit(1);
        }
        
        const conn = await mongoose.connect(MONGO_URI);
        console.log(`✅ MongoDB connected successfully to ${conn.connection.host}`);
    } catch (error) {
        console.error(`❌ MongoDB connection error: ${error.message}`);
        process.exit(1);
    }
};

module.exports = connectDB;
