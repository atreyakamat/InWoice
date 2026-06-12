const express = require('express');
const router = express.Router();
const { getTasks, addTask, updateTask } = require('../services/dbService');

router.get('/', async (req, res) => {
    const tasks = await getTasks();
    res.json(tasks);
});

router.post('/', async (req, res) => {
    const task = await addTask(req.body);
    res.json(task);
});

router.patch('/:id', async (req, res) => {
    await updateTask(req.params.id, req.body);
    res.json({ success: true });
});

module.exports = router;