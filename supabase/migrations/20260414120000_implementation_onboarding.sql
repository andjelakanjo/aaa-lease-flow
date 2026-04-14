-- Implementation hub: vendors, private meetings/tasks/journal, measurable onboarding.
-- All access is intended to go through Express + service role (bypasses RLS).

-- ── Vendors (shared status board; company_id null = cross-company / super_admin scope) ──
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  name text not null,
  status text not null default 'active',
  notes text not null default '',
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists vendors_company_id_idx on public.vendors (company_id);

-- ── Private vendor meetings (owner_profile_id = viewer only) ──
create table if not exists public.vendor_meetings (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  owner_profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  scheduled_at timestamptz,
  meet_url text,
  recording_url text,
  created_at timestamptz not null default now()
);

create index if not exists vendor_meetings_owner_idx on public.vendor_meetings (owner_profile_id);
create index if not exists vendor_meetings_vendor_idx on public.vendor_meetings (vendor_id);

-- ── Implementation tasks (owner only) ──
create table if not exists public.implementation_tasks (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  due_at timestamptz,
  vendor_id uuid references public.vendors (id) on delete set null,
  task_type text not null default 'general',
  created_at timestamptz not null default now()
);

create index if not exists implementation_tasks_owner_idx on public.implementation_tasks (owner_profile_id);

-- ── Journal entries (owner only) ──
create table if not exists public.implementation_journal_entries (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  entry_date date not null default (timezone('utc', now()))::date,
  created_at timestamptz not null default now()
);

create index if not exists implementation_journal_owner_idx on public.implementation_journal_entries (owner_profile_id);
create index if not exists implementation_journal_entry_date_idx on public.implementation_journal_entries (entry_date desc);

-- ── Onboarding modules & progress ──
create table if not exists public.onboarding_modules (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  title_sr text not null,
  title_en text not null,
  sort_order int not null default 0,
  company_id uuid references public.companies (id) on delete cascade
);

create unique index if not exists onboarding_modules_key_global
  on public.onboarding_modules (key) where company_id is null;

create unique index if not exists onboarding_modules_key_per_company
  on public.onboarding_modules (company_id, key) where company_id is not null;

create index if not exists onboarding_modules_company_idx on public.onboarding_modules (company_id);

create table if not exists public.onboarding_progress (
  profile_id uuid not null references public.profiles (id) on delete cascade,
  module_key text not null,
  completed_at timestamptz not null default now(),
  quiz_score numeric,
  primary key (profile_id, module_key)
);

-- Seed global onboarding steps (company_id null)
insert into public.onboarding_modules (key, title_sr, title_en, sort_order, company_id)
select v.key, v.title_sr, v.title_en, v.sort_order, null::uuid
from (
  values
    ('team_map', 'Team mapa', 'Team map', 10),
    ('process_flow', 'Process flow', 'Process flow', 20),
    ('process_map', 'Process mapa', 'Process map', 30),
    ('key_docs', 'Ključna dokumenta', 'Key documents', 40),
    ('software_reqs', 'Software requirements', 'Software requirements', 50),
    ('glossary', 'Glosar', 'Glossary', 60),
    ('quiz', 'Kviz', 'Quiz', 70),
    ('contacts', 'Kontakti', 'Contacts', 80)
) as v(key, title_sr, title_en, sort_order)
where not exists (
  select 1 from public.onboarding_modules m where m.key = v.key and m.company_id is null
);

alter table public.vendors enable row level security;
alter table public.vendor_meetings enable row level security;
alter table public.implementation_tasks enable row level security;
alter table public.implementation_journal_entries enable row level security;
alter table public.onboarding_modules enable row level security;
alter table public.onboarding_progress enable row level security;
