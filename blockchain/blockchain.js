const Block = require('./block');
const { generateHash } = require('./hashUtil');

/**
 * Private Blockchain implementation for storing finalized exam records
 * Immutable, tamper-proof storage of approved exam results
 */
class Blockchain {
    constructor() {
        this.chain = [];
        this.createGenesisBlock();
    }

    /**
     * Create the first block (genesis block) of the blockchain
     * Genesis block has index 0, previousHash '0', and special genesis data
     */
    createGenesisBlock() {
        const genesisData = {
            studentId: 'GENESIS',
            subjectCode: 'GENESIS',
            finalMarks: 0,
            answerScriptHash: 'genesis_block'
        };
        const genesisBlock = new Block(0, genesisData, '0');
        this.chain.push(genesisBlock);
        console.log('✅ Genesis block created');
    }

    /**
     * Add a new exam record block to the blockchain
     * Only call this after admin approval
     * @param {object} examRecordData - Exam record object
     *   - studentId: Student ID (e.g., "19A81A0501")
     *   - subjectCode: Subject code (e.g., "CS101")
     *   - finalMarks: Approved final marks
     *   - answerScriptHash: SHA-256 hash of OCR extracted answer text
     * @returns {Block} - The newly created block
     */
    addBlock(examRecordData) {
        // Validate exam record data
        if (!examRecordData.studentId || !examRecordData.subjectCode || 
            examRecordData.finalMarks === undefined || !examRecordData.answerScriptHash) {
            throw new Error('Invalid exam record data. Required: studentId, subjectCode, finalMarks, answerScriptHash');
        }

        // Get the previous block's hash
        const previousBlock = this.chain[this.chain.length - 1];
        const previousHash = previousBlock.hash;

        // Create new block
        const newBlockIndex = this.chain.length;
        const newBlock = new Block(newBlockIndex, examRecordData, previousHash);

        // Add block to chain
        this.chain.push(newBlock);
        console.log(`✅ Block #${newBlockIndex} added | Student: ${examRecordData.studentId} | Subject: ${examRecordData.subjectCode}`);

        return newBlock;
    }

    /**
     * Get the last block in the chain
     * @returns {Block} - The last block
     */
    getLatestBlock() {
        return this.chain[this.chain.length - 1];
    }

    /**
     * Get entire blockchain
     * @returns {array} - Full chain of blocks
     */
    getChain() {
        return this.chain;
    }

    /**
     * Get a specific block by index
     * @param {number} index - Block index
     * @returns {Block|null} - Block object or null if not found
     */
    getBlockByIndex(index) {
        if (index < 0 || index >= this.chain.length) {
            return null;
        }
        return this.chain[index];
    }

    /**
     * Search for exam records by student ID
     * @param {string} studentId - Student ID to search
     * @returns {array} - Array of blocks containing this student's records
     */
    getRecordsByStudentId(studentId) {
        return this.chain.filter(block => 
            block.examRecordData.studentId === studentId
        );
    }

    /**
     * Search for exam records by subject code
     * @param {string} subjectCode - Subject code to search
     * @returns {array} - Array of blocks containing this subject
     */
    getRecordsBySubjectCode(subjectCode) {
        return this.chain.filter(block => 
            block.examRecordData.subjectCode === subjectCode
        );
    }

    /**
     * Verify blockchain integrity
     * Checks that:
     * 1. Each block's hash is valid
     * 2. Each block's previousHash matches the actual previous block's hash
     * 3. Genesis block is at index 0
     * @returns {boolean} - True if blockchain is valid, false if tampering detected
     */
    isChainValid() {
        // Check genesis block
        if (this.chain.length === 0) {
            console.warn('⚠️  Blockchain is empty');
            return false;
        }

        const genesisBlock = this.chain[0];
        if (genesisBlock.index !== 0 || genesisBlock.previousHash !== '0') {
            console.warn('❌ Genesis block is invalid');
            return false;
        }

        // Verify each block
        for (let i = 1; i < this.chain.length; i++) {
            const currentBlock = this.chain[i];
            const previousBlock = this.chain[i - 1];

            // Check if current block's hash is valid
            if (!currentBlock.isValid()) {
                console.warn(`❌ Block #${i} hash is invalid (tampering detected)`);
                return false;
            }

            // Check if previousHash matches
            if (currentBlock.previousHash !== previousBlock.hash) {
                console.warn(`❌ Block #${i} previousHash doesn't match previous block's hash (tampering detected)`);
                return false;
            }

            // Check index continuity
            if (currentBlock.index !== i) {
                console.warn(`❌ Block #${i} has invalid index`);
                return false;
            }
        }

        console.log('✅ Blockchain integrity verified - Chain is valid');
        return true;
    }

    /**
     * Get blockchain statistics
     * @returns {object} - Statistics about the blockchain
     */
    getStats() {
        return {
            totalBlocks: this.chain.length,
            genesisBlockHash: this.chain[0].hash,
            latestBlockHash: this.getLatestBlock().hash,
            isValid: this.isChainValid(),
            createdAt: this.chain[0].timestamp
        };
    }
}

module.exports = Blockchain;
