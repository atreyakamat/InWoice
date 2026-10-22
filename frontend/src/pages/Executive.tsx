import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { AlertTriangle, Lightbulb, RefreshCw, Send, Sparkles, TrendingUp } from 'lucide-react';
import { get, patch, post } from '../lib/api';
import { useLoad } from '../lib/useLoad';
import { dateTime, money, num, titleCase } from '../lib/format';
import { cn } from '../lib/utils';
import { useToast } from '../components/toast';
import { Badge, Button, Card, EmptyState, ErrorBox, Input, PageHeader, Spinner, StatusBadge } from '../components/ui';

interface Health {
  overallScore: number;
  revenueHealth: number;
  cashFlowHealth: number;
  customerHealth: number;
  inventoryHealth: number;
  operationsHealth: number;
  createdAt: string;
}
interface Insight {
  id: string;
  title: string;
  description: string;
  category: string;
  severity?: string;
  impact?: string;
  referenceType: string | null;
  referenceId: string | null;
}
interface ExecutiveData {
  healthScore: Health | null;
  briefing: { content: string; source: string; createdAt: string } | null;
  risks: Insight[];
  opportunities: Insight[];
  forecasts: { id: string; type: string; forecastValue: number; confidence: number; logic: string }[];
  ai: { enabled: boolean; provider: string; model: string };
}

const refLink = (i: Insight) => {
  if (!i.referenceId) return null;
  const base = { INVOICE: '/invoices/', CUSTOMER: '/customers/', PRODUCT: '/products', INVENTORY: '/inventory' }[i.referenceType ?? ''];
  if (!base) return null;
  return base.endsWith('/') ? `${base}${i.referenceId}` : base;
};

const scoreColor = (s: number) => (s >= 75 ? 'text-emerald-600' : s >= 50 ? 'text-amber-600' : 'text-red-600');
const barColor = (s: number) => (s >= 75 ? 'bg-emerald-500' : s >= 50 ? 'bg-amber-500' : 'bg-red-500');

