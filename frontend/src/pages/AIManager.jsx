import React, { useState, useRef, useEffect } from 'react';
import { api, API_ENDPOINTS } from '../apiConfig';
import { Bot, Send, User, Sparkles } from 'lucide-react';

const AIManager = () => {
    const [messages, setMessages] = useState([
        { id: 1, sender: 'assistant', text: "Hello! I'm your AI Business Manager. How can I help you streamline your operations today?" }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async (e) => {
        e?.preventDefault();
        if (!input.trim() || isLoading) return;

        const userMessage = { id: Date.now(), sender: 'user', text: input.trim() };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await api.post(API_ENDPOINTS.AI_CHAT, {
                message: userMessage.text,
                history: messages
            });

            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                sender: 'assistant',
                text: response.response || "I didn't get a proper response from the AI model."
            }]);
        } catch (error) {
            console.error('AI Chat Error:', error);
            setMessages(prev => [...prev, {
                id: Date.now() + 1,
                sender: 'assistant',
                text: "Sorry, I encountered an error connecting to the AI brain. Please check your AI API configurations."
            }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-gray-50">
            <div className="bg-white border-b border-gray-200 px-8 py-6 flex items-center space-x-3">
                <div className="bg-purple-100 p-2 rounded-lg text-purple-600">
                    <Sparkles size={24} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">AI Business Manager</h1>
                    <p className="text-gray-500 text-sm mt-1">Your intelligent assistant for marketing, planning, and insights.</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-6">
                {messages.map((msg) => (
                    <div key={msg.id} className={`flex items-start max-w-3xl ${msg.sender === 'user' ? 'ml-auto flex-row-reverse space-x-reverse space-x-3' : 'space-x-3'}`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${msg.sender === 'user' ? 'bg-purple-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                            {msg.sender === 'user' ? <User size={16} /> : <Bot size={16} />}
                        </div>
                        <div className={`p-4 rounded-xl ${msg.sender === 'user' ? 'bg-purple-600 text-white rounded-tr-none' : 'bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm'}`}>
                            <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        </div>
                    </div>
                ))}
                {isLoading && (
                    <div className="flex items-start max-w-3xl space-x-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 bg-gray-200 text-gray-600">
                            <Bot size={16} />
                        </div>
                        <div className="p-4 rounded-xl bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm flex space-x-2">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="p-6 bg-white border-t border-gray-200">
                <form onSubmit={handleSend} className="max-w-4xl mx-auto relative">
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder="Ask me to generate a marketing plan or analyze your business..."
                        className="w-full pl-4 pr-12 py-4 bg-gray-50 border border-gray-200 rounded-xl outline-none focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition"
                    />
                    <button
                        type="submit"
                        disabled={!input.trim() || isLoading}
                        className="absolute right-2 top-2 bottom-2 aspect-square flex items-center justify-center bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
                    >
                        <Send size={18} />
                    </button>
                </form>
            </div>
        </div>
    );
};

export default AIManager;
