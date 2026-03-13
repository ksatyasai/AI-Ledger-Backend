const { generateHash } = require('./hashUtil');

/**
 * Block class representing a single block in the blockchain
 * Each block contains an exam record with student info, marks, and answer script hash
 */
class Block {
    /**
     * @param {number} index - Block number in the chain
     * @param {object} examRecordData - Exam record data
     *   - studentId: Student ID
     *   - subjectCode: Subject code
     *   - finalMarks: Approved marks
     *   - answerScriptHash: SHA-256 hash of answer script text
     * @param {string} previousHash - Hash of the previous block (for genesis block, use '0')
     */
    constructor(index, examRecordData, previousHash = '0') {
        this.index = index;
        this.examRecordData = examRecordData;
        this.previousHash = previousHash;
        this.timestamp = new Date().toISOString();
        
        // Calculate hash for this block
        this.hash = this.calculateHash();
    }

    /**
     * Calculate SHA-256 hash for this block
     * Hash is based on: index + examRecordData + timestamp + previousHash
     * @returns {string} - The calculated hash
     */
    calculateHash() {
        const blockString = JSON.stringify({
            index: this.index,
            examRecordData: this.examRecordData,
            timestamp: this.timestamp,
            previousHash: this.previousHash
        });
        
        return generateHash(blockString);
    }

    /**
     * Verify if the block's hash is valid
     * @returns {boolean} - True if hash matches calculated hash
     */
    isValid() {
        return this.hash === this.calculateHash();
    }
}

module.exports = Block;
