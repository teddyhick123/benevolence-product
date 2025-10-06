# AI Portfolio Manager - Setup Guide

## Overview
The AI Portfolio Manager is a conversational assistant that helps users manage their impact investment portfolio through natural language commands. It can create/update/delete holdings, add metrics, create widgets, and more - with full undo/redo capability.

## What We Built

### 1. Database Schema (`db/0012_ai_portfolio_manager.sql`)
- **ai_sessions** - Tracks conversation sessions with the AI
- **ai_actions** - Logs all AI-initiated changes with before/after state for undo/redo
- Helper functions for session management and undo/redo operations

### 2. Backend Infrastructure

#### **AI Assistant Library** (`lib/ai-assistant.ts`)
- `AIPortfolioAssistant` class that integrates with OpenAI
- Function calling tools for portfolio operations:
  - `add_holding` - Create new holdings
  - `update_holding` - Update existing holdings
  - `remove_holding` - Delete holdings
  - `add_metric_fact` - Add KPI data
  - `create_widget` - Create visualizations
  - `add_location` - Add geographic locations
  - `list_holdings` - Query holdings
  - `get_holding_details` - Get detailed info

#### **Action Executor** (`lib/ai-action-executor.ts`)
- `AIActionExecutor` class that:
  - Executes database operations
  - Logs actions for undo/redo
  - Implements undo logic (reverses operations)
  - Implements redo logic (reapplies operations)
  - Supports batch undo/redo

### 3. API Routes

#### **Chat Endpoint** (`app/api/ai/chat/route.ts`)
- `POST /api/ai/chat` - Send messages to AI assistant
- `GET /api/ai/chat?portfolioId=xxx` - Get conversation history
- Manages sessions, conversation state, and action execution

#### **Undo/Redo Endpoints**
- `POST /api/ai/undo` - Undo an action or batch (`app/api/ai/undo/route.ts`)
- `GET /api/ai/undo?portfolioId=xxx` - Get action history
- `POST /api/ai/redo` - Redo an undone action (`app/api/ai/redo/route.ts`)

### 4. UI Components

#### **AIAssistantPanel** (`components/AIAssistantPanel.tsx`)
- Full-featured chat interface
- Message history with timestamps
- Recent actions list with undo/redo buttons
- Loading states and error handling

#### **AIAssistantButton** (`components/AIAssistantButton.tsx`)
- Floating action button to open the assistant
- Slide-in panel with assistant interface

## How to Use

### 1. Run Database Migration
```bash
# Apply the schema (use your preferred method - Supabase dashboard, psql, etc.)
psql $DATABASE_URL -f db/0012_ai_portfolio_manager.sql
```

### 2. Add AI Assistant to Your Pages
```tsx
import AIAssistantButton from '@/components/AIAssistantButton';

export default function DashboardPage({ portfolioId }) {
  return (
    <div>
      {/* Your page content */}

      {/* Add the AI Assistant */}
      <AIAssistantButton portfolioId={portfolioId} />
    </div>
  );
}
```

### 3. Example Interactions

**User:** "Add a new solar energy holding for $500,000"
- AI creates a holding with the specified details
- Action is logged for undo

**User:** "Create a carbon emissions widget for that holding"
- AI creates a visualization widget
- Action is logged

**User:** "Actually, undo the widget"
- AI reverses the widget creation
- Widget is removed from the database

**User:** "Show me all my holdings"
- AI queries and displays holdings list
- No action logged (read-only)

## Architecture Highlights

### Undo/Redo System
The undo system works by:
1. **Logging before/after state** - Every change stores original and new values
2. **Reversible operations**:
   - CREATE → DELETE (undo) / CREATE (redo)
   - UPDATE → UPDATE with old values (undo) / UPDATE with new values (redo)
   - DELETE → CREATE with original (undo) / DELETE (redo)
3. **Batch support** - Related actions can be undone together

### Security
- RLS policies ensure users can only access their portfolio's data
- Actions require editor/owner permissions
- Service role is used for AI operations with proper authorization checks

### Conversation Management
- Sessions auto-expire after 24 hours of inactivity
- Conversation history is preserved in the database
- Context includes current portfolio state for better AI responses

## Environment Variables Required
```env
OPENAI_API_KEY=sk-...
NEXT_PUBLIC_SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE=eyJ...
```

## Next Steps / Enhancements

1. **Add confirmation dialogs** for destructive actions
2. **Batch approval mode** - Preview multiple changes before applying
3. **Natural language search** - "Find all renewable energy holdings"
4. **Bulk operations** - "Update all solar holdings to Active status"
5. **Export/Import** - "Export holdings to CSV"
6. **Analytics** - "What's my portfolio's total carbon footprint?"
7. **Scheduled actions** - "Remind me to update metrics monthly"

## Troubleshooting

### AI not responding
- Check OPENAI_API_KEY is set
- Verify user has access to the portfolio
- Check browser console for errors

### Undo not working
- Ensure action was successfully logged (check ai_actions table)
- Verify action status is 'applied'
- Check for foreign key constraints preventing deletion

### Actions not appearing
- Verify RLS policies allow user to read ai_actions
- Check portfolio_id matches correctly
- Ensure session_id is being passed properly
