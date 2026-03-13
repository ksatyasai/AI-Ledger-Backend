const Result = require('../models/Result');
const { generateHash } = require('../blockchain/hashUtil');
const Blockchain = require('../blockchain/blockchain');
const fs = require('fs');
const path = require('path');

// Initialize blockchain instance (single instance for entire app)
const examBlockchain = new Blockchain();

/**
 * Admin Controller - Handles exam record approval and blockchain integration
 */

/**
 * Get all pending approvals
 * Fetch results that have revaluationStatus as 'pending_approval'
 */
const getPendingApprovals = async (req, res) => {
    try {
        // Find results pending admin approval
        const pendingResults = await Result.find({ 
            revaluationStatus: 'pending_approval' 
        }).sort({ _id: -1 });

        res.json({
            success: true,
            count: pendingResults.length,
            data: pendingResults
        });
    } catch (err) {
        console.error('Error fetching pending approvals:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching pending approvals' 
        });
    }
};

/**
 * Approve exam result and add to blockchain
 * 
 * Flow:
 * 1. Validate the result exists
 * 2. Generate hash of answer script text/OCR
 * 3. Create exam record object
 * 4. Add block to blockchain
 * 5. Update database with blockchain reference
 * 6. Mark as completed
 * 
 * @param {string} resultId - MongoDB result ID
 * @param {number} approvedMarks - Final approved marks
 * @param {string} approvedBy - Admin ID approving the result
 */
const approveResultAndAddToBlockchain = async (req, res) => {
    const { resultId, approvedMarks, approvedBy } = req.body;

    try {
        // Validate input
        if (!resultId || approvedMarks === undefined) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing resultId or approvedMarks' 
            });
        }

        // Fetch the result from database
        const result = await Result.findById(resultId);
        if (!result) {
            return res.status(404).json({ 
                success: false, 
                message: 'Result not found' 
            });
        }

        console.log(`\n📋 Processing approval for: ${result.studentId} | ${result.subjectCode}`);

        // ===== STEP 1: Generate hash of answer script text =====
        // If answerScript file exists, read and hash it
        // Otherwise, hash the existing aiBreakdown (OCR output)
        let answerScriptHash = 'no_script_provided';

        if (result.answerScript) {
            try {
                const filePath = path.join(__dirname, '../../', result.answerScript);
                if (fs.existsSync(filePath)) {
                    // For PDF files, we'd normally use OCR text
                    // For demo purposes, we'll create a hash from file metadata
                    const fileStats = fs.statSync(filePath);
                    const fileMetadata = JSON.stringify({
                        filename: path.basename(filePath),
                        size: fileStats.size,
                        modified: fileStats.mtime
                    });
                    answerScriptHash = generateHash(fileMetadata);
                    console.log(`📄 Answer script hash generated: ${answerScriptHash.substring(0, 16)}...`);
                }
            } catch (err) {
                console.warn(`⚠️  Could not read answer script: ${err.message}`);
                // Hash the OCR breakdown if available
                if (result.aiBreakdown && result.aiBreakdown.length > 0) {
                    answerScriptHash = generateHash(JSON.stringify(result.aiBreakdown));
                    console.log(`🤖 Using OCR breakdown hash: ${answerScriptHash.substring(0, 16)}...`);
                }
            }
        } else if (result.aiBreakdown && result.aiBreakdown.length > 0) {
            // Hash the AI breakdown if no physical file
            answerScriptHash = generateHash(JSON.stringify(result.aiBreakdown));
            console.log(`🤖 Using OCR breakdown hash: ${answerScriptHash.substring(0, 16)}...`);
        }

        // ===== STEP 2: Create exam record object =====
        const examRecordData = {
            studentId: result.studentId,
            subjectCode: result.subjectCode,
            finalMarks: approvedMarks,
            answerScriptHash: answerScriptHash
        };

        console.log(`\n🔗 Exam Record:\n`, JSON.stringify(examRecordData, null, 2));

        // ===== STEP 3: Add block to blockchain =====
        const newBlock = examBlockchain.addBlock(examRecordData);

        console.log(`\n✅ Block added to blockchain`);
        console.log(`   Block Index: ${newBlock.index}`);
        console.log(`   Block Hash: ${newBlock.hash.substring(0, 16)}...`);

        // ===== STEP 4: Update database with blockchain reference =====
        result.revaluationStatus = 'completed';
        result.finalMarks = approvedMarks;
        result.approvedBy = approvedBy || 'admin';
        result.approvedAt = new Date();
        result.blockchainHash = newBlock.hash;
        result.blockchainIndex = newBlock.index;

        await result.save();

        console.log(`\n💾 Database updated with blockchain reference`);
        console.log(`   Blockchain Hash: ${newBlock.hash.substring(0, 16)}...`);
        console.log(`   Blockchain Index: ${newBlock.index}\n`);

        res.json({
            success: true,
            message: 'Result approved and added to blockchain',
            data: {
                resultId: result._id,
                studentId: result.studentId,
                subjectCode: result.subjectCode,
                approvedMarks: approvedMarks,
                blockchainIndex: newBlock.index,
                blockchainHash: newBlock.hash,
                timestamp: newBlock.timestamp
            }
        });

    } catch (err) {
        console.error('❌ Error during approval:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during approval',
            error: err.message 
        });
    }
};

