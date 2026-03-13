const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true }, // Student ID (e.g., 22MH1A0501...) or Faculty ID or Chief ID
    rollNumber: { type: String }, // For students: 22MH1A0501 to 23MH1A05J7 format
    password: { type: String, required: true }, // In real app, hash this!
    role: { type: String, enum: ['student', 'faculty', 'admin', 'chief'], required: true },
    name: { type: String, required: true },
    email: { type: String },
    department: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// Helper function to validate student roll number
// Format: 22MH1A0501 to 23MH1A05J7
userSchema.methods.validateRollNumber = function() {
    if (this.role !== 'student') return true;
    if (!this.rollNumber || !/^(22|23)MH1A05[0-9A-J][0-9A-J7]$/.test(this.rollNumber)) return false;
    
    const roll = this.rollNumber.toUpperCase();
    const prefix = roll.substring(0, 8); // 22MH1A05 or 23MH1A05
    const suffix = roll.substring(8); // Last 2 chars (XX)
    
    // Must start with 22MH1A05 or 23MH1A05
    if (prefix !== '22MH1A05' && prefix !== '23MH1A05') return false;
    
    // Valid range: 01 to 99, then A0 to J7
    const numeric = parseInt(suffix);
    const alpha = suffix.charCodeAt(0);
    const digit = parseInt(suffix[1]);
    
    // Case 1: Numeric only (01-99)
    if (!isNaN(numeric) && numeric >= 1 && numeric <= 99) return true;
    
    // Case 2: Alpha + digit (A0-J7)
    if (alpha >= 65 && alpha <= 74) { // A-J
        if (alpha === 74 && digit > 7) return false; // J must be 0-7
        return true;
    }
    
    return false;
};

module.exports = mongoose.model('User', userSchema);
