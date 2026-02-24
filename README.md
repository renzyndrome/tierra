# Quest Laguna Directory (Tierra)

Church directory and member management system for Quest Laguna's 10th Anniversary.

## Features

- **Member Directory** - 300+ members with profiles, discipleship stages, and contact info
- **Cell Groups** - Group management with leaders, co-leaders, meeting schedules, and member assignments
- **Ministries** - Ministry teams with department organization and volunteer tracking
- **Satellites** - Multi-location satellite management with per-satellite member views
- **Events** - Event creation with QR-based registration, attendance tracking, and live display
- **Admin Dashboard** - Overview stats, charts, CRUD operations, and data management tools
- **Auth System** - Supabase Auth with role-based access (Super Admin, Satellite Leader, Cell Leader, Member)
- **AI Insights** - OpenAI-powered spiritual analysis and mentorship matching

## Tech Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) (React 19, SSR)
- **Styling:** Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com/)
- **Database:** [Supabase](https://supabase.com/) (PostgreSQL + Realtime + Auth)
- **Charts:** Recharts
- **AI:** OpenAI API (GPT-4o)
- **Validation:** Zod
- **QR Code:** qrcode.react
- **Testing:** Vitest

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm

### Setup

```bash
pnpm install
```

Create a `.env` file:

```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
OPENAI_API_KEY=your_openai_api_key
VITE_ADMIN_PIN=quest2026
ADMIN_EMAIL=your_admin_email
ADMIN_PASSWORD=your_admin_password
```

### Development

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Tests

```bash
pnpm test
```

## Project Structure

```
src/
  routes/
    __root.tsx            # Root layout with AuthProvider
    index.tsx             # Home redirect
    register.tsx          # Public event registration
    display.tsx           # Public display screen (QR + live stats)
    auth/                 # Login, register, forgot password
    admin/
      index.tsx           # Admin dashboard (all tabs)
      members/            # Member CRUD pages
      cell-groups/        # Cell group detail pages
      ministries/         # Ministry detail pages
    directory/            # Public directory views
    event/                # Event management
    profile/              # User profile & settings
  components/
    ui/                   # shadcn/ui components
    AuthProvider.tsx       # Auth context
    MemberCard.tsx         # Member card component
    CellGroupCard.tsx      # Cell group card component
    MinistryCard.tsx       # Ministry card component
  server/
    functions/            # Server functions (Supabase queries)
  lib/
    supabase.ts           # Supabase client setup
    types.ts              # TypeScript type definitions
    constants.ts          # App constants
```

## Data Import

Source data files (spreadsheets, raw JSON) live outside this repo in `../data/`. To use the import tools in the admin Settings tab:

1. Place `spreadsheet-raw.json` in `public/data/`
2. Use the Import, Re-link, or Generate Cell Groups tools from the Settings tab

## Admin Dashboard Tabs

| Tab | Description |
|-----|-------------|
| Overview | Stats cards, discipleship chart, satellite breakdown |
| Satellites | Satellite list with member counts, click for detail view |
| Members | Full directory with search, filters (stage/status/city/satellite), sorting |
| Cell Groups | Group cards with CRUD, member management |
| Ministries | Ministry cards with CRUD, member management |
| Events | Event creation and management |
| Settings | Data import, re-link relationships, purge tools |
