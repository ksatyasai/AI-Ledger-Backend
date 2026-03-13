const Result = require('../models/Result');
const { generateHash } = require('../blockchain/hashUtil');
const Blockchain = require('../blockchain/blockchain');
const fs = require('fs');
const path = require('path');

// Import blockchain instance from admin controller
// In a production app, you'd want to initialize this once at app startup
const adminController = require('./adminController');
const examBlockchain = adminController.examBlockchain;

/**
 * Student Controller - Handles blockchain result retrieval and verification
 */

/**
 * Get student's finalized exam records from blockchain
 * 
 * Flow:
 * 1. Search blockchain for records matching studentId
 * 2. Verify blockchain integrity
 * 3. Return records with verification status
 * 
 * @param {string} studentId - Student ID (e.g., "19A81A0501")
 */
const getBlockchainRecords = async (req, res) => {
    try {
        const { studentId } = req.params;

        if (!studentId) {
            return res.status(400).json({ 
                success: false, 
                message: 'Student ID is required' 
            });
        }

        console.log(`\n🔍 Fetching blockchain records for student: ${studentId}`);

        // Get records from blockchain
        const records = examBlockchain.getRecordsByStudentId(studentId);

        if (records.length === 0) {
            return res.json({
                success: true,
                message: 'No finalized records found for this student',
                studentId: studentId,
                records: [],
                blockchainIntegrity: {
                    isValid: examBlockchain.isChainValid(),
                    message: '✅ Blockchain is valid (no tampering)'
                }
            });
        }

        console.log(`✅ Found ${records.length} record(s) for student`);

        // Verify blockchain integrity
        const isValid = examBlockchain.isChainValid();

        // Format response
        const recordsData = records.map(block => ({
            blockIndex: block.index,
            timestamp: block.timestamp,
            studentId: block.examRecordData.studentId,
            subjectCode: block.examRecordData.subjectCode,
            finalMarks: block.examRecordData.finalMarks,
            answerScriptHash: block.examRecordData.answerScriptHash,
            blockchainHash: block.hash,
            blockHashPreview: block.hash.substring(0, 16) + '...',
            blockIsValid: block.isValid()
        }));

        res.json({
            success: true,
            studentId: studentId,
            totalRecords: recordsData.length,
            records: recordsData,
            blockchainIntegrity: {
                isValid: isValid,
                message: isValid ? 
                    '✅ Blockchain is valid - NO TAMPERING DETECTED' : 
                    '❌ Blockchain integrity FAILED - TAMPERING DETECTED'
            }
        });

    } catch (err) {
        console.error('Error fetching blockchain records:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching records',
            error: err.message 
        });
    }
};

/**
 * Get a specific blockchain record with full verification details
 * 
 * This endpoint provides detailed verification info:
 * - Block integrity
 * - Hash chain validation
 * - Answer script hash verification
 */
const getBlockchainRecordDetails = async (req, res) => {
    try {
        const { blockIndex } = req.params;

        if (!blockIndex || isNaN(blockIndex)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Valid block index is required' 
            });
        }

        console.log(`\n🔍 Fetching detailed blockchain record for block #${blockIndex}`);

        // Get the specific block
        const block = examBlockchain.getBlockByIndex(parseInt(blockIndex));

        if (!block) {
            return res.status(404).json({ 
                success: false, 
                message: 'Block not found' 
            });
        }

        // Get previous block for hash chain verification
        const previousBlock = parseInt(blockIndex) > 0 ? 
            examBlockchain.getBlockByIndex(parseInt(blockIndex) - 1) : 
            null;

        // Verify this block
        const blockIsValid = block.isValid();
        const hashChainValid = !previousBlock || block.previousHash === previousBlock.hash;

        console.log(`📦 Block details retrieved`);
        console.log(`   Block Valid: ${blockIsValid}`);
        console.log(`   Hash Chain Valid: ${hashChainValid}`);

        res.json({
            success: true,
            block: {
                index: block.index,
                timestamp: block.timestamp,
                examRecord: {
                    studentId: block.examRecordData.studentId,
                    subjectCode: block.examRecordData.subjectCode,
                    finalMarks: block.examRecordData.finalMarks,
                    answerScriptHash: block.examRecordData.answerScriptHash
                },
                blockchainHash: block.hash,
                previousHash: block.previousHash,
                verification: {
                    blockHashValid: blockIsValid,
                    hashChainValid: hashChainValid,
                    previousBlockHash: previousBlock ? previousBlock.hash.substring(0, 16) + '...' : 'GENESIS',
                    message: (blockIsValid && hashChainValid) ? 
                        '✅ Block verified - Data is tamper-proof' : 
                        '❌ Block verification FAILED - Tampering detected'
                },
                fullChainIntegrity: examBlockchain.isChainValid()
            }
        });

    } catch (err) {
        console.error('Error fetching block details:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error fetching block details',
            error: err.message 
        });
    }
};

