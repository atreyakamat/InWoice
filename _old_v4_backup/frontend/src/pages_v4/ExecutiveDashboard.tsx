import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Activity, AlertTriangle, Lightbulb, FileText, Zap, TrendingUp, MessageSquare, Send, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface IntelligenceData {
  healthScore: any;
  briefing: any;
  risks: any[];
  opportunities: any[];
  forecasts: any[];
}

const ExecutiveDashboard = () => {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatQuery, setChatQuery] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const { token } = useAuth();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const fetchIntelligence = async () => {
    try {
      setLoading(true);
      const res = await axios.get('http://localhost:5000/api/executive/dashboard', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setData(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntelligence();
  }, [token]);

  const generateBriefing = async () => {
    try {
      setGenerating(true);
      await axios.post('http://localhost:5000/api/executive/generate-briefing', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await axios.post('http://localhost:5000/api/executive/forecast', {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      await fetchIntelligence();
    } catch (err) {
      console.error(err);
      alert('Analysis failed. Verify configuration.');
    } finally {
      setGenerating(false);
    }
  };

  const updateOppStatus = async (id: string, status: string) => {
    try {
      await axios.patch(`http://localhost:5000/api/executive/opportunities/${id}`, { status }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchIntelligence();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatQuery.trim() || isAsking) return;
    
    try {
      setIsAsking(true);
      setChatResponse('');
      const res = await axios.post('http://localhost:5000/api/executive/ask', { query: chatQuery }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setChatResponse(res.data.data);
      setChatQuery('');
    } catch (err) {
      setChatResponse('Failed to get answer.');
    } finally {
      setIsAsking(false);
    }
  };

  if (loading) return <div className="p-8 text-center animate-pulse text-indigo-600 font-bold">Initializing Executive OS...</div>;

  const health = data?.healthScore;
  const healthColor = health?.overallScore >= 80 ? 'text-green-500' : (health?.overallScore >= 60 ? 'text-yellow-500' : 'text-red-500');

  return (
    <div className="p-8 bg-gray-50 min-h-screen relative">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Executive Command Center</h1>
          <p className="text-gray-500 mt-1">Virtual C-Suite & Decision Support System.</p>
        </div>
        <div className="flex space-x-3">
          <button 
            onClick={() => setIsChatOpen(true)}
            className="flex items-center space-x-2 bg-white text-gray-700 px-5 py-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition shadow-sm"
          >
            <MessageSquare size={18} />
            <span>Ask InWoice</span>
          </button>
          <button 
            onClick={generateBriefing}
            disabled={generating}
            className="flex items-center space-x-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
          >
            <Zap size={18} className={generating ? "animate-spin" : ""} />
            <span>{generating ? 'Synthesizing...' : 'Run Analysis'}</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8 mb-8">
        {/* Health Score Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center items-center text-center">
          <Activity size={32} className="text-gray-400 mb-4" />
          <h2 className="text-sm uppercase tracking-widest font-bold text-gray-500 mb-2">Business Health</h2>
          <div className={`text-6xl font-black ${healthColor}`}>
            {health?.overallScore ? Math.round(health.overallScore) : '--'}
          </div>
          {health && (
            <div className="w-full mt-6 space-y-2 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">
              <div className="flex justify-between"><span>Revenue</span> <span>{health.revenueHealth}%</span></div>
              <div className="flex justify-between"><span>Inventory</span> <span>{health.inventoryHealth}%</span></div>
              <div className="flex justify-between"><span>Customers</span> <span>{health.customerHealth}%</span></div>
            </div>
          )}
        </div>

        {/* AI Daily Briefing */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col max-h-[400px]">
          <h2 className="text-lg font-bold text-gray-800 flex items-center border-b pb-4 mb-4">
            <FileText className="mr-2 text-indigo-500" size={20} /> AI Daily Briefing
          </h2>
          <div className="flex-1 overflow-y-auto prose prose-sm prose-indigo max-w-none scrollbar-hide">
            {data?.briefing ? (
              <ReactMarkdown>{data.briefing.content}</ReactMarkdown>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 italic">
                Synthesis required.
              </div>
            )}
          </div>
        </div>

        {/* AI Forecasts */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-bold text-gray-800 flex items-center mb-6">
            <TrendingUp className="mr-2 text-purple-500" size={20} /> 30-Day Forecast
          </h2>
          <div className="space-y-6">
            {data?.forecasts && data.forecasts.length > 0 ? (
              data.forecasts.map(f => (
                <div key={f.id}>
                  <div className="flex justify-between items-end mb-1">
                    <span className="text-xs font-bold text-gray-400 uppercase">{f.type}</span>
                    <span className="text-xs font-black text-indigo-600">{f.confidence * 100}% Conf.</span>
                  </div>
                  <div className="text-2xl font-black text-gray-900">${f.forecastValue.toLocaleString()}</div>
                  <p className="text-[10px] text-gray-500 mt-1 leading-tight">{f.logic}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-400 italic">No forecasts available.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Risk Management */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center mb-6">
            <AlertTriangle className="mr-2 text-red-500" size={20} /> Critical Risks
          </h2>
          <div className="space-y-4">
            {data?.risks.map(risk => (
              <div key={risk.id} className="p-4 bg-red-50/50 rounded-xl border border-red-100 flex items-start">
                <div className="w-2 h-2 mt-1.5 rounded-full bg-red-500 mr-3 shrink-0"></div>
                <div>
                  <h3 className="font-bold text-red-900 text-sm">{risk.title}</h3>
                  <p className="text-red-700 text-xs mt-1">{risk.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Decision Center */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center mb-6">
            <Lightbulb className="mr-2 text-green-500" size={20} /> Decision Center
          </h2>
          <div className="space-y-4">
            {data?.opportunities.map(opp => (
              <div key={opp.id} className="p-4 bg-green-50/50 rounded-xl border border-green-100">
                <div className="flex items-start">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500 mr-3 shrink-0"></div>
                  <div>
                    <h3 className="font-bold text-green-900 text-sm">{opp.title}</h3>
                    <p className="text-green-700 text-xs mt-1">{opp.description}</p>
                  </div>
                </div>
                <div className="mt-4 flex space-x-2 ml-5">
                  <button onClick={() => updateOppStatus(opp.id, 'APPROVED')} className="text-[10px] font-black uppercase px-3 py-1 bg-green-600 text-white rounded shadow-sm hover:bg-green-700">Approve</button>
                  <button onClick={() => updateOppStatus(opp.id, 'REJECTED')} className="text-[10px] font-black uppercase px-3 py-1 bg-white text-gray-500 border border-gray-200 rounded hover:bg-gray-50">Reject</button>
                  <button onClick={() => updateOppStatus(opp.id, 'SNOOZED')} className="text-[10px] font-black uppercase px-3 py-1 text-gray-400 hover:text-gray-600">Snooze</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Ask InWoice Chat Overlay */}
      {isChatOpen && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex justify-end">
          <div className="w-full max-w-md bg-white h-screen shadow-2xl flex flex-col">
            <div className="p-6 border-b flex justify-between items-center bg-indigo-600 text-white">
              <div>
                <h2 className="font-black text-xl">Ask InWoice</h2>
                <p className="text-xs text-indigo-100">Executive OS Interface</p>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-2 hover:bg-indigo-500 rounded-full">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              {chatResponse && (
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 prose prose-sm prose-indigo">
                  <ReactMarkdown>{chatResponse}</ReactMarkdown>
                </div>
              )}
              {isAsking && (
                <div className="flex space-x-2 animate-pulse text-indigo-600">
                  <div className="w-2 h-2 bg-current rounded-full"></div>
                  <div className="w-2 h-2 bg-current rounded-full"></div>
                  <div className="w-2 h-2 bg-current rounded-full"></div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <form onSubmit={handleAsk} className="p-6 border-t bg-gray-50">
              <div className="relative">
                <input 
                  type="text" 
                  value={chatQuery}
                  onChange={(e) => setChatQuery(e.target.value)}
                  placeholder="e.g. 'What products create the most profit?'" 
                  className="w-full pl-4 pr-12 py-3 rounded-xl border border-gray-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition"
                />
                <button type="submit" className="absolute right-2 top-2 p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg">
                  <Send size={20} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExecutiveDashboard;
