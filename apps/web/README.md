# Web App

Planned `Next.js` frontend hosted on Vercel.

Responsibilities:
- school map and synced table
- district choropleth
- scoring scenario forms
- shortlist export actions
- methodology pages

The frontend should call the FastAPI service for all business logic and data access. It should not directly implement scoring logic.

## Local Setup

This app expects a running FastAPI backend.

1. Install Node.js 20+.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_API_BASE_URL`, for example:

```env
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
```

4. Install and run:

```bash
cd /Users/sonle/Documents/work/ADB/adb-school-optimize/apps/web
npm install
npm run dev
```

The current scaffold includes:
- school explorer with map + synced table
- district choropleth explorer
- scenario runner scaffold
- methodology panel
