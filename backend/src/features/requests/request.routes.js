const express = require('express');
const router = express.Router();
const requestController = require('./request.controller');

router.post('/send', requestController.sendRequest);
router.post('/respond', requestController.respondRequest);
router.get('/pending/:userId', requestController.getPendingRequests);

module.exports = router;
