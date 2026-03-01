# Supabase Setup Guide — MMC Build

## Your Supabase Project
- **URL**: https://skyeqimwnyuuozvhubdc.supabase.co
- **Region**: Must be Sydney (ap-southeast-2) for AU data residency

## Step 1: Run the SQL Setup

1. Go to https://skyeqimwnyuuozvhubdc.supabase.co → **SQL Editor**
2. Click **New Query**
3. Copy and paste the entire contents of `supabase/setup_complete.sql`
4. Click **Run** (or Ctrl+Enter)
5. You should see: `SETUP COMPLETE` with table/policy/bucket counts

## Step 2: Configure Auth Settings

Go to **Authentication** → **URL Configuration**:

| Setting | Value |
|---------|-------|
| Site URL | `https://mmcbuild-one.vercel.app` |
| Redirect URLs | `https://mmcbuild-one.vercel.app/auth/callback` |
| | `https://mmcbuild-corporate-ai-solutions.vercel.app/auth/callback` |
| | `https://mmcbuild-git-main-corporate-ai-solutions.vercel.app/auth/callback` |
| | `http://localhost:3000/auth/callback` |

Go to **Authentication** → **Providers**:
- **Email**: Enabled (default)
  - Confirm email: ON (recommended) or OFF for dev
  - Secure email change: ON
  - Enable Magic Links (OTP): ON

Go to **Authentication** → **Email Templates** (optional, can customise later):
- Confirm signup template
- Magic link template
- Reset password template

## Step 3: Get Your API Keys

Go to **Settings** → **API**:

| Key | Where to use |
|-----|-------------|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| anon/public key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| service_role key | `SUPABASE_SERVICE_ROLE_KEY` (server-side only, never expose to client) |

## Step 4: Set Environment Variables

### Local Development (.env.local)
Create `C:\Users\denni\PycharmProjects\MMCBuild\.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=https://skyeqimwnyuuozvhubdc.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Vercel Environment Variables
Go to https://vercel.com/corporate-ai-solutions/mmcbuild/settings/environment-variables

Add these for **Production**, **Preview**, and **Development**:
- `NEXT_PUBLIC_SUPABASE_URL` = `https://skyeqimwnyuuozvhubdc.supabase.co`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `<your-anon-key>`
- `SUPABASE_SERVICE_ROLE_KEY` = `<your-service-role-key>`
- `NEXT_PUBLIC_APP_URL` = `https://mmcbuild-one.vercel.app`

## Step 5: Verify Storage Buckets

Go to **Storage** in the Supabase dashboard. You should see 5 buckets:

| Bucket | Access | Max Size | Purpose |
|--------|--------|----------|---------|
| `plan-uploads` | Private | 50MB | Building plan PDFs |
| `reports` | Private | 25MB | Generated reports (PDF, XLSX) |
| `rd-evidence` | Private | 50MB | R&D evidence artifacts |
| `supplier-data` | Private | 25MB | Supplier price lists |
| `training-content` | Public | 100MB | Course materials |

## Step 6: Verify RLS Policies

Go to **Authentication** → **Policies** (or check Table Editor → each table → Policies):

- `organisations`: 3 policies (select, update, insert)
- `profiles`: 4 policies (select, update, 2x insert)
- `projects`: 4 policies (select, insert, update, delete)
- `project_members`: 3 policies (select, insert, delete)
- `feedback`: 3 policies (2x select, insert)
- `audit_log`: 2 policies (select, insert)
- Storage policies on `storage.objects` for each bucket

## What the SQL Creates

### Tables (6)
1. `organisations` — Multi-tenant org container
2. `profiles` — User profiles linked to auth.users, scoped to org
3. `projects` — Construction projects, scoped to org
4. `project_members` — Users assigned to projects
5. `feedback` — AI output feedback (thumbs up/down)
6. `audit_log` — Compliance action audit trail

### Functions (5)
1. `get_user_org_id()` — Returns current user's org_id (used in all RLS policies)
2. `update_updated_at()` — Auto-updates `updated_at` on row changes
3. `match_documents()` — pgvector similarity search for RAG (Stage 1)
4. `get_my_profile()` — RPC to get current user profile + org name
5. `user_has_role()` — RPC to check role-based access

### Storage Buckets (5)
All with org-scoped RLS policies via folder structure: `{org_id}/...`
