import React, { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';

const Login = () => {
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        try {
            const res = await axios.post('http://localhost:5000/api/auth/login', { password });
            localStorage.setItem('token', res.data.token);
            navigate('/');
        } catch (err) {
            setError('Invalid password');
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
                            className="w-full p-4 bg-gray-50 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 border-none font-medium transition-all"
                        />
                    </div>
                    
                    {error && <p className="text-red-500 text-xs font-bold uppercase tracking-wider text-center">{error}</p>}

                    <button 
                        type="submit"
                        className="w-full bg-purple-600 text-white p-4 rounded-xl font-bold hover:bg-purple-700 transition-all shadow-lg shadow-purple-100"
                    >
                        Access Dashboard
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
