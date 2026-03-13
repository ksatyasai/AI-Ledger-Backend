const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');

/**
 * Student Routes for blockchain record retrieval and verification
 */

/**
 * GET /api/student/blockchain-records/:studentId
 * Get all finalized exam records for a student from blockchain
 * 
 * Response:
 * {
 *   "success": true,
 *   "studentId": "19A81A0501",
 *   "totalRecords": 3,
 *   "records": [
 *     {
 *       "blockIndex": 2,
 *       "timestamp": "2026-02-17T...",
 *       "studentId": "19A81A0501",
 *       "subjectCode": "CS101",
 *       "finalMarks": 75,
 *       "answerScriptHash": "abc123...",
 *       "blockchainHash": "xyz789...",
 *       "blockHashPreview": "xyz789abc123...",
 *       "blockIsValid": true
 *     }
 *   ],
 *   "blockchainIntegrity": {
 *     "isValid": true,
 *     "message": "✅ Blockchain is valid - NO TAMPERING DETECTED"
 *   }
 * }
 */
router.get('/blockchain-records/:studentId', studentController.getBlockchainRecords);

/**
 * GET /api/student/blockchain-record/:blockIndex
 * Get detailed information about a specific blockchain block
 * 
 * Response:
 * {
 *   "success": true,
 *   "block": {
 *     "index": 2,
 *     "timestamp": "2026-02-17T...",
 *     "examRecord": {
 *       "studentId": "19A81A0501",
 *       "subjectCode": "CS101",
 *       "finalMarks": 75,
 *       "answerScriptHash": "..."
 *     },
 *     "blockchainHash": "xyz789...",
 *     "previousHash": "abc123...",
 *     "verification": {
 *       "blockHashValid": true,
 *       "hashChainValid": true,
 *       "previousBlockHash": "abc123...",
 *       "message": "✅ Block verified - Data is tamper-proof"
 *     },
 *     "fullChainIntegrity": true
 *   }
 * }
 */
router.get('/blockchain-record/:blockIndex', studentController.getBlockchainRecordDetails);

/**
 * POST /api/student/verify-result
 * Verify a specific result using blockchain
 * Cross-check database record against blockchain to ensure finalization
 * 
 * Request Body:
 * {
 *   "resultId": "MongoDB_ID",
 *   "studentId": "19A81A0501",
 *   "subjectCode": "CS101"
 * }
 * 
 * Response (if verified):
 * {
 *   "success": true,
 *   "verification": {
 *     "isFinalized": true,
 *     "inBlockchain": true,
 *     "blockIndex": 2,
 *     "blockHash": "xyz789abc123...",
 *     "blockTimestamp": "2026-02-17T...",
 *     "dataMatches": true,
 *     "chainValid": true,
 *     "blockValid": true,
 *     "isVerified": true,
 *     "message": "✅ Result verified - Data is tamper-proof on blockchain"
 *   }
 * }
 */
router.post('/verify-result', studentController.verifyResultWithBlockchain);

/**
 * GET /api/student/blockchain-stats
 * Get public blockchain statistics for system integrity verification
 * 
 * Response:
 * {
 *   "success": true,
 *   "blockchainStats": {
 *     "totalBlocks": 12,
 *     "genesisBlockHash": "abc123...",
 *     "latestBlockHash": "xyz789...",
 *     "isValid": true,
 *     "createdAt": "2026-02-17T...",
 *     "message": "✅ System integrity verified"
 *   }
 * }
 */
router.get('/blockchain-stats', studentController.getPublicBlockchainStats);

module.exports = router;
