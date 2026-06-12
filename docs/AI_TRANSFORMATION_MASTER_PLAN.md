# InWoice AI Transformation - Implementation Master Plan

**Status:** Strategic Planning Phase  
**Date:** June 12, 2026  
**Objective:** Transform existing AI into centralized OpenRouter-powered Business Copilot

---

## ARCHITECTURE OVERVIEW

### Core Layers (Bottom to Top)

```
┌─────────────────────────────────────────────┐
│         Frontend (React Components)         │
│    - AI Settings Page                       │
│    - Business Copilot Panel                 │
│    - Customer AI Summary                    │
│    - Product AI Summary                     │
│    - Collection/Pack AI Summary             │
│    - AI Insights Widget                     │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         API Routes Layer                    │
│    - aiSettingsRoutes.js (NEW)              │
│    - aiCopilotRoutes.js (NEW)               │
│    - aiInsightsRoutes.js (ENHANCED)         │
│    - aiMemoryRoutes.js (NEW)                │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         Service Layer (Business Logic)      │
│    - openRouterService (NEW)                │
│    - modelRouterService (NEW)               │
│    - promptBuilderService (NEW)             │
│    - contextService (NEW)                   │
│    - memoryService (NEW)                    │
│    - copilotService (NEW)                   │
│    - insightService (NEW)                   │
│    - recommendationService (NEW)            │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│         Data Layer (Database)               │
│    Tables (NEW & EXISTING):                 │
│    - ai_memory                              │
│    - ai_memory_links                        │
│    - ai_conversations                       │
│    - ai_messages                            │
│    - ai_settings                            │
│    - ai_usage_log                           │
└─────────────────────────────────────────────┘
```

---

## IMPLEMENTATION PHASES

### Phase 1: Foundation (2-3 days)
**Establish core infrastructure**

1.1 Database Schema
- Create 6 new tables
- Add indexes for performance
- Create migration file

1.2 Environment Configuration
- Add OpenRouter variables
- Create .env.example
- Document all variables

1.3 Core Services (Part 1)
- `openRouterService.js` - OpenRouter API wrapper
- `modelRouterService.js` - Model selection logic
- `configService.js` - Centralized configuration

**Deliverables:**
- Database tables created ✓
- Environment variables configured ✓
- 3 core services implemented ✓
- Unit tests for services ✓

---

### Phase 2: Memory & Context (3-4 days)
**Build business intelligence foundation**

2.1 Memory Engine
- `memoryService.js` - Store/retrieve memories
- Memory linking system
- Memory scoring/relevance

2.2 Context Builders
- `contextService.js` - Assemble business context
- Customer context builder
- Revenue context builder
- Collection/Pack context builder
- Timeline context builder

2.3 Prompt Builder
- `promptBuilderService.js` - Context-aware prompts
- Template system
- Dynamic context injection

**Deliverables:**
- Memory system fully functional ✓
- Context builders for all business entities ✓
- Prompt builder integrated ✓

---

### Phase 3: AI Settings Backend (2-3 days)
**User configuration system**

3.1 Settings Routes
- `aiSettingsRoutes.js` - GET/POST AI settings
- Validation & security

3.2 Settings Service
- Store user AI preferences
- Model configuration
- Feature toggles

3.3 Integration
- Connect to memory system
- Connect to model router
- Connect to context builders

**Deliverables:**
- Settings API endpoints ✓
- Settings validation ✓
- Configuration persistence ✓

---

### Phase 4: Business Copilot Backend (3-4 days)
**Core AI intelligence**

4.1 Copilot Service
- `copilotService.js` - Main AI orchestrator
- Question understanding
- Context assembly
- Model selection
- Response generation

4.2 Insight Service
- `insightService.js` - Business analytics
- Revenue insights
- Customer insights
- Collection/Pack insights
- Growth trends

4.3 Recommendation Engine
- `recommendationService.js` - Smart suggestions
- Upsell opportunities
- Cross-sell opportunities
- Retention campaigns

4.4 Integration Routes
- `aiCopilotRoutes.js` - Copilot API
- Insight endpoints
- Recommendation endpoints

**Deliverables:**
- Copilot fully functional ✓
- Insights generation working ✓
- Recommendations generated ✓

---

### Phase 5: Conversation & Cost Tracking (2 days)
**Observability & audit**

5.1 Conversation Storage
- Store all AI interactions
- Message logging
- Context snapshots

5.2 Cost Tracking
- Track token usage
- Model usage statistics
- Cost estimation
- Dashboard widgets

**Deliverables:**
- Conversation history complete ✓
- Cost tracking operational ✓

---

### Phase 6: Frontend - Settings & Configuration (2-3 days)
**User-facing configuration**

6.1 AI Settings Page
- OpenRouter API key input
- Model selection UI
- Temperature/token adjustment
- Feature toggles
- Settings validation

