const crypto = require('crypto');

/**
 * Utility function to generate SHA-256 hashes
 * @param {string|object} data - Data to hash (string or JSON object)
 * @returns {string} - Hexadecimal hash string
 */
function generateHash(data) {
    // Convert object to JSON string if necessary
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    
    // Generate SHA-256 hash
    return crypto.createHash('sha256').update(dataString).digest('hex');
}

module.exports = { generateHash };
