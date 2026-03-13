const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

/**
 * Admin Routes for result approval and blockchain management
 */

// ===== RESULT APPROVAL FLOW =====

/**
 * GET /api/admin/pending-approvals
 * Fetch all exam results pending admin approval
 */
router.get('/pending-approvals', adminController.getPendingApprovals);

/**
 * POST /api/admin/approve-result
 * Approve exam result and add to blockchain
 * 
 * Request Body:
 * {
 *   "resultId": "MongoDB_ID",
 *   "approvedMarks": 75,
 *   "approvedBy": "admin@examchain.com"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "resultId": "...",
 *     "studentId": "19A81A0501",
 *     "subjectCode": "CS101",
 *     "approvedMarks": 75,
 *     "blockchainIndex": 5,
 *     "blockchainHash": "abc123...",
 *     "timestamp": "2026-02-17T..."
 *   }
 * }
 */
router.post('/approve-result', adminController.approveResultAndAddToBlockchain);

/**
 * POST /api/admin/reject-result
 * Reject exam result without adding to blockchain
 * 
 * Request Body:
 * {
 *   "resultId": "MongoDB_ID",
 *   "reason": "Insufficient supporting documentation"
 * }
 */
router.post('/reject-result', adminController.rejectResult);

// ===== BLOCKCHAIN VERIFICATION =====

/**
 * GET /api/admin/blockchain/stats
 * Get blockchain statistics and integrity status
 * 
 * Response:
 * {
 *   "success": true,
 *   "data": {
 *     "totalBlocks": 12,
 *     "genesisBlockHash": "abc123...",
 *     "latestBlockHash": "xyz789...",
 *     "isValid": true,
 *     "createdAt": "2026-02-17T..."
 *   }
 * }
 */
router.get('/blockchain/stats', adminController.getBlockchainStats);

/**
 * GET /api/admin/blockchain/view
 * Get entire blockchain for admin verification
 * 
 * Response:
 * {
 *   "success": true,
 *   "totalBlocks": 12,
 *   "chain": [
 *     {
 *       "index": 0,
 *       "timestamp": "2026-02-17T...",
 *       "examRecord": {...},
 *       "hash": "abc123...",
 *       "previousHash": "0",
 *       "isValid": true
 *     },
 *     ...
 *   ]
 * }
 */
router.get('/blockchain/view', adminController.getFullBlockchain);

/**
 * GET /api/admin/blockchain/verify
 * Verify blockchain integrity and detect tampering
 * 
 * Response (if valid):
 * {
 *   "success": true,
 *   "message": "✅ Blockchain integrity verified - No tampering detected",
 *   "isValid": true,
 *   "stats": {...}
 * }
 * 
 * Response (if tampered):
 * {
 *   "success": false,
 *   "message": "❌ Blockchain integrity check FAILED - Tampering detected!",
 *   "isValid": false,
 *   "stats": {...}
 * }
 */
router.get('/blockchain/verify', adminController.verifyBlockchainIntegrity);

/**
 * GET /api/admin/blockchain/student/:studentId
 * Get all blockchain records for a specific student
 * 
 * Response:
 * {
 *   "success": true,
 *   "studentId": "19A81A0501",
 *   "totalRecords": 4,
 *   "data": [
 *     {
 *       "index": 3,
 *       "timestamp": "2026-02-17T...",
 *       "examRecord": {
 *         "studentId": "19A81A0501",
 *         "subjectCode": "CS101",
 *         "finalMarks": 75,
 *         "answerScriptHash": "..."
 *       },
 *       "hash": "abc123..."
 *     }
 *   ]
 * }
 */
router.get('/blockchain/student/:studentId', adminController.getBlockchainRecordsByStudent);

module.exports = router;