/**
 * Reject an exam result (keep in database but mark as rejected)
 * Does NOT add to blockchain
 */
const rejectResult = async (req, res) => {
    const { resultId, reason } = req.body;

    try {
        if (!resultId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing resultId' 
            });
        }

        const result = await Result.findById(resultId);
        if (!result) {
            return res.status(404).json({ 
                success: false, 
                message: 'Result not found' 
            });
        }

        result.revaluationStatus = 'none';
        result.rejectionReason = reason || 'Rejected by admin';
        result.rejectedAt = new Date();

        await result.save();

        res.json({
            success: true,
            message: 'Result rejected',
            data: result
        });

    } catch (err) {
        console.error('Error rejecting result:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
};

/**
 * Get blockchain statistics and integrity status
 */
const getBlockchainStats = (req, res) => {
    try {
        const stats = examBlockchain.getStats();
        const isValid = examBlockchain.isChainValid();

        res.json({
            success: true,
            data: {
                ...stats,
                isValid: isValid
            }
        });

    } catch (err) {
        console.error('Error getting blockchain stats:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
};

/**
 * Get entire blockchain (for admin verification)
 */
const getFullBlockchain = (req, res) => {
    try {
        const chain = examBlockchain.getChain();

        res.json({
            success: true,
            totalBlocks: chain.length,
            chain: chain.map(block => ({
                index: block.index,
                timestamp: block.timestamp,
                examRecord: block.examRecordData,
                hash: block.hash,
                previousHash: block.previousHash,
                isValid: block.isValid()
            }))
        });

    } catch (err) {
        console.error('Error fetching blockchain:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
};

/**
 * Verify blockchain integrity (detect tampering)
 */
const verifyBlockchainIntegrity = (req, res) => {
    try {
        const isValid = examBlockchain.isChainValid();

        if (isValid) {
            res.json({
                success: true,
                message: '✅ Blockchain integrity verified - No tampering detected',
                isValid: true,
                stats: examBlockchain.getStats()
            });
        } else {
            res.json({
                success: false,
                message: '❌ Blockchain integrity check FAILED - Tampering detected!',
                isValid: false,
                stats: examBlockchain.getStats()
            });
        }

    } catch (err) {
        console.error('Error verifying blockchain:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
};

/**
 * Get blockchain records by student ID
 */
const getBlockchainRecordsByStudent = (req, res) => {
    try {
        const { studentId } = req.params;

        if (!studentId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Student ID required' 
            });
        }

        const records = examBlockchain.getRecordsByStudentId(studentId);

        res.json({
            success: true,
            studentId: studentId,
            totalRecords: records.length,
            data: records.map(block => ({
                index: block.index,
                timestamp: block.timestamp,
                examRecord: block.examRecordData,
                hash: block.hash.substring(0, 16) + '...'
            }))
        });

    } catch (err) {
        console.error('Error fetching student records:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error' 
        });
    }
};

module.exports = {
    getPendingApprovals,
    approveResultAndAddToBlockchain,
    rejectResult,
    getBlockchainStats,
    getFullBlockchain,
    verifyBlockchainIntegrity,
    getBlockchainRecordsByStudent,
    // Export blockchain instance for persistence (optional)
    examBlockchain
};
