import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { Activity, AlertTriangle, Lightbulb, FileText, Zap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface IntelligenceData {
  healthScore: any;
  briefing: any;
  risks: any[];
  opportunities: any[];
}

const ExecutiveDashboard = () => {
  const [data, setData] = useState<IntelligenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const { token } = useAuth();

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
      await fetchIntelligence();
    } catch (err) {
      console.error(err);
      alert('Failed to generate briefing. Check OpenRouter API key configuration.');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="p-8 text-center animate-pulse">Loading Executive Intelligence...</div>;

  const health = data?.healthScore;
  const healthColor = health?.overallScore >= 80 ? 'text-green-500' : (health?.overallScore >= 60 ? 'text-yellow-500' : 'text-red-500');

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight">Executive Command Center</h1>
          <p className="text-gray-500 mt-1">AI-powered business intelligence & virtual C-Suite.</p>
        </div>
        <button 
          onClick={generateBriefing}
          disabled={generating}
          className="flex items-center space-x-2 bg-indigo-600 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
        >
          <Zap size={18} className={generating ? "animate-spin" : ""} />
          <span>{generating ? 'Synthesizing Data...' : 'Run Daily Analysis'}</span>
        </button>
      </div>

      {/* Top Row: Health & Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
        {/* Health Score Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center items-center text-center">
          <Activity size={32} className="text-gray-400 mb-4" />
          <h2 className="text-sm uppercase tracking-widest font-bold text-gray-500 mb-2">Business Health</h2>
          <div className={`text-6xl font-black ${healthColor}`}>
            {health?.overallScore ? Math.round(health.overallScore) : '--'}
          </div>
          <p className="text-sm text-gray-400 mt-2">out of 100</p>
          
          {health && (
            <div className="w-full mt-6 space-y-2 text-xs font-medium text-gray-500">
              <div className="flex justify-between"><span className="text-left w-24">Revenue:</span> <span className="text-right">{health.revenueHealth}%</span></div>
              <div className="flex justify-between"><span className="text-left w-24">Inventory:</span> <span className="text-right">{health.inventoryHealth}%</span></div>
              <div className="flex justify-between"><span className="text-left w-24">Customers:</span> <span className="text-right">{health.customerHealth}%</span></div>
            </div>
          )}
        </div>

        {/* Executive Briefing Card */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col">
          <h2 className="text-lg font-bold text-gray-800 flex items-center border-b pb-4 mb-4">
            <FileText className="mr-2 text-indigo-500" size={20} /> AI Daily Briefing
          </h2>
          <div className="flex-1 overflow-y-auto prose prose-sm prose-indigo max-w-none">
            {data?.briefing ? (
              <ReactMarkdown>{data.briefing.content}</ReactMarkdown>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 italic">
                No briefing generated for today. Click 'Run Daily Analysis' to synthesize data.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Risks & Opportunities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Risks */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-red-100">
          <h2 className="text-lg font-bold text-gray-800 flex items-center mb-6">
            <AlertTriangle className="mr-2 text-red-500" size={20} /> Critical Risks
          </h2>
          <div className="space-y-4">
            {data?.risks && data.risks.length > 0 ? (
              data.risks.map(risk => (
                <div key={risk.id} className="p-4 bg-red-50 rounded-xl border border-red-100 flex items-start">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-red-500 mr-3 shrink-0"></div>
                  <div>
                    <h3 className="font-bold text-red-900 text-sm">{risk.title}</h3>
                    <p className="text-red-700 text-xs mt-1">{risk.description}</p>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 italic">No critical risks identified.</p>
            )}
          </div>
        </div>

        {/* Opportunities */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-green-100">
          <h2 className="text-lg font-bold text-gray-800 flex items-center mb-6">
            <Lightbulb className="mr-2 text-green-500" size={20} /> AI Opportunities
          </h2>
          <div className="space-y-4">
            {data?.opportunities && data.opportunities.length > 0 ? (
              data.opportunities.map(opp => (
                <div key={opp.id} className="p-4 bg-green-50 rounded-xl border border-green-100 flex items-start">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-green-500 mr-3 shrink-0"></div>
                  <div>
                    <h3 className="font-bold text-green-900 text-sm">{opp.title}</h3>
                    <p className="text-green-700 text-xs mt-1">{opp.description}</p>
                    <div className="mt-3 flex space-x-2">
                      <button className="text-xs font-bold px-3 py-1 bg-white text-green-700 rounded shadow-sm hover:bg-green-50">Execute</button>
                      <button className="text-xs font-bold px-3 py-1 bg-transparent text-green-600 hover:text-green-800">Snooze</button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500 italic">No pending opportunities identified.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
