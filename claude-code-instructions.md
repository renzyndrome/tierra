# Quest Laguna 10th Anniversary - Attendance Registration System

## 🎯 Project Overview

Build an MVP attendance registration system for a church anniversary event with the following core features:

1. **QR Code Registration** - Attendees scan QR → fill form → data saved with timestamp
2. **Public Display Screen** - Shows QR code + live stats (for projector/TV)
3. **Admin Dashboard** - Analytics, AI-powered insights, mentorship matching

**Event Details:**
- Expected attendees: ~200
- Data retention: Cleared within hours after event
- Registration is one-time, non-editable

---

## ⚠️ CRITICAL: TanStack Start Instructions

**TanStack Start is a new framework (Release Candidate as of late 2025). Always follow these rules:**

### Before Writing Any TanStack Code:

1. **ALWAYS fetch the latest documentation first:**
   ```
   /web fetch https://tanstack.com/start/latest/docs/framework/react/overview
   /web fetch https://tanstack.com/start/latest/docs/framework/react/quick-start
   ```

2. **For specific features, search the docs:**
   ```
   /web search tanstack start server functions 2025
   /web search tanstack start file routing latest
   /web search tanstack start loader data fetching
   ```

3. **Check GitHub for examples:**
   ```
   /web fetch https://github.com/TanStack/router/tree/main/examples/react/start-basic
   ```

4. **If you encounter errors or uncertainty:**
   - Search for the specific error message
   - Check TanStack Discord or GitHub issues
   - Always prefer official docs over older tutorials

### Key TanStack Start Concepts to Verify:

- [ ] `createFileRoute` syntax for route definitions
- [ ] `createServerFn` for server functions
- [ ] Route file naming conventions (`__root.tsx`, `index.tsx`, `$param.tsx`)
- [ ] Loader and action patterns
- [ ] How to handle SSR vs client-only components

---

## 🛠️ Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | TanStack Start (React) | Use latest RC version |
| Styling | Tailwind CSS v4 | Check latest syntax |
| Database | Supabase | PostgreSQL + Realtime |
| Charts | Recharts | For analytics dashboard |
| AI | OpenAI API (gpt-4o) | For insights + matching |
| Validation | Zod | Form + server validation |
| QR Code | `qrcode.react` | Static QR generation |
| Deployment | Vercel or Netlify | TanStack Start compatible |

### Package Installation

```bash
# Create project - VERIFY this command with latest docs
pnpm create @tanstack/start my-app
cd my-app

# Core dependencies
pnpm add @supabase/supabase-js zod recharts qrcode.react openai

# Dev dependencies
pnpm add -D @types/node
```

---

## 📁 Project Structure

```
src/
├── routes/
│   ├── __root.tsx              # Root layout with providers
│   ├── index.tsx               # Redirect to /register
│   ├── register.tsx            # Public registration form
│   ├── display.tsx             # Public screen (QR + live stats)
│   └── admin/
│       ├── index.tsx           # Main dashboard
│       └── -components/        # Admin-only components (colocated)
│           ├── StatsCards.tsx
│           ├── Charts.tsx
│           ├── AIChat.tsx
│           └── MentorMatch.tsx
├── components/
│   ├── ui/                     # Reusable UI components
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   ├── Select.tsx
│   │   └── Card.tsx
│   ├── RegistrationForm.tsx
│   ├── LiveStats.tsx
│   └── QRCodeDisplay.tsx
├── lib/
│   ├── supabase.ts             # Supabase client (client + server)
│   ├── openai.ts               # OpenAI helper functions
│   ├── types.ts                # Shared TypeScript types
│   └── constants.ts            # App constants (satellites, stages)
├── server/
│   └── functions/
│       ├── attendees.ts        # CRUD for attendees
│       ├── analytics.ts        # Stats aggregation
│       └── ai.ts               # OpenAI integration
└── styles/
    └── globals.css             # Tailwind imports
```

---

## 🗄️ Database Schema (Supabase)

