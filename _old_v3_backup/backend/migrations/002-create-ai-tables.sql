-- InWoice AI Transformation - Database Migration
-- Creates 6 new tables for AI memory, conversations, settings, and usage tracking

-- Table 1: AI Memory Storage
CREATE TABLE IF NOT EXISTS ai_memory (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,        -- 'customer', 'product', 'pattern', 'insight'
  entity_id TEXT NOT NULL,
  content TEXT NOT NULL,             -- The memory content (JSON or text)
  memory_type TEXT,                  -- 'preference', 'behavior', 'insight', 'trend'
  relevance_score FLOAT DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  last_accessed TIMESTAMP,
  UNIQUE(entity_type, entity_id, memory_type)
);

CREATE INDEX idx_ai_memory_entity ON ai_memory(entity_type, entity_id);
CREATE INDEX idx_ai_memory_relevance ON ai_memory(relevance_score DESC);
CREATE INDEX idx_ai_memory_created ON ai_memory(created_at DESC);

-- Table 2: Memory Entity Links
CREATE TABLE IF NOT EXISTS ai_memory_links (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  linked_entity_type TEXT,          -- 'customer', 'invoice', 'payment', 'collection'
  linked_entity_id TEXT,
  link_strength FLOAT DEFAULT 1.0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (memory_id) REFERENCES ai_memory(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_memory_links_memory ON ai_memory_links(memory_id);
CREATE INDEX idx_ai_memory_links_entity ON ai_memory_links(linked_entity_type, linked_entity_id);

-- Table 3: Conversation Sessions
CREATE TABLE IF NOT EXISTS ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  message_count INT DEFAULT 0,
  context_snapshot TEXT,            -- JSON: Business context at time
  last_model_used TEXT,
  total_tokens_used INT DEFAULT 0,
  estimated_total_cost FLOAT DEFAULT 0.0
);

CREATE INDEX idx_ai_conversations_user ON ai_conversations(user_id);
CREATE INDEX idx_ai_conversations_created ON ai_conversations(created_at DESC);

-- Table 4: Conversation Messages
CREATE TABLE IF NOT EXISTS ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,                -- 'user' or 'assistant'
  content TEXT NOT NULL,
  model_used TEXT,
  tokens_input INT,
  tokens_output INT,
  estimated_cost FLOAT,
  context_entities TEXT,             -- JSON: Entities mentioned
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_messages_conversation ON ai_messages(conversation_id);
CREATE INDEX idx_ai_messages_created ON ai_messages(created_at DESC);

-- Table 5: AI Settings per User
CREATE TABLE IF NOT EXISTS ai_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  openrouter_api_key TEXT,          -- Encrypted
  default_model TEXT DEFAULT 'claude-3-sonnet',
  fallback_model TEXT DEFAULT 'gpt-4o-mini',
  temperature FLOAT DEFAULT 0.7,
  max_tokens INT DEFAULT 2000,
  context_length INT DEFAULT 8000,
  enable_ai_memory BOOLEAN DEFAULT 1,
  enable_recommendations BOOLEAN DEFAULT 1,
  enable_business_insights BOOLEAN DEFAULT 1,
  enable_forecasting BOOLEAN DEFAULT 0,
  enable_file_intelligence BOOLEAN DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_settings_user ON ai_settings(user_id);

-- Table 6: AI Usage Tracking & Cost Monitoring
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  model_used TEXT NOT NULL,
  request_type TEXT,                -- 'copilot', 'insight', 'recommendation', 'memory'
  prompt_tokens INT,
  completion_tokens INT,
  total_tokens INT,
  estimated_cost FLOAT,
  response_time_ms INT,
  success BOOLEAN DEFAULT 1,
  error_code TEXT,
  error_message TEXT,
  context_size_bytes INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ai_usage_log_user ON ai_usage_log(user_id);
CREATE INDEX idx_ai_usage_log_model ON ai_usage_log(model_used);
CREATE INDEX idx_ai_usage_log_created ON ai_usage_log(created_at DESC);
CREATE INDEX idx_ai_usage_log_cost ON ai_usage_log(estimated_cost DESC);

-- Verify tables created
SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'ai_%';
