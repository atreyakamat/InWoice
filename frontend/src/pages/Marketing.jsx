import React, { useState, useEffect } from 'react';
import { api, API_ENDPOINTS } from '../apiConfig';
import { Calendar, CheckCircle2, Clock, Trash2, Send, Sparkles } from 'lucide-react';

const Marketing = () => {
    const [posts, setPosts] = useState([]);
    const [isCreating, setIsCreating] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);
    const [promptContext, setPromptContext] = useState('');
    const [newPost, setNewPost] = useState({
        content: '',
        platforms: ['LinkedIn'],
        scheduledAt: '',
    });
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        fetchPosts();
    }, []);

    const fetchPosts = async () => {
        setIsLoading(true);
        try {
            const data = await api.get(API_ENDPOINTS.MARKETING.LIST);
            setPosts(data);
        } catch (error) {
            console.error('Failed to fetch posts', error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreatePost = async () => {
        if (!newPost.content || !newPost.scheduledAt || newPost.platforms.length === 0) {
            alert('Please fill out all fields.');
            return;
        }
        try {
            await api.post(API_ENDPOINTS.MARKETING.LIST, newPost);
            setNewPost({ content: '', platforms: ['LinkedIn'], scheduledAt: '' });
            setIsCreating(false);
            fetchPosts();
        } catch (error) {
            console.error('Failed to create post', error);
            alert('Failed to schedule post.');
        }
    };

    const handleGenerateAI = async () => {
        setIsGenerating(true);
        try {
            const result = await api.post(API_ENDPOINTS.AI_MARKETING_PLAN, { context: promptContext });
            if (result && result.content) {
                setNewPost(prev => ({
                    ...prev,
                    content: result.content,
                    platforms: result.platforms && result.platforms.length > 0 ? result.platforms : prev.platforms
                }));
            }
        } catch (error) {
            console.error('Failed to generate marketing plan', error);
            alert('Failed to generate with AI.');
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDeletePost = async (id) => {
        if (!window.confirm('Delete this scheduled post?')) return;
        try {
            await api.delete(API_ENDPOINTS.MARKETING.UPDATE(id));
            fetchPosts();
        } catch (error) {
            console.error('Failed to delete post', error);
        }
    };

    const togglePlatform = (platform) => {
        setNewPost(prev => {
            const platforms = prev.platforms.includes(platform)
                ? prev.platforms.filter(p => p !== platform)
                : [...prev.platforms, platform];
            return { ...prev, platforms };
        });
    };

    const availablePlatforms = ['WhatsApp', 'Instagram', 'LinkedIn', 'YouTube', 'Twitter', 'Facebook'];

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Marketing & Social</h1>
                    <p className="text-gray-500 mt-1">Schedule and manage your social media announcements.</p>
                </div>
                <button
                    onClick={() => setIsCreating(!isCreating)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition"
                >
                    <Calendar size={18} />
                    <span>{isCreating ? 'Cancel' : 'Schedule Post'}</span>
                </button>
            </div>

            {isCreating && (
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8 animate-fade-in">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-bold text-gray-800">Create New Post</h2>
                        <div className="flex space-x-2">
                            <input 
                                type="text" 
                                placeholder="E.g., new summer collection launch"
                                className="px-3 py-1.5 border border-gray-200 rounded text-sm outline-none focus:border-blue-500"
                                value={promptContext}
                                onChange={(e) => setPromptContext(e.target.value)}
                            />
                            <button 
                                onClick={handleGenerateAI}
                                disabled={isGenerating}
                                className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 flex items-center space-x-1 text-sm font-medium transition disabled:opacity-50"
                            >
                                <Sparkles size={14} />
                                <span>{isGenerating ? 'Thinking...' : 'AI Plan'}</span>
                            </button>
                        </div>
                    </div>
                    <textarea
                        value={newPost.content}
                        onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                        placeholder="What do you want to share with your audience?"
                        className="w-full p-4 border border-gray-200 rounded-lg outline-none focus:border-blue-500 mb-4 min-h-[120px]"
                    />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Select Platforms</label>
                            <div className="flex flex-wrap gap-2">
                                {availablePlatforms.map(platform => (
                                    <button
                                        key={platform}
                                        onClick={() => togglePlatform(platform)}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition border ${
                                            newPost.platforms.includes(platform)
                                                ? 'bg-blue-50 border-blue-200 text-blue-700'
                                                : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                                        }`}
                                    >
                                        {platform}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Schedule Date & Time</label>
                            <input
                                type="datetime-local"
                                value={newPost.scheduledAt}
                                onChange={(e) => setNewPost({ ...newPost, scheduledAt: e.target.value })}
                                className="w-full p-2 border border-gray-200 rounded-lg outline-none focus:border-blue-500"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end">
                        <button
                            onClick={handleCreatePost}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 transition"
                        >
                            <Send size={16} />
                            <span>Schedule</span>
                        </button>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 bg-gray-50">
                    <h2 className="text-lg font-bold text-gray-800">Your Posts</h2>
                </div>
                
                {isLoading ? (
                    <div className="p-8 text-center text-gray-500">Loading posts...</div>
                ) : posts.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                        No scheduled posts found. Click "Schedule Post" to get started!
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {posts.map(post => {
                            const isPublished = post.status === 'Published';
                            let parsedPlatforms = [];
                            try { parsedPlatforms = typeof post.platforms === 'string' ? JSON.parse(post.platforms) : post.platforms; } catch(e) {}
                            
                            return (
                                <div key={post.id} className="p-6 hover:bg-gray-50 transition group flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center space-x-3 mb-2">
                                            {isPublished ? (
                                                <span className="flex items-center space-x-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-green-100 text-green-700">
                                                    <CheckCircle2 size={12} /> <span>Published</span>
                                                </span>
                                            ) : (
                                                <span className="flex items-center space-x-1 text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                                    <Clock size={12} /> <span>Scheduled</span>
                                                </span>
                                            )}
                                            <span className="text-xs font-medium text-gray-500 flex gap-1">
                                                {Array.isArray(parsedPlatforms) ? parsedPlatforms.map(p => (
                                                    <span key={p} className="bg-gray-200 px-1.5 rounded">{p}</span>
                                                )) : null}
                                            </span>
                                        </div>
                                        <p className="text-gray-800 text-sm whitespace-pre-wrap">{post.content}</p>
                                        <p className="text-xs text-gray-400 mt-2">
                                            {isPublished ? 'Published on ' : 'Scheduled for '} 
                                            {new Date(post.scheduledAt).toLocaleString()}
                                        </p>
                                    </div>
                                    <button 
                                        onClick={() => handleDeletePost(post.id)}
                                        className="text-gray-400 hover:text-red-500 p-2 opacity-0 group-hover:opacity-100 transition"
                                        title="Delete Post"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Marketing;
