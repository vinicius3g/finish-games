create table if not exists games (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  platform text not null default 'PC',
  status text not null default 'Zerado',
  finished_at date,
  hours numeric not null default 0,
  ach int not null default 0,
  ach_total int not null default 0,
  rating int not null default 0,
  notes text,
  cover text,
  steam_appid int unique,
  created_at timestamptz not null default now()
);
-- RLS ligado e sem policies: só o backend (service role) acessa.
alter table games enable row level security;