6.2 Integration
- Connect to backend API
- Form validation
- Success/error feedback

**Deliverables:**
- Settings page fully functional ✓
- All configuration options working ✓

---

### Phase 7: Frontend - Business Copilot (3-4 days)
**Main user interface**

7.1 Business Copilot Panel
- Question input
- Suggested questions
- Response display
- Loading states
- Error handling

7.2 Context Display
- Show active context
- Allow context customization
- Context refresh

7.3 Integration
- Connect to backend copilot API
- Real-time responses
- Memory reference display

**Deliverables:**
- Copilot panel complete ✓
- Context assembly visible ✓
- Questions answerable ✓

---

### Phase 8: Frontend - AI Insights Widgets (2-3 days)
**Dashboard integration**

8.1 AI Insights Card
- Key insights display
- Recommendation section
- Alerts & warnings

8.2 Entity-Specific Summaries
- Customer AI summary component
- Product AI summary component
- Collection AI summary component
- Pack AI summary component

8.3 Integration
- Add to existing pages
- Context-aware data
- Real-time updates

**Deliverables:**
- All insight widgets deployed ✓
- Data integration complete ✓

---

### Phase 9: Testing & Optimization (2-3 days)
**Quality assurance**

9.1 Testing
- Backend unit tests (30+)
- Frontend component tests (20+)
- Integration tests (10+)
- API endpoint tests

9.2 Performance Optimization
- Query optimization
- Cache implementation
- Response time targets

9.3 Security Review
- API key handling
- Input validation
- Access control

**Deliverables:**
- 60+ tests passing ✓
- Performance optimized ✓
- Security audit passed ✓

---

### Phase 10: Documentation & Deployment (1-2 days)
**Finalization**

10.1 Documentation
- API documentation
- Service documentation
- Frontend component docs
- Deployment guide

10.2 Deployment
- Environment setup
- Database migrations
- Service initialization
- Monitoring setup

**Deliverables:**
- Complete documentation ✓
- Production deployment ✓
- Monitoring active ✓

---

## TIMELINE ESTIMATE

| Phase | Duration | Days | Cumulative |
|-------|----------|------|-----------|
| 1: Foundation | 2-3 days | 2.5 | 2.5 |
| 2: Memory & Context | 3-4 days | 3.5 | 6 |
| 3: AI Settings Backend | 2-3 days | 2.5 | 8.5 |
| 4: Copilot Backend | 3-4 days | 3.5 | 12 |
| 5: Cost Tracking | 2 days | 2 | 14 |
| 6: Settings Frontend | 2-3 days | 2.5 | 16.5 |
| 7: Copilot Frontend | 3-4 days | 3.5 | 20 |
| 8: Insight Widgets | 2-3 days | 2.5 | 22.5 |
| 9: Testing & Optimization | 2-3 days | 2.5 | 25 |
| 10: Documentation & Deploy | 1-2 days | 1.5 | 26.5 |
| **TOTAL** | | **~27 days** | |

**Effort Estimate:** ~200 hours for full implementation  
**Recommended Team:** 2 Senior Engineers (backend + frontend)  
**Intensive Schedule:** 3-4 weeks  
**Standard Schedule:** 5-6 weeks

---

## CORE SERVICES ARCHITECTURE

### Service 1: OpenRouter Integration
```
openRouterService.js
├─ initialize() - Setup API client
├─ callModel(model, prompt, options) - Primary method
├─ listModels() - Get available models
├─ estimateCost(tokens, model) - Cost calculation
└─ health() - Health check
```

### Service 2: Model Router
```
modelRouterService.js
├─ selectModel(taskType, context) - Intelligent routing
├─ getModelConfig(model) - Model settings
├─ getFallbackModel(primaryModel) - Fallback logic
└─ getAvailableModels(taskType) - Filter by task
```

### Service 3: Context Builder
```
contextService.js
├─ buildCustomerContext(customerId) - Customer data
├─ buildRevenueContext(timeframe) - Revenue data
├─ buildCollectionContext(collectionId) - Collection data
├─ buildPackContext(packId) - Pack data
├─ buildTimelineContext(entityType, entityId) - Timeline
└─ buildFullBusinessContext() - Complete picture
```

### Service 4: Memory Engine
```
memoryService.js
├─ storeMemory(type, entity, content) - Create memory
├─ retrieveMemories(entityType, entityId) - Get memories
├─ linkMemory(memoryId, entities) - Link to entities
├─ updateMemoryScore(memoryId, relevance) - Scoring
├─ deleteMemory(memoryId) - Remove memory
└─ searchMemories(query) - Memory search
```

### Service 5: Prompt Builder
```
promptBuilderService.js
├─ buildSystemPrompt(role, taskType) - System message
├─ buildUserPrompt(question, context) - User message
├─ injectContext(prompt, contextData) - Add context
├─ formatMemory(memories) - Memory formatting
└─ buildChain(taskType) - Multi-step prompts
```

