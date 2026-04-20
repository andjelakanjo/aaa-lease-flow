-- UI preferences per profile (theme, etc.)
-- Applied manually in Supabase SQL editor, same as other migrations.

create table if not exists public.ui_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','light')),
  updated_at timestamptz not null default now()
);

create or replace function public.set_updated_at_ui_preferences()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_ui_preferences_updated_at on public.ui_preferences;
create trigger trg_ui_preferences_updated_at
before update on public.ui_preferences
for each row execute function public.set_updated_at_ui_preferences();

