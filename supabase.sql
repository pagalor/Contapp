-- Contabilità: tabella per la sincronizzazione tra dispositivi.
-- Da incollare ed eseguire una volta nel SQL Editor del progetto Supabase.

create table public.records (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  data jsonb not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  server_ts timestamptz not null default now()
);

create index records_user_ts on public.records (user_id, server_ts);

-- Permessi della tabella per gli utenti che hanno effettuato l'accesso
-- (i progetti Supabase recenti non li assegnano più in automatico)
grant usage on schema public to authenticated;
grant select, insert, update, delete on table public.records to authenticated;

-- Ogni utente vede e modifica solo i propri dati
alter table public.records enable row level security;
create policy "solo i miei dati" on public.records for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Vince sempre la modifica più recente; server_ts serve a scaricare solo le novità
create or replace function public.records_touch() returns trigger
language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then return null; end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;

create trigger records_touch before insert or update on public.records
  for each row execute function public.records_touch();