### Service 6: Copilot Service
```
copilotService.js
├─ processQuestion(question, userId, context) - Main flow
├─ understandQuestion(question) - Intent detection
├─ assembleContext(question, userId) - Get context
├─ selectModel(question) - Choose model
├─ generateResponse(prompt, model) - Call OpenRouter
├─ storeConversation(input, output, context) - Log
└─ generateRecommendations(response, context) - Insights
```

### Service 7: Insight Service
```
insightService.js
├─ generateRevenueInsights(timeframe) - Revenue data
├─ generateCustomerInsights(userId) - Customer data
├─ generateCollectionInsights(collectionId) - Collection
├─ generatePackInsights(packId) - Pack data
├─ generateGrowthInsights(metric, timeframe) - Trends
├─ generateRiskInsights() - Problems to watch
└─ generateOpportunityInsights() - Recommendations
```

### Service 8: Recommendation Engine
```
recommendationService.js
├─ getUpsellOpportunities(customerId) - Upsell
├─ getCrossSellOpportunities(customerId) - Cross-sell
├─ getRetentionCampaigns() - At-risk customers
├─ getPackOpportunities(customerId) - Pack recs
├─ getCollectionExpansion() - Collection growth
├─ getRevenueOpportunities() - Revenue growth
└─ scoreRecommendation(rec) - Recommendation ranking
```

---

## DATABASE SCHEMA

### Table 1: ai_memory
```sql
CREATE TABLE ai_memory (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,        -- 'customer', 'product', 'pattern'
  entity_id TEXT NOT NULL,
  content TEXT NOT NULL,             -- The memory content
  memory_type TEXT,                  -- 'preference', 'behavior', 'insight'
  relevance_score FLOAT DEFAULT 1.0,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  created_by TEXT,
  last_accessed TIMESTAMP
);
```

### Table 2: ai_memory_links
```sql
CREATE TABLE ai_memory_links (
  id TEXT PRIMARY KEY,
  memory_id TEXT NOT NULL,
  linked_entity_type TEXT,          -- 'customer', 'invoice', 'payment'
  linked_entity_id TEXT,
  link_strength FLOAT DEFAULT 1.0,
  created_at TIMESTAMP,
  FOREIGN KEY (memory_id) REFERENCES ai_memory(id)
);
```

### Table 3: ai_conversations
```sql
CREATE TABLE ai_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  message_count INT DEFAULT 0,
  context_snapshot JSONB            -- Business context at time
);
```

### Table 4: ai_messages
```sql
CREATE TABLE ai_messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT,                         -- 'user' or 'assistant'
  content TEXT NOT NULL,
  model_used TEXT,
  tokens_used INT,
  estimated_cost FLOAT,
  context_entities JSONB,           -- Entities mentioned
  created_at TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
);
```

### Table 5: ai_settings
```sql
CREATE TABLE ai_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL,
  openrouter_api_key TEXT NOT NULL,  -- Encrypted
  default_model TEXT,
  fallback_model TEXT,
  temperature FLOAT DEFAULT 0.7,
  max_tokens INT DEFAULT 2000,
  context_length INT DEFAULT 8000,
  enable_ai_memory BOOLEAN DEFAULT TRUE,
  enable_recommendations BOOLEAN DEFAULT TRUE,
  enable_business_insights BOOLEAN DEFAULT TRUE,
  enable_forecasting BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

### Table 6: ai_usage_log
```sql
CREATE TABLE ai_usage_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  model_used TEXT,
  request_type TEXT,                -- 'copilot', 'insight', 'recommendation'
  tokens_input INT,
  tokens_output INT,
  estimated_cost FLOAT,
  response_time_ms INT,
  success BOOLEAN,
  error_message TEXT,
  created_at TIMESTAMP
);
```

---

## ENVIRONMENT VARIABLES

```env
# OpenRouter Configuration
OPENROUTER_API_KEY=your_key_here
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_APP_NAME=InWoice

# Default Models
DEFAULT_MODEL=claude-3-sonnet
FALLBACK_MODEL=gpt-4o-mini
FAST_MODEL=gpt-4o-mini
ANALYSIS_MODEL=claude-3-sonnet

# Model Parameters
AI_TEMPERATURE=0.7
AI_MAX_TOKENS=2000
AI_CONTEXT_LENGTH=8000

# Features
ENABLE_AI_MEMORY=true
ENABLE_RECOMMENDATIONS=true
ENABLE_BUSINESS_INSIGHTS=true
ENABLE_FORECASTING=false

# Costs (for estimation)
COST_PER_1K_INPUT_TOKENS=0.003
COST_PER_1K_OUTPUT_TOKENS=0.009

