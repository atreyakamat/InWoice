const express = require('express');
const router = express.Router();
const { getMarketingPosts, addMarketingPost, updateMarketingPost, deleteMarketingPost } = require('../services/dbService');

router.get('/', async (req, res) => {
    try {
        const posts = await getMarketingPosts();
        res.json(posts);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch posts.' });
    }
});

router.post('/', async (req, res) => {
    try {
        const { content, platforms, scheduledAt, status } = req.body;
        if (!content || !platforms || !scheduledAt) {
            return res.status(400).json({ error: 'Content, platforms, and scheduled date are required.' });
        }
        const post = await addMarketingPost({ content, platforms, scheduledAt, status });
        res.json(post);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create post.' });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const updated = await updateMarketingPost(req.params.id, req.body);
        res.json(updated);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to update post.' });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        await deleteMarketingPost(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to delete post.' });
    }
});

module.exports = router;