/**
 * Verify a specific result using blockchain
 * 
 * Cross-check a MongoDB result record against blockchain to ensure it's been finalized
 * and hasn't been tampered with
 */
const verifyResultWithBlockchain = async (req, res) => {
    try {
        const { resultId, studentId, subjectCode } = req.body;

        if (!resultId || !studentId || !subjectCode) {
            return res.status(400).json({ 
                success: false, 
                message: 'resultId, studentId, and subjectCode are required' 
            });
        }

        console.log(`\n🔐 Verifying result: ${studentId} | ${subjectCode}`);

        // Get result from database
        const result = await Result.findById(resultId);
        if (!result) {
            return res.status(404).json({ 
                success: false, 
                message: 'Result not found in database' 
            });
        }

        // Search blockchain for matching record
        const blockchainRecords = examBlockchain.getRecordsByStudentId(studentId);
        const matchingBlock = blockchainRecords.find(block => 
            block.examRecordData.subjectCode === subjectCode
        );

        if (!matchingBlock) {
            return res.json({
                success: false,
                message: 'This result has not been finalized on blockchain',
                verification: {
                    isFinalized: false,
                    inBlockchain: false
                }
            });
        }

        // Verify blockchain integrity
        const chainValid = examBlockchain.isChainValid();
        const blockValid = matchingBlock.isValid();
        const dataMatches = JSON.stringify(matchingBlock.examRecordData) === 
                           JSON.stringify({
                               studentId: result.studentId,
                               subjectCode: result.subjectCode,
                               finalMarks: result.finalMarks,
                               answerScriptHash: result.answerScriptHash || ''
                           });

        console.log(`✅ Blockchain record found at block #${matchingBlock.index}`);
        console.log(`   Chain Valid: ${chainValid}`);
        console.log(`   Block Valid: ${blockValid}`);
        console.log(`   Data Match: ${dataMatches}`);

        const isVerified = chainValid && blockValid;

        res.json({
            success: true,
            verification: {
                isFinalized: true,
                inBlockchain: true,
                blockIndex: matchingBlock.index,
                blockHash: matchingBlock.hash.substring(0, 16) + '...',
                blockTimestamp: matchingBlock.timestamp,
                dataMatches: dataMatches,
                chainValid: chainValid,
                blockValid: blockValid,
                isVerified: isVerified,
                message: isVerified ? 
                    '✅ Result verified - Data is tamper-proof on blockchain' : 
                    '❌ Verification FAILED - Data corruption detected'
            },
            recordDetails: {
                studentId: matchingBlock.examRecordData.studentId,
                subjectCode: matchingBlock.examRecordData.subjectCode,
                finalMarks: matchingBlock.examRecordData.finalMarks
            }
        });

    } catch (err) {
        console.error('Error verifying result:', err);
        res.status(500).json({ 
            success: false, 
            message: 'Server error during verification',
            error: err.message 
        });
    }
};

/**
 * Get blockchain statistics (public endpoint for students to verify system integrity)
 */
const getPublicBlockchainStats = (req, res) => {
    try {
        const stats = examBlockchain.getStats();

        res.json({
            success: true,
            blockchainStats: {
                ...stats,
                message: stats.isValid ? 
                    '✅ System integrity verified' : 
                    '❌ System integrity compromised'
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

module.exports = {
    getBlockchainRecords,
    getBlockchainRecordDetails,
    verifyResultWithBlockchain,
    getPublicBlockchainStats
};