# Logging
AI_LOG_LEVEL=info
AI_LOG_ALL_REQUESTS=true
```

---

## ROUTE STRUCTURE

### New Routes

```javascript
// aiSettingsRoutes.js
POST   /api/ai/settings              // Save settings
GET    /api/ai/settings              // Get settings
PUT    /api/ai/settings/:id          // Update settings

// aiCopilotRoutes.js
POST   /api/ai/copilot/ask           // Ask question
GET    /api/ai/copilot/conversations // Get history
GET    /api/ai/copilot/suggestions   // Suggested questions
POST   /api/ai/copilot/context       // Get current context

// aiInsightsRoutes.js (Enhanced)
GET    /api/ai/insights/revenue      // Revenue insights
GET    /api/ai/insights/customer/:id // Customer insights
GET    /api/ai/insights/collections  // Collection insights
GET    /api/ai/insights/packs        // Pack insights
GET    /api/ai/insights/growth       // Growth trends
GET    /api/ai/insights/risk         // Risk analysis

// aiMemoryRoutes.js
POST   /api/ai/memory                // Create memory
GET    /api/ai/memory/entity/:type/:id // Get memories
PUT    /api/ai/memory/:id            // Update memory
DELETE /api/ai/memory/:id            // Delete memory

// aiUsageRoutes.js
GET    /api/ai/usage/summary         // Usage stats
GET    /api/ai/usage/costs           // Cost breakdown
GET    /api/ai/usage/models          // Model usage
```

---

## COMPONENT ARCHITECTURE

### Frontend Components

```
src/components/AI/
├─ AISettings.jsx                   // Settings page
├─ BusinessCopilot.jsx              // Main copilot panel
├─ AIInsightsCard.jsx               // Dashboard widget
├─ CustomerAISummary.jsx            // In customer page
├─ ProductAISummary.jsx             // In product page
├─ CollectionAISummary.jsx          // In collection page
├─ PackAISummary.jsx                // In pack page
├─ AIContext.jsx                    // Context display
├─ AIConversationHistory.jsx        // Chat history
└─ AIRecommendations.jsx            // Recommendations panel

src/pages/
├─ AISettings.jsx                   // Main settings page
└─ AICopilot.jsx                    // Full copilot page
```

---

## SUCCESS METRICS

### Functionality
- ✅ All 8 services implemented
- ✅ All 6 database tables created
- ✅ All 13 API routes working
- ✅ All 10 frontend components deployed

### Performance
- Response time: < 3 seconds (with context assembly)
- Memory retrieval: < 500ms
- Context assembly: < 1 second
- Insight generation: < 2 seconds

### Reliability
- 99.9% uptime
- Graceful fallback to Fallback Model
- Zero API key exposures
- All interactions logged

### Coverage
- 60+ unit tests
- 20+ integration tests
- 30+ component tests
- 100% service code coverage

---

## SECURITY CONSIDERATIONS

1. **API Key Management**
   - Never expose OpenRouter key to frontend
   - Encrypt key in database
   - Rotate key regularly
   - Log all API calls for audit

2. **Access Control**
   - Only authenticated users can access AI
   - User settings isolated
   - Memory scoped to user
   - Conversation history private

3. **Data Protection**
   - No sensitive customer data sent to OpenRouter
   - Prompt injection protection
   - Input validation on all queries
   - Output sanitization

4. **Audit Trail**
   - Log all AI requests
   - Track model usage
   - Monitor costs
   - Detect anomalies

---

## RISK MITIGATION

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| OpenRouter API downtime | Medium | High | Fallback model on standby |
| High token usage costs | Medium | Medium | Rate limiting + monitoring |
| Model hallucinations | High | Medium | Response validation + disclaimers |
| Data privacy issues | Low | Critical | No sensitive data to OpenRouter |
| API key exposure | Low | Critical | Encryption + secret management |

---

## NEXT STEPS

1. **Immediate (Today)**
   - Create database migration file
   - Create openRouterService.js
   - Create modelRouterService.js
   - Add environment variables

2. **This Week**
   - Complete Phase 1 foundation
   - Start Phase 2 memory system
   - Begin Phase 3 settings backend

3. **Next Week**
   - Complete Phases 3-5
   - Start frontend integration

4. **Following Week**
   - Complete frontend
   - Testing & optimization

---

## APPROVAL CHECKPOINTS

- [ ] Architecture approved
- [ ] Database schema approved
- [ ] Environment variables configured
- [ ] Phase 1 complete and tested
- [ ] Phase 2 memory system working
- [ ] Phase 3-5 backend complete
- [ ] Phases 6-8 frontend complete
- [ ] All 60+ tests passing
- [ ] Security audit passed
- [ ] Ready for production deployment

---

**Master Plan Status:** Ready for Implementation  
**Prepared by:** Lead AI Architect  
**Date:** June 12, 2026