### Create this in Supabase SQL Editor:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Main attendees table
CREATE TABLE attendees (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  age INTEGER NOT NULL CHECK (age > 0 AND age < 120),
  city TEXT NOT NULL,
  satellite TEXT NOT NULL CHECK (satellite IN ('Quest Laguna Main', 'Quest Biñan', 'Quest Sta. Rosa')),
  discipleship_stage TEXT NOT NULL CHECK (discipleship_stage IN ('Newbie', 'Growing', 'Leader')),
  spiritual_description TEXT NOT NULL,
  
  -- AI-computed fields (nullable, filled async)
  spiritual_score FLOAT CHECK (spiritual_score >= 1 AND spiritual_score <= 10),
  spiritual_sentiment TEXT CHECK (spiritual_sentiment IN ('struggling', 'stable', 'thriving')),
  needs_support BOOLEAN DEFAULT FALSE,
  
  -- Timestamps
  registered_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_attendees_satellite ON attendees(satellite);
CREATE INDEX idx_attendees_stage ON attendees(discipleship_stage);
CREATE INDEX idx_attendees_registered_at ON attendees(registered_at);
CREATE INDEX idx_attendees_needs_support ON attendees(needs_support) WHERE needs_support = TRUE;

-- Enable Row Level Security (optional for MVP, but good practice)
ALTER TABLE attendees ENABLE ROW LEVEL SECURITY;

-- Policy: Allow all operations for now (MVP)
CREATE POLICY "Allow all for MVP" ON attendees FOR ALL USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE attendees;
```

### Environment Variables (.env):

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
OPENAI_API_KEY=your_openai_api_key
ADMIN_PIN=quest2026
```

---

## 📝 Feature Specifications

### 1. Registration Form (`/register`)

**Route:** `/register`
**Access:** Public
**Mobile-first design**

**Form Fields:**

| Field | Type | Validation |
|-------|------|------------|
| name | text input | Required, 2-100 chars, trim whitespace |
| age | number input | Required, 1-99 |
| city | text input | Required, 2-50 chars |
| satellite | radio group | Required, one of 3 options |
| discipleship_stage | radio group | Required, one of 3 options |
| spiritual_description | textarea | Required, 10-500 chars |

**Satellite Options:**
- Quest Laguna Main
- Quest Biñan
- Quest Sta. Rosa

**Discipleship Stage Options:**
- Newbie (New believer or first-time attendee)
- Growing (Regular member in discipleship)
- Leader (Small group leader or ministry head)

**Behavior:**
- On submit: Save to Supabase with `registered_at` timestamp
- Show success message with confetti or celebration UI
- No back button, no edit capability
- Disable submit button after successful submission

**Success Message:**
```
🎉 Welcome to NXTLEVEL Stronger 2026!
You're officially registered. See you at the event!
```

---

### 2. Public Display Screen (`/display`)

**Route:** `/display`
**Access:** Public (shown on projector/TV)
**Auto-refreshes every 10 seconds**

**Layout (Side by Side or Rotating):**

```
┌─────────────────────────────────────────────────────────────────┐
│              QUEST LAGUNA 10TH ANNIVERSARY                      │
│                 NXTLEVEL STRONGER 2026                          │
├───────────────────────────┬─────────────────────────────────────┤
│                           │                                     │
│       ┌─────────┐         │   📊 LIVE REGISTRATION STATS        │
│       │ QR CODE │         │                                     │
│       │         │         │   Total Registered: 147             │
│       └─────────┘         │                                     │
│                           │   By Satellite:                     │
│    Scan to Register!      │   ▓▓▓▓▓▓▓▓░░ Quest Main (82)        │
│                           │   ▓▓▓▓▓░░░░░ Quest Biñan (41)       │
│                           │   ▓▓▓░░░░░░░ Quest Sta. Rosa (24)   │
│                           │                                     │
│                           │   Early Birds (before 9AM): 89      │
│                           │                                     │
│                           │   Latest: "Juan dela Cruz" 🎉       │
│                           │                                     │
└───────────────────────────┴─────────────────────────────────────┘
```

**Features:**
- Large, scannable QR code pointing to `/register`
- Real-time stats using Supabase Realtime subscription
- Show latest registration name (first name only for privacy)
- Early bird count (registrations before configurable cutoff time, default 9:00 AM)
- Clean, readable from distance (large fonts)
- Optional: Cycle through fun facts every 30 seconds

---

### 3. Admin Dashboard (`/admin`)

**Route:** `/admin`
**Access:** Protected with PIN (simple, no full auth for MVP)

**PIN Protection Flow:**
1. Show PIN input modal on first visit
2. Store in sessionStorage if correct
3. PIN: `quest2026` (from env var)

**Dashboard Sections:**

#### A. Stats Overview Cards
- Total Registrations
- By Satellite (3 cards)
- By Discipleship Stage (3 cards)
- Early Birds Count
- Average Age

#### B. Charts Section
- **Age Distribution**: Histogram (10-year buckets)
- **Satellite Breakdown**: Pie chart
- **Discipleship Stages**: Bar chart
- **Registration Timeline**: Line chart (hourly)

#### C. Filters
- Filter by satellite
- Filter by discipleship stage
- Filter by time range (early bird vs late)

#### D. Data Table
- Sortable, searchable table of all attendees
- Columns: Name, Age, City, Satellite, Stage, Registered At
- Click row to see full spiritual description

#### E. AI Insights Panel
- Text input for custom questions
- Example questions:
  - "How many newbies from Biñan are struggling?"
  - "What are common themes in spiritual descriptions?"
  - "Summarize the overall spiritual health of attendees"
- Show AI response with loading state

#### F. Mentorship Matching
- List of attendees flagged as `needs_support = true`
- For each, suggest potential mentors (Leaders with high spiritual scores from same satellite)
- Allow manual override/assignment

#### G. Actions
- **Refresh Data** button
- **Analyze All** button (run AI analysis on all unprocessed entries)
- **Export CSV** button
- **Purge All Data** button (with confirmation modal)

---

## 🤖 AI Integration Specifications

### 1. Spiritual Analysis (Background Processing)

**Trigger:** After form submission OR via "Analyze All" button

**OpenAI Prompt:**
```
You are analyzing a church member's self-description of their spiritual life.

Based on this description, provide:
1. spiritual_score: A number from 1-10 (1=struggling greatly, 10=thriving spiritually)
2. spiritual_sentiment: One of "struggling", "stable", or "thriving"
3. needs_support: Boolean - true if they seem to need pastoral care or mentorship
4. key_themes: Array of 2-3 words describing their spiritual state

Description: "{spiritual_description}"

Respond ONLY with valid JSON, no markdown:
{"spiritual_score": 7, "spiritual_sentiment": "stable", "needs_support": false, "key_themes": ["growing", "seeking community"]}
```

### 2. Custom Query Interface

**Flow:**
1. Admin types question
2. Backend aggregates relevant stats
3. Sends stats + question to OpenAI
4. Returns natural language insight

**OpenAI Prompt:**
```
You are an analytics assistant for a church event registration system.

Here is the current data summary:
- Total attendees: {total}
- By satellite: {satellite_breakdown}
- By stage: {stage_breakdown}
- Age stats: avg {avg_age}, min {min_age}, max {max_age}
- Struggling members: {struggling_count}
- Thriving members: {thriving_count}

Spiritual descriptions sample:
{sample_descriptions}

User question: "{question}"

Provide a helpful, concise answer based on the data. If you can't answer from the data, say so.
```

### 3. Mentorship Matching Algorithm

```
For each attendee WHERE needs_support = TRUE:

1. Find potential mentors:
   - Same satellite (required)
   - discipleship_stage = 'Leader'
   - spiritual_score >= 7
   
2. Rank by:
   - Same city (+3 points)
   - Age within 10 years (+2 points)
   - Higher spiritual_score (+1 per point above 7)
   
3. Return top 3 matches
```

---

## 🔧 Server Functions

### `/server/functions/attendees.ts`

```typescript
// VERIFY createServerFn syntax with latest docs before implementing!

// Register new attendee
export const registerAttendee = createServerFn(...)

// Get all attendees (with optional filters)
export const getAttendees = createServerFn(...)

// Get single attendee by ID
export const getAttendee = createServerFn(...)

// Update attendee (for AI fields)
export const updateAttendeeAI = createServerFn(...)

// Delete all attendees (purge)
export const purgeAllAttendees = createServerFn(...)
```

### `/server/functions/analytics.ts`

```typescript
// Get dashboard stats
export const getDashboardStats = createServerFn(...)

// Get age distribution
export const getAgeDistribution = createServerFn(...)

// Get registration timeline
export const getRegistrationTimeline = createServerFn(...)

// Get early bird count
export const getEarlyBirdCount = createServerFn(...)
```

### `/server/functions/ai.ts`

```typescript
// Analyze single spiritual description
export const analyzeSpiritual = createServerFn(...)

// Analyze all unprocessed attendees
export const analyzeAllUnprocessed = createServerFn(...)

// Custom query
export const askCustomQuestion = createServerFn(...)

// Get mentor matches for attendee
export const getMentorMatches = createServerFn(...)
```

---

## 🎨 UI/UX Guidelines

### Colors (Church Branding)
```css
:root {
  --primary: #4F46E5;      /* Indigo - main actions */
  --secondary: #10B981;    /* Emerald - success states */
  --accent: #F59E0B;       /* Amber - highlights */
  --background: #F9FAFB;   /* Light gray */
  --foreground: #111827;   /* Near black */
}
```

### Typography
- Headings: Bold, clean sans-serif
- Body: Regular weight, good readability
- Display screen: Extra large for visibility

### Mobile First
- Registration form must work perfectly on mobile
- Touch-friendly inputs (min 44px tap targets)
- No horizontal scrolling

---

## 🚀 Development Steps

### Phase 1: Setup (Day 1)
1. Create TanStack Start project
2. Configure Tailwind
3. Setup Supabase client
4. Create database schema
5. Test connection

### Phase 2: Registration (Day 1-2)
1. Build registration form with Zod validation
2. Implement server function for saving
3. Add success state
4. Test on mobile

### Phase 3: Display Screen (Day 2)
1. Create display route
2. Implement Supabase realtime subscription
3. Add QR code component
4. Style for large screen visibility

### Phase 4: Admin Dashboard (Day 3)
1. PIN protection
2. Stats cards
3. Charts integration
4. Data table

### Phase 5: AI Features (Day 4)
1. OpenAI integration
2. Spiritual analysis function
3. Custom query interface
4. Mentorship matching

### Phase 6: Polish (Day 5)
1. Error handling
2. Loading states
3. Mobile testing
4. Deploy to Vercel/Netlify
5. Generate production QR code

---

## 🧪 Testing Checklist

- [ ] Form validation works for all fields
- [ ] Duplicate submissions are prevented (disable button)
- [ ] Realtime updates work on display screen
- [ ] QR code is scannable from 3+ meters
- [ ] Admin PIN protection works
- [ ] Charts render with real data
- [ ] AI analysis returns valid JSON
- [ ] Mentorship matching returns results
- [ ] Purge data function works
- [ ] Mobile responsive on all routes
- [ ] Works offline-ish (graceful error handling)

---

## 📋 Environment Setup for Claude Code

When starting work, run these commands:

```bash
# 1. Fetch latest TanStack Start docs
/web fetch https://tanstack.com/start/latest/docs/framework/react/quick-start

# 2. Check for any breaking changes
/web search tanstack start breaking changes 2025

# 3. Verify server function syntax
/web search tanstack start createServerFn example

# 4. Check Supabase realtime with React
/web search supabase realtime react hooks 2025
```

---

## 🆘 Troubleshooting Guide

### If TanStack Start build fails:
```
/web search tanstack start [error message]
```

### If server functions don't work:
```
/web fetch https://tanstack.com/start/latest/docs/framework/react/server-functions
```

### If routing is confusing:
```
/web fetch https://tanstack.com/router/latest/docs/framework/react/guide/file-based-routing
```

### If Supabase realtime doesn't update:
- Check if table is added to realtime publication
- Verify RLS policies allow read access
- Check browser console for subscription errors

---

## 💡 Tips for Claude Code

1. **Always start with docs** - TanStack Start is new, verify syntax
2. **Build incrementally** - Test each feature before moving on
3. **Use TypeScript strictly** - Catch errors early
4. **Console.log liberally** - Debug server functions carefully
5. **Mobile test often** - Registration form is mobile-first
6. **Commit frequently** - Easy to rollback if something breaks

---

## 🎯 Success Criteria

The MVP is complete when:

1. ✅ Attendees can scan QR and register successfully
2. ✅ Display screen shows live updating stats
3. ✅ Admin can view all analytics
4. ✅ AI can analyze spiritual descriptions
5. ✅ Admin can see suggested mentor matches
6. ✅ Data can be purged after event

---

## 📞 Quick Reference

**Supabase Table:** `attendees`
**Admin PIN:** `quest2026`
**Early Bird Cutoff:** 9:00 AM (configurable)
**QR URL:** `https://[your-domain]/register`

**Satellites:**
- Quest Laguna Main
- Quest Biñan
- Quest Sta. Rosa

**Discipleship Stages:**
- Newbie
- Growing
- Leader

---

Good luck! 🙏 May this tool bless your church's 10th anniversary celebration!