export default function Executive() {
  const toast = useToast();
  const { data, loading, error, reload } = useLoad(() => get<ExecutiveData>('/executive'));
  const [analyzing, setAnalyzing] = useState(false);
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [chat, setChat] = useState<{ q: string; a: string }[]>([]);

  const analyze = async () => {
    setAnalyzing(true);
    try {
      const res = await post<{ aiError: string | null }>('/executive/analyze');
      if (res.aiError) toast.error(`AI briefing unavailable, used built-in analysis instead: ${res.aiError}`);
      else toast.success('Analysis updated');
      await reload();
    } catch (err) {
      toast.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  const decide = async (id: string, status: string) => {
    try {
      await patch(`/executive/opportunities/${id}`, { status });
      await reload();
    } catch (err) {
      toast.error(err);
    }
  };

  const dismissRisk = async (id: string, status: string) => {
    try {
      await patch(`/executive/risks/${id}`, { status });
      await reload();
    } catch (err) {
      toast.error(err);
    }
  };

  const ask = async (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    try {
      const res = await post<{ answer: string }>('/executive/ask', { question: q });
      setChat((c) => [...c, { q, a: res.answer }]);
      setQuestion('');
    } catch (err) {
      toast.error(err);
    } finally {
      setAsking(false);
    }
  };

  if (loading && !data) return <Spinner />;
  if (error) return <ErrorBox message={error} onRetry={reload} />;
  if (!data) return null;
  const h = data.healthScore;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Insights & AI"
        subtitle={
          data.ai.enabled ? (
            <>
              AI: {data.ai.provider === 'ANTHROPIC' ? 'Claude' : 'Local AI'} <span className="text-slate-400">({data.ai.model})</span>
            </>
          ) : (
            <>
              Built-in analysis (no AI). <Link to="/settings" className="text-brand-600 underline">Turn on AI</Link> for written briefings and Q&A.
            </>
          )
        }
        actions={
          <Button onClick={analyze} loading={analyzing}>
            <RefreshCw size={15} /> Run analysis
          </Button>
        }
      />

      {!h && !data.briefing ? (
        <Card>
          <EmptyState
            title="No analysis yet"
            description="Run an analysis to get a health score, risks, opportunities and a 30-day forecast from your data."
            action={
              <Button onClick={analyze} loading={analyzing}>
                Run analysis
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card title="Business health">
              {h ? (
                <>
                  <div className={cn('text-center text-5xl font-black tabular-nums', scoreColor(h.overallScore))}>{Math.round(h.overallScore)}</div>
                  <div className="mb-4 text-center text-xs text-slate-500">out of 100 · {dateTime(h.createdAt)}</div>
                  <div className="space-y-2">
                    {(
                      [
                        ['Revenue trend', h.revenueHealth],
                        ['Cash flow', h.cashFlowHealth],
                        ['Customers', h.customerHealth],
                        ['Inventory', h.inventoryHealth],
                        ['Operations', h.operationsHealth],
                      ] as const
                    ).map(([label, v]) => (
                      <div key={label}>
                        <div className="flex justify-between text-xs text-slate-600">
                          <span>{label}</span>
                          <span className="tabular-nums">{Math.round(v)}</span>
                        </div>
                        <div className="mt-0.5 h-1.5 rounded-full bg-slate-100">
                          <div className={cn('h-1.5 rounded-full', barColor(v))} style={{ width: `${v}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-500">Run an analysis.</p>
              )}
            </Card>

            <Card
              title={
                <span className="flex items-center gap-2">
                  <Sparkles size={15} className="text-brand-600" /> Briefing
                </span>
              }
              actions={data.briefing && <Badge tone={data.briefing.source === 'RULES' ? 'gray' : 'indigo'}>{data.briefing.source === 'RULES' ? 'Built-in' : data.briefing.source === 'ANTHROPIC' ? 'Claude' : 'Local AI'}</Badge>}
              className="lg:col-span-2"
            >
              {data.briefing ? (
                <div className="md max-h-96 overflow-y-auto text-sm text-slate-700">
                  <ReactMarkdown>{data.briefing.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Run an analysis.</p>
              )}
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Card title={<span className="flex items-center gap-2"><AlertTriangle size={15} className="text-red-500" /> Risks</span>}>
              {data.risks.length ? (
                <ul className="space-y-3">
                  {data.risks.map((r) => {
                    const link = refLink(r);
                    return (
                      <li key={r.id} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-slate-800">{link ? <Link to={link} className="hover:underline">{r.title}</Link> : r.title}</span>
                          {r.severity && <StatusBadge status={r.severity} />}
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{r.description}</p>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => dismissRisk(r.id, 'MITIGATED')}>Handled</Button>
                          <Button size="sm" variant="ghost" onClick={() => dismissRisk(r.id, 'IGNORED')}>Ignore</Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No active risks.</p>
              )}
            </Card>

            <Card title={<span className="flex items-center gap-2"><Lightbulb size={15} className="text-amber-500" /> Opportunities</span>}>
              {data.opportunities.length ? (
                <ul className="space-y-3">
                  {data.opportunities.map((o) => {
                    const link = refLink(o);
                    return (
                      <li key={o.id} className="rounded-lg border border-slate-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-slate-800">{link ? <Link to={link} className="hover:underline">{o.title}</Link> : o.title}</span>
                          <Badge tone="indigo">{titleCase(o.category)}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{o.description}</p>
                        <div className="mt-2 flex gap-2">
                          <Button size="sm" onClick={() => decide(o.id, 'APPROVED')}>Do it</Button>
                          <Button size="sm" variant="secondary" onClick={() => decide(o.id, 'SNOOZED')}>Later</Button>
                          <Button size="sm" variant="ghost" onClick={() => decide(o.id, 'REJECTED')}>Dismiss</Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No open opportunities.</p>
              )}
            </Card>

            <Card title={<span className="flex items-center gap-2"><TrendingUp size={15} className="text-brand-600" /> Next 30 days</span>}>
              {data.forecasts.length ? (
                <div className="space-y-4">
                  {data.forecasts.map((f) => (
                    <div key={f.id}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-semibold uppercase text-slate-500">{f.type === 'REVENUE' ? 'Collections' : 'Orders'}</span>
                        <span className="text-xs text-slate-500">{Math.round(f.confidence * 100)}% confidence</span>
                      </div>
                      <div className="text-2xl font-bold tabular-nums">{f.type === 'REVENUE' ? money(f.forecastValue, { decimals: 0 }) : num(f.forecastValue, 0)}</div>
                      <p className="text-xs text-slate-500">{f.logic}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Run an analysis.</p>
              )}
            </Card>
          </div>
        </>
      )}

      <Card title="Ask about your business">
        {data.ai.enabled ? (
          <>
            <div className="mb-4 space-y-4">
              {chat.map((c, i) => (
                <div key={i} className="space-y-2">
                  <div className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-brand-600 px-3.5 py-2 text-sm text-white">{c.q}</div>
                  <div className="md w-fit max-w-[95%] rounded-2xl rounded-bl-sm bg-slate-100 px-3.5 py-2 text-sm text-slate-800">
                    <ReactMarkdown>{c.a}</ReactMarkdown>
                  </div>
                </div>
              ))}
              {asking && <Spinner label="Thinking…" />}
              {!chat.length && !asking && (
                <div className="flex flex-wrap gap-2">
                  {['Who owes me the most money?', 'Which products sell best?', 'How does this month compare to last month?', 'What should I restock?'].map((s) => (
                    <button key={s} onClick={() => setQuestion(s)} className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <form onSubmit={ask} className="flex gap-2">
              <Input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask a question about sales, customers, stock…" maxLength={2000} />
              <Button type="submit" loading={asking} aria-label="Ask">
                <Send size={15} />
              </Button>
            </form>
          </>
        ) : (
          <EmptyState
            title="Q&A needs an AI provider"
            description="Connect Claude with an API key, or run a small local model with Ollama, in Settings › AI."
            action={<Link to="/settings"><Button variant="secondary">Open AI settings</Button></Link>}
          />
        )}
      </Card>
    </div>
  );
}
