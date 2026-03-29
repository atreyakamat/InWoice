import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { API_ENDPOINTS, setToken } from '../apiConfig';

const Login = () => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        
        if (!password) {
            setError('Please enter your password');
            return;
        }

        setIsLoading(true);

        try {
            const response = await axios.post(API_ENDPOINTS.AUTH_LOGIN, { password });
            
            if (response.data.success && response.data.data.token) {
                // Store token using centralized function
                setToken(response.data.data.token);
                // Navigate to dashboard
                navigate('/');
            } else {
                setError('Invalid response from server');
            }
        } catch (err) {
            console.error('Login error:', err);
            
            if (err.response?.data?.error) {
                setError(err.response.data.error);
            } else if (err.response?.status === 429) {
                setError('Too many login attempts. Please try again later.');
            } else if (err.message === 'Network Error') {
                setError('Cannot connect to server. Please check if backend is running.');
            } else {
                setError('Login failed. Please try again.');
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 p-6">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 border border-gray-100">
                <div className="flex flex-col items-center mb-8">
                    <div className="p-4 bg-purple-50 rounded-full mb-4">
                        <Lock className="text-purple-600" size={32} />
                    </div>
                    <h1 className="text-2xl font-black text-gray-800 uppercase tracking-tighter italic">InWoice Admin</h1>
                    <p className="text-gray-400 text-sm mt-1 uppercase tracking-widest font-bold text-[10px]">Secure Homelab Access</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1 tracking-widest">Password</label>
                        <input 
                            type="password" 
                            value={password} 
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            disabled={isLoading}
                            className="w-full p-4 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 border-none font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            autoFocus
                        />
                    </div>
                    
                    {error && <p className="text-red-500 text-xs font-bold uppercase tracking-wider text-center p-3 bg-red-50 rounded-lg">{error}</p>}

                    <button 
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-purple-600 text-white p-4 rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isLoading ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Logging in...
                            </>
                        ) : (
                            'Access Dashboard'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
