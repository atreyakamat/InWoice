# AI Guide

AI in InWoice is **optional**. With AI switched off you still get the health score, risks,
opportunities, the 30-day forecast and a structured daily briefing. All of these are computed
by rules and SQL, so they cost nothing and use almost no CPU.

Turning AI on adds:

1. **A written briefing.** The same numbers become a short narrative with recommended actions.
2. **"Ask about your business".** Plain-language Q&A over your data, for example "who owes me
   the most?" or "what should I restock?".
3. **Reading supplier bills.** New bill › *Read from photo or PDF* fills in the supplier,
   bill number, dates, lines, HSN and GST rates. Nothing is saved until you press Save. The
   printed total is checked against the computed one, and differences, an unknown supplier
   or a GSTIN mismatch are flagged. Claude reads photos and PDFs; local models read photos
   only, and need a vision model (e.g. `ollama pull qwen2.5vl:3b`).
4. **Reminder emails in your voice.** On the Actions page, reminder drafts are written per
   customer (firmer when long overdue) for you to edit before sending. Without AI, a polite
   template is used instead.
5. **A note in the monthly owner summary** saying what mattered most last month.

AI never sends, saves or changes anything by itself: every action waits for your approval.

Configure it under **Settings › AI**. Use **Test connection** before you save.

## Which option should I pick?

| | Claude (API key) | Local AI (Ollama) | Off |
|---|---|---|---|
| Quality | Best | Fair. Small models get numbers wrong more often | — |
| Server load | **None.** Runs in Anthropic's cloud | Heavy: CPU and 2–4 GB RAM while answering | None |
| Speed on an old CPU | 2–10 s | 30–120 s with a 1.5B model | Instant |
| Privacy | A business summary (aggregates, customer names, totals) is sent to Anthropic | Nothing leaves your machine | — |
| Cost | Pay per use (see below) | Free | Free |
| Internet | Required | Not required | — |

**For an old CPU, use Claude** or leave AI off. Local AI works, but expect slow answers.

## Claude

1. Create an API key at https://console.anthropic.com. Add billing, and set a monthly spend
   limit there.
2. Go to Settings › AI › **Claude (cloud)**, paste the key, pick a model, then **Test
   connection** and **Save**.

You can also set `ANTHROPIC_API_KEY` in `backend/.env`. A key saved in Settings takes priority.

| Model | When to use |
|---|---|
| `claude-opus-5-5` (default) | Most capable: the best analysis and answers |
| `claude-sonnet-5-5` | Balanced capability and cost |
| `claude-haiku-5-5` | Fastest and cheapest. Fine for routine briefings and simple questions |

**Cost control built in:**

- Requests use low reasoning effort. Business Q&A doesn't need deep reasoning.
- Each request sends a compact snapshot of aggregates, not your whole database.
- AI endpoints are rate-limited to 10 requests per minute.
- Nothing runs on a schedule. AI is called only when someone clicks *Run analysis* or asks
  a question.

A typical briefing or answer uses a few thousand input tokens. Check current prices at
https://www.anthropic.com/pricing. Haiku is the cheapest option if cost matters more than
depth.

On Opus 5.5 and Sonnet 5.5, InWoice turns on Anthropic's server-side refusal fallback. In
the rare case the model declines a request, the API retries it on a fallback model
automatically.

**What is sent to Claude:** business name, currency, revenue and receivable totals, overdue
invoice numbers with customer names and balances, low-stock item names, top customers and
products, and your question. Customer emails, phone numbers, addresses and GSTINs are **not**
sent.

## Local AI with Ollama

1. Install Ollama from https://ollama.com (Windows, macOS, Linux).
2. Pull a small model:

   ```bash
   ollama pull qwen2.5:1.5b      # ~1 GB, best small model for this task
   # or: ollama pull llama3.2:1b  (smaller, faster, weaker)
   ```

3. Go to Settings › AI › **Local AI (Ollama)**. Set the URL to `http://localhost:11434` (or
   `http://<ollama-host>:11434`) and the model to `qwen2.5:1.5b`. Then **Test connection**
   and **Save**.

InWoice limits local requests to a 4k context and about 800 output tokens so CPU-only
inference stays usable. Models of 7B or larger give better answers but need a modern CPU,
or a GPU, and 8 GB+ RAM.

The old Python `local_ai` microservice (Transformers + Qwen) has been retired. Ollama
replaces it with a much lighter runtime. The old code is in `_old_v3_backup/local_ai/`.

## Failure behaviour

- If the AI provider is down or misconfigured, *Run analysis* still succeeds with the
  built-in briefing and shows the reason in a notice.
- Errors are specific: invalid key, model not installed (with the exact `ollama pull`
  command), unreachable server, or rate limited.
