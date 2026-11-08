-- Fort Abbas Poly Clinic: health blog and AI writing team (adapted from the Divaar agent).
-- Admin page: /admin/blog. Agents: Edge Function blog-agents. AI keys stay in public.ai_keys.

-- The first blog table had a different shape and was never used. Stop if an article has been saved since.
do $$ begin
  if exists (select 1 from public.blog_posts) then raise exception 'blog_posts has rows: migrate them first'; end if;
end $$;
drop function if exists public.list_posts();
drop function if exists public.save_post(jsonb);
drop function if exists public.delete_post(uuid);
drop table public.blog_posts;

-- blog or blog_agent permission: articles and topics. blog_agent only: settings and keys.
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select public._can('blog') or public._can('blog_agent') $$;
create or replace function public.my_email() returns text language sql stable security definer set search_path = public as
$$ select email from public.profiles where id = auth.uid() and active $$;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.my_email() to authenticated;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------
-- Settings (single row)
-- ---------------------------------------------------------------------
create table if not exists public.blog_settings (
  id int primary key default 1 check (id = 1),
  agents_enabled boolean not null default false,
  articles_per_week int not null default 7 check (articles_per_week between 0 and 21),
  publish_days int[] not null default '{0,1,2,3,4,5,6}',             -- 0 = Sunday … 6 = Saturday (Pakistan time)
  publish_hour int not null default 10 check (publish_hour between 0 and 23),
  auto_publish boolean not null default true,
  manual_approval boolean not null default false,
  languages text[] not null default '{en}',
  urdu_enabled boolean not null default false,
  enabled_categories text[] not null default '{}',            -- empty = all active categories
  priority_categories text[] not null default '{lab-tests-explained,diabetes-heart,health-myths,medical-discoveries}',
  length_pref text not null default 'standard' check (length_pref in ('short','standard','long')),
  promo_level text not null default 'light' check (promo_level in ('off','light','natural')),
  max_product_links int not null default 2 check (max_product_links between 0 and 6),
  provider text not null default 'gemini' check (provider in ('gemini','anthropic','openai','xai','deepseek','groq','mistral','openrouter','together','fireworks','cerebras','perplexity','cohere','moonshot','qwen','zai','nvidia','huggingface','github','openai_compat')),
  model text not null default 'gemini-2.5-flash' check (length(model) <= 120),
  base_url text not null default '' check (base_url = '' or base_url ~ '^https://'),
  image_source text not null default 'openverse' check (image_source in ('products','openverse','products_then_openverse','none')),
  max_calls_per_minute int not null default 4 check (max_calls_per_minute between 1 and 60),
  monthly_call_limit int not null default 600 check (monthly_call_limit between 0 and 100000),
  monthly_token_limit bigint not null default 4000000 check (monthly_token_limit >= 0),
  monthly_cost_limit numeric(10,2) not null default 0 check (monthly_cost_limit >= 0),   -- USD; with free models the cost stays 0
  price_in_per_m numeric(10,4) not null default 0,    -- USD per 1M input tokens (0 for free tiers)
  price_out_per_m numeric(10,4) not null default 0,
  topic_backlog_min int not null default 8 check (topic_backlog_min between 0 and 200),
  research_seeds text[] not null default '{cbc blood test,hba1c test,lipid profile test,liver function test,thyroid test,urine routine examination,diabetes symptoms,high blood pressure,vitamin d deficiency,anemia,dengue test,typhoid test,health myths}',
  trusted_sources text[] not null default '{medlineplus.gov,nih.gov,who.int,cdc.gov,nhs.uk,mayoclinic.org,clevelandclinic.org,heart.org,diabetes.org,cancer.org,en.wikipedia.org}',
  author_name text not null default 'Fort Abbas Poly Clinic Editorial Team' check (length(author_name) between 2 and 80),
  author_bio text not null default 'The Fort Abbas Poly Clinic team provides OPD consultations, laboratory tests, digital X-ray and home sample collection, and writes general health information to help you talk to your doctor.' check (length(author_bio) <= 400),
  notify_email text not null default '',
  fn_url text not null default 'https://mdndkrpyrcgrpytdtiim.supabase.co/functions/v1/blog-agents',
  updated_at timestamptz not null default now()
);
insert into public.blog_settings (id) values (1) on conflict (id) do nothing;
-- extra writing-style instructions for the AI writer (Admin → Guides → Settings → Writing style)
alter table public.blog_settings add column if not exists writing_style text not null default '' check (length(writing_style) <= 4000);
-- default fonts per language (Guides admin → Settings → Fonts); read by the public pages through blog_public_settings()
alter table public.blog_settings add column if not exists typography jsonb not null default '{}'::jsonb;
alter table public.blog_settings drop constraint if exists blog_settings_typography_check;
alter table public.blog_settings add constraint blog_settings_typography_check check (jsonb_typeof(typography) = 'object' and length(typography::text) <= 2000);
alter table public.blog_settings enable row level security;

-- ---------------------------------------------------------------------
-- Secrets (write-only for admins)
-- ---------------------------------------------------------------------
create table if not exists public.blog_secrets (
  id int primary key default 1 check (id = 1),
  ai_api_key text not null default '',             -- (old single key — copied into ai_keys)
  ai_keys jsonb not null default '{}'::jsonb,      -- one key per AI provider: {"gemini": "…", "anthropic": "…"}
  gsc_service_account text not null default '',   -- Google service-account JSON (Search Console, read-only)
  gsc_property text not null default '',           -- e.g. sc-domain:divaar.pk
  hook_secret text not null default (replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','')),
  updated_at timestamptz not null default now()
);
insert into public.blog_secrets (id) values (1) on conflict (id) do nothing;
alter table public.blog_secrets enable row level security;
revoke all on public.blog_secrets from anon, authenticated;

-- ---------------------------------------------------------------------
-- Categories
-- ---------------------------------------------------------------------
create table if not exists public.blog_categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 80),
  name text not null check (length(name) between 2 and 80),
  name_ur text not null default '',
  description text not null default '' check (length(description) <= 400),
  sort int not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.blog_categories enable row level security;
insert into public.blog_categories (slug, name, description, sort) values
  ('lab-tests-explained', 'Lab Tests Explained', 'What common tests measure, how to prepare and what a report can and cannot tell you.', 10),
  ('diabetes-heart', 'Diabetes & Heart Health', 'Blood sugar, blood pressure and cholesterol explained in plain words.', 20),
  ('health-myths', 'Health Myths', 'Common beliefs about health checked against reliable sources.', 30),
  ('medical-discoveries', 'New Medical Discoveries', 'New research explained carefully, including what is still unknown.', 40),
  ('womens-health', 'Women''s Health', 'Information for women at every stage of life.', 50),
  ('childrens-health', 'Children''s Health', 'Growth, vaccines and common childhood illnesses, for parents.', 60),
  ('infections-seasonal', 'Infections & Seasonal Illness', 'Dengue, typhoid, flu and other infections: signs, tests and prevention.', 70),
  ('nutrition-lifestyle', 'Nutrition & Lifestyle', 'Everyday habits that support good health.', 80),
  ('imaging-xray', 'X-ray & Imaging', 'What imaging shows, how it works and how to prepare.', 90),
  ('prevention-screening', 'Prevention & Screening', 'Which check-ups matter and when to have them.', 100)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Topics (backlog)
-- ---------------------------------------------------------------------
create table if not exists public.blog_topics (
  id uuid primary key default gen_random_uuid(),
  query text not null check (length(query) between 3 and 200),
  title_idea text not null default '' check (length(title_idea) <= 200),
  intent text not null default 'informational' check (intent in ('informational','commercial','navigational','transactional')),
  category_slug text,
  cluster text not null default '' check (length(cluster) <= 120),
  is_pillar boolean not null default false,
  score int not null default 50 check (score between 0 and 100),
  status text not null default 'idea' check (status in ('idea','approved','queued','writing','done','rejected','duplicate')),
  source text not null default 'manual' check (length(source) <= 40),
  notes text not null default '' check (length(notes) <= 2000),
  reference_urls text[] not null default '{}',
  post_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blog_topics_status_idx on public.blog_topics (status, score desc);
create index if not exists blog_topics_query_trgm on public.blog_topics using gin (lower(query) extensions.gin_trgm_ops);
alter table public.blog_topics enable row level security;

-- ---------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------
create table if not exists public.blog_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) <= 90),
  lang text not null default 'en' check (lang in ('en','ur')),
  translation_of uuid references public.blog_posts(id) on delete set null,
  title text not null check (length(title) between 5 and 140),
  seo_title text not null default '' check (length(seo_title) <= 70),
  meta_description text not null default '' check (length(meta_description) <= 170),
  excerpt text not null default '' check (length(excerpt) <= 400),
  answer_summary text not null default '' check (length(answer_summary) <= 900),
  body_md text not null default '' check (length(body_md) <= 60000),
  faq jsonb not null default '[]'::jsonb,                  -- [{q, a}]
  cover_image jsonb not null default '{}'::jsonb,          -- {url, alt, credit, license, license_url, source_url, kind}
  category_id uuid references public.blog_categories(id) on delete set null,
  tags text[] not null default '{}',
  is_pillar boolean not null default false,
  pillar_id uuid references public.blog_posts(id) on delete set null,
  focus_query text not null default '' check (length(focus_query) <= 200),
  status text not null default 'draft' check (status in ('draft','review','scheduled','published','unpublished')),
  scheduled_at timestamptz,
  published_at timestamptz,
  content_updated_at timestamptz,                          -- shown as "Updated" when content really changed
  author_name text not null default 'Fort Abbas Poly Clinic Editorial Team',
  sources jsonb not null default '[]'::jsonb,              -- [{title, url, publisher}]
  product_ids text[] not null default '{}',
  needs_review boolean not null default false,
  review_notes jsonb not null default '[]'::jsonb,         -- [{level, message}]
  quality jsonb not null default '{}'::jsonb,
  featured boolean not null default false,
  noindex boolean not null default false,
  word_count int not null default 0,
  reading_minutes int not null default 0,
  topic_id uuid references public.blog_topics(id) on delete set null,
  ai_generated boolean not null default false,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (to_tsvector('simple'::regconfig, coalesce(title,'') || ' ' || coalesce(excerpt,'') || ' ' || coalesce(body_md,''))) stored,
  unique (slug, lang)
);
create index if not exists blog_posts_pub_idx on public.blog_posts (status, published_at desc);
create index if not exists blog_posts_cat_idx on public.blog_posts (category_id);
create index if not exists blog_posts_search_idx on public.blog_posts using gin (search);
create index if not exists blog_posts_title_trgm on public.blog_posts using gin (lower(title) extensions.gin_trgm_ops);
alter table public.blog_posts enable row level security;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'blog_topics_post_fk') then
    alter table public.blog_topics add constraint blog_topics_post_fk foreign key (post_id) references public.blog_posts(id) on delete set null;
  end if;
end $$;

create table if not exists public.blog_post_versions (
  id bigserial primary key,
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  snapshot jsonb not null,
  saved_by text,
  created_at timestamptz not null default now()
);
create index if not exists blog_post_versions_idx on public.blog_post_versions (post_id, created_at desc);
alter table public.blog_post_versions enable row level security;

-- ---------------------------------------------------------------------
-- Agents: jobs, logs, usage
-- ---------------------------------------------------------------------
create table if not exists public.blog_jobs (
  id uuid primary key default gen_random_uuid(),
  agent text not null check (agent in ('scout','planner','researcher','writer','linker','imager','reviewer','publisher','monitor','translator','refresher','ping')),
  status text not null default 'queued' check (status in ('queued','running','done','failed','cancelled')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  priority int not null default 0,
  attempts int not null default 0,
  max_attempts int not null default 3,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  dedupe_key text,
  parent_id uuid references public.blog_jobs(id) on delete set null,
  run_id uuid,                         -- one article's whole pipeline shares a run_id
  post_id uuid references public.blog_posts(id) on delete set null,
  topic_id uuid references public.blog_topics(id) on delete set null,
  created_by text not null default 'system',
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists blog_jobs_due_idx on public.blog_jobs (status, run_after) where status = 'queued';
create index if not exists blog_jobs_recent_idx on public.blog_jobs (created_at desc);
create index if not exists blog_jobs_run_idx on public.blog_jobs (run_id);
-- one live job per dedupe key (duplicate-job prevention)
create unique index if not exists blog_jobs_dedupe_live on public.blog_jobs (dedupe_key) where dedupe_key is not null and status in ('queued','running');
alter table public.blog_jobs enable row level security;

create table if not exists public.blog_logs (
  id bigserial primary key,
  job_id uuid references public.blog_jobs(id) on delete cascade,
  run_id uuid,
  agent text not null,
  level text not null default 'info' check (level in ('info','warn','error')),
  message text not null,
  data jsonb,
  created_at timestamptz not null default now()
);
create index if not exists blog_logs_created_idx on public.blog_logs (created_at desc);
alter table public.blog_logs enable row level security;

create table if not exists public.blog_ai_usage (
  id bigserial primary key,
  job_id uuid references public.blog_jobs(id) on delete set null,
  agent text not null,
  provider text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  est_cost numeric(12,6) not null default 0,
  ok boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists blog_ai_usage_created_idx on public.blog_ai_usage (created_at desc);
alter table public.blog_ai_usage enable row level security;

-- ---------------------------------------------------------------------
-- Analytics
-- ---------------------------------------------------------------------
create table if not exists public.blog_events (
  id bigserial primary key,
  post_slug text not null,
  event text not null check (event in ('read','product_click','scroll_75','ai_referral')),
  product_id text,
  referrer_host text not null default '',
  visitor_id text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists blog_events_idx on public.blog_events (post_slug, created_at desc);
alter table public.blog_events enable row level security;

create table if not exists public.blog_metrics (
  post_id uuid not null references public.blog_posts(id) on delete cascade,
  day date not null,
  source text not null check (source in ('site','gsc')),
  views int not null default 0,
  product_clicks int not null default 0,
  ai_referrals int not null default 0,
  clicks int not null default 0,
  impressions int not null default 0,
  position numeric(6,2),
  top_queries jsonb not null default '[]'::jsonb,
  primary key (post_id, day, source)
);
alter table public.blog_metrics enable row level security;

create table if not exists public.blog_recommendations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.blog_posts(id) on delete cascade,
  kind text not null check (kind in ('refresh','improve_ctr','add_links','expand','merge','new_topic','fix')),
  message text not null check (length(message) <= 1000),
  status text not null default 'open' check (status in ('open','queued','done','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists blog_reco_idx on public.blog_recommendations (status, created_at desc);
alter table public.blog_recommendations enable row level security;

-- ---------------------------------------------------------------------
-- Policies + public column access
-- ---------------------------------------------------------------------
do $$ declare p record; begin
  for p in select * from (values
    ('blog_settings','Admins read blog settings','select','(select public.is_admin())',null),
    ('blog_settings','Admins update blog settings','update','(select public.is_admin())','(select public.is_admin())'),
    ('blog_categories','Public reads active blog categories','select','(active or (select public.is_admin()))',null),
    ('blog_categories','Admins manage blog categories','all','(select public.is_admin())','(select public.is_admin())'),
    ('blog_posts','Public reads published posts','select','((status = ''published'' and published_at <= now()) or (select public.is_admin()))',null),
    ('blog_posts','Admins manage posts','all','(select public.is_admin())','(select public.is_admin())'),
    ('blog_post_versions','Admins read post versions','select','(select public.is_admin())',null),
    ('blog_topics','Admins manage topics','all','(select public.is_admin())','(select public.is_admin())'),
    ('blog_jobs','Admins read jobs','select','(select public.is_admin())',null),
    ('blog_logs','Admins read logs','select','(select public.is_admin())',null),
    ('blog_logs','Admins clear logs','delete','(select public.is_admin())',null),
    ('blog_ai_usage','Admins read usage','select','(select public.is_admin())',null),
    ('blog_events','Admins read blog events','select','(select public.is_admin())',null),
    ('blog_metrics','Admins read blog metrics','select','(select public.is_admin())',null),
    ('blog_recommendations','Admins manage recommendations','all','(select public.is_admin())','(select public.is_admin())')
  ) as t(tbl, name, cmd, q, w)
  loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=p.tbl and policyname=p.name) then
      execute format('create policy %I on public.%I for %s to public using (%s)%s',
        p.name, p.tbl, p.cmd, p.q, case when p.w is null then '' else format(' with check (%s)', p.w) end);
    end if;
  end loop;
end $$;

-- visitors only ever see the public columns of an article (never review notes, quality data or topics)
revoke all on public.blog_posts from anon;
grant select (id, slug, lang, translation_of, title, seo_title, meta_description, excerpt, answer_summary, body_md, faq,
  cover_image, category_id, tags, is_pillar, pillar_id, status, published_at, content_updated_at, author_name, sources,
  product_ids, featured, noindex, word_count, reading_minutes, ai_generated, reviewed_at, created_at, updated_at) on public.blog_posts to anon;
revoke all on public.blog_settings, public.blog_topics, public.blog_jobs, public.blog_logs, public.blog_ai_usage,
  public.blog_events, public.blog_metrics, public.blog_recommendations, public.blog_post_versions from anon;
revoke insert, update, delete on public.blog_jobs, public.blog_ai_usage, public.blog_events, public.blog_metrics, public.blog_post_versions from authenticated;
-- a few public settings the blog pages need (author, Urdu on/off)
create or replace function public.blog_public_settings()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('author_name', author_name, 'author_bio', author_bio, 'urdu_enabled', urdu_enabled,
    'auto_publish', auto_publish, 'manual_approval', manual_approval, 'typography', typography) from public.blog_settings where id = 1;
$$;
grant execute on function public.blog_public_settings() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Housekeeping triggers
-- ---------------------------------------------------------------------
create or replace function public.blog_touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;
do $$ declare t text; begin
  foreach t in array array['blog_settings','blog_secrets','blog_categories','blog_topics','blog_posts'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_touch') then
      execute format('create trigger %I before update on public.%I for each row execute function public.blog_touch()', t || '_touch', t);
    end if;
  end loop;
end $$;

-- keep a version whenever an article's words change (old versions are trimmed nightly by blog_housekeeping); stamp published_at / content_updated_at
create or replace function public.blog_posts_before() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if (new.body_md, new.title, new.answer_summary, new.faq) is distinct from (old.body_md, old.title, old.answer_summary, old.faq) then
      insert into public.blog_post_versions (post_id, snapshot, saved_by)
      values (old.id, jsonb_build_object('title', old.title, 'seo_title', old.seo_title, 'meta_description', old.meta_description,
        'excerpt', old.excerpt, 'answer_summary', old.answer_summary, 'body_md', old.body_md, 'faq', old.faq,
        'sources', old.sources, 'status', old.status, 'updated_at', old.updated_at),
        coalesce(public.my_email(), 'agent'));
      if old.status = 'published' then new.content_updated_at := now(); end if;
    end if;
  end if;
  -- items flagged for a human (safety advice, uncertain facts) must be approved before going live
  if new.status in ('published','scheduled') and new.needs_review
     and (tg_op = 'INSERT' or old.status not in ('published','scheduled') or old.needs_review is distinct from new.needs_review) then
    raise exception 'This article has items flagged for review. Check them and press Approve before publishing.';
  end if;
  if new.status = 'published' and new.published_at is null then new.published_at := now(); end if;
  if new.status = 'scheduled' and new.scheduled_at is null then raise exception 'Pick a date and time to schedule this article.'; end if;
  new.word_count := coalesce(array_length(regexp_split_to_array(btrim(regexp_replace(new.body_md, '[#*_>|`\[\]()-]', ' ', 'g')), '\s+'), 1), 0);
  new.reading_minutes := greatest(1, round(new.word_count / 220.0));
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'blog_posts_before') then
    create trigger blog_posts_before before insert or update on public.blog_posts for each row execute function public.blog_posts_before();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Secrets: admins can set, never read back
-- ---------------------------------------------------------------------
create or replace function public.blog_set_secret(p_name text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  p_value := btrim(coalesce(p_value, ''));
  if length(p_value) > 20000 then raise exception 'That value is too long.'; end if;
  if p_name like 'ai_key:%' then
    -- one key per provider: 'ai_key:anthropic'; an empty value removes that provider's key
    if substr(p_name, 8) not in ('gemini','anthropic','openai','xai','deepseek','groq','mistral','openrouter','together','fireworks','cerebras','perplexity','cohere','moonshot','qwen','zai','nvidia','huggingface','github','openai_compat') then raise exception 'Unknown AI provider.'; end if;
    update public.blog_secrets set ai_keys = case when p_value = '' then ai_keys - substr(p_name, 8)
      else ai_keys || jsonb_build_object(substr(p_name, 8), p_value) end where id = 1;
  elsif p_name = 'ai_api_key' then   -- older admin pages: saves the key for the provider picked in Settings
    update public.blog_secrets b set ai_keys = case when p_value = '' then b.ai_keys - s.provider else b.ai_keys || jsonb_build_object(s.provider, p_value) end
      from public.blog_settings s where b.id = 1 and s.id = 1;
  elsif p_name = 'gsc_service_account' then
    if p_value <> '' then
      begin
        if (p_value::jsonb ->> 'client_email') is null or (p_value::jsonb ->> 'private_key') is null then
          raise exception 'This is not a Google service-account key (client_email / private_key missing).';
        end if;
      exception when invalid_text_representation then raise exception 'Paste the whole JSON key file.';
      end;
    end if;
    update public.blog_secrets set gsc_service_account = p_value where id = 1;
  elsif p_name = 'gsc_property' then update public.blog_secrets set gsc_property = p_value where id = 1;
  elsif p_name = 'hook_secret' then
    update public.blog_secrets set hook_secret = replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','') where id = 1;
  else raise exception 'Unknown setting.'; end if;
  return public.blog_secret_status();
end $$;

-- ---------------------------------------------------------------------
-- More AI providers, one saved key per provider (re-runnable)
-- ---------------------------------------------------------------------
alter table public.blog_secrets add column if not exists ai_keys jsonb not null default '{}'::jsonb;
update public.blog_secrets b set ai_keys = jsonb_build_object(s.provider, b.ai_api_key)
  from public.blog_settings s where b.id = 1 and s.id = 1 and b.ai_api_key <> '' and b.ai_keys = '{}'::jsonb;
alter table public.blog_settings drop constraint if exists blog_settings_provider_check;
alter table public.blog_settings add constraint blog_settings_provider_check check (provider in ('gemini','anthropic','openai','xai','deepseek','groq','mistral','openrouter','together','fireworks','cerebras','perplexity','cohere','moonshot','qwen','zai','nvidia','huggingface','github','openai_compat'));

create or replace function public.blog_secret_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.blog_secrets; v_prov text; v_key text; v_keys jsonb := '{}'::jsonb; k record;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into s from public.blog_secrets where id = 1;
  select provider into v_prov from public.blog_settings where id = 1;
  v_key := coalesce(s.ai_keys ->> v_prov, '');
  -- which providers have a key, with only the last 4 characters as a hint (the keys themselves never leave the server)
  for k in select key, value from jsonb_each_text(s.ai_keys) loop
    if length(k.value) > 0 then v_keys := v_keys || jsonb_build_object(k.key, case when length(k.value) > 8 then '…' || right(k.value, 4) else 'saved' end); end if;
  end loop;
  return jsonb_build_object(
    'ai_key_set', length(v_key) > 0,
    'ai_key_hint', case when length(v_key) > 8 then '…' || right(v_key, 4) else '' end,
    'ai_keys', v_keys,
    'gsc_set', length(s.gsc_service_account) > 0,
    'gsc_email', case when length(s.gsc_service_account) > 0 then (s.gsc_service_account::jsonb ->> 'client_email') else '' end,
    'gsc_property', s.gsc_property);
end $$;
revoke execute on function public.blog_set_secret(text, text), public.blog_secret_status() from public, anon;
grant execute on function public.blog_set_secret(text, text), public.blog_secret_status() to authenticated;

-- ---------------------------------------------------------------------
-- Queue
-- ---------------------------------------------------------------------
-- wake the agents (fire-and-forget HTTP call to the Edge Function)
create or replace function public._blog_kick()
returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_url text; v_secret text;
begin
  select fn_url into v_url from public.blog_settings where id = 1;
  select hook_secret into v_secret from public.blog_secrets where id = 1;
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(url := v_url, body := jsonb_build_object('event', 'run'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', v_secret),
    timeout_milliseconds := 5000);
exception when others then
  insert into public.blog_logs (agent, level, message) values ('system', 'error', 'Could not wake the agents: ' || left(sqlerrm, 300));
end $$;

create or replace function public._blog_enqueue(p_agent text, p_payload jsonb, p_dedupe text default null,
  p_run_after timestamptz default now(), p_run_id uuid default null, p_post uuid default null, p_topic uuid default null,
  p_parent uuid default null, p_by text default 'system', p_priority int default 0)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into public.blog_jobs (agent, payload, dedupe_key, run_after, run_id, post_id, topic_id, parent_id, created_by, priority)
  values (p_agent, coalesce(p_payload, '{}'::jsonb), p_dedupe, coalesce(p_run_after, now()), p_run_id, p_post, p_topic, p_parent, p_by, p_priority)
  on conflict (dedupe_key) where dedupe_key is not null and status in ('queued','running') do nothing
  returning id into v_id;
  return v_id;   -- null = an identical job is already waiting or running
end $$;

-- admin: start an agent now (e.g. "Find topics", "Write about this topic", "Re-check this article")
create or replace function public.blog_enqueue(p_agent text, p_payload jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_by text := coalesce(public.my_email(), 'admin'); v_run uuid := gen_random_uuid();
  v_post uuid; v_topic uuid; v_dedupe text;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_agent not in ('scout','planner','researcher','writer','linker','imager','reviewer','publisher','monitor','translator','refresher','ping') then
    raise exception 'Unknown agent.'; end if;
  begin v_post := nullif(p_payload->>'post_id','')::uuid; exception when others then v_post := null; end;
  begin v_topic := nullif(p_payload->>'topic_id','')::uuid; exception when others then v_topic := null; end;
  v_dedupe := case
    when v_topic is not null and p_agent = 'researcher' then 'article:topic:' || v_topic
    when v_post is not null then p_agent || ':post:' || v_post
    when p_agent in ('scout','planner','monitor') then p_agent || ':manual'
    else null end;
  if v_topic is not null and p_agent = 'researcher' then
    update public.blog_topics set status = 'queued' where id = v_topic and status in ('idea','approved');
  end if;
  v_id := public._blog_enqueue(p_agent, coalesce(p_payload, '{}'::jsonb) || jsonb_build_object('manual', true), v_dedupe, now(), v_run, v_post, v_topic, null, v_by, 10);
  if v_id is null then raise exception 'That job is already waiting or running.'; end if;
  perform public._blog_kick();
  return v_id;
end $$;

create or replace function public.blog_job_action(p_job uuid, p_action text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  if p_action = 'retry' then
    update public.blog_jobs set status = 'queued', attempts = 0, error = null, run_after = now(), locked_at = null, finished_at = null
     where id = p_job and status in ('failed','cancelled');
    perform public._blog_kick();
  elsif p_action = 'cancel' then
    update public.blog_jobs set status = 'cancelled', finished_at = now() where id = p_job and status in ('queued','running');
  elsif p_action = 'kick' then
    perform public._blog_kick();
  else raise exception 'Unknown action.'; end if;
end $$;

-- Edge Function only: take the next due job (skip-locked), reviving stuck ones
create or replace function public.blog_claim()
returns public.blog_jobs language plpgsql security definer set search_path = public as $$
-- While the "AI calls per minute" allowance is used up, AI steps stay waiting (no try is used up);
-- steps that don't call the AI (planner, image, publisher, monitor) still run.
declare j public.blog_jobs; v_full boolean := false;
begin
  update public.blog_jobs set status = case when attempts >= max_attempts then 'failed' else 'queued' end,
         error = coalesce(error, 'Timed out — retried automatically'), locked_at = null,
         finished_at = case when attempts >= max_attempts then now() else null end
   where status = 'running' and locked_at < now() - interval '8 minutes';
  select (select count(*) from public.blog_ai_usage where created_at > now() - interval '1 minute')
         >= coalesce((select max_calls_per_minute from public.blog_settings where id = 1), 4)
    into v_full;
  select * into j from public.blog_jobs
   where status = 'queued' and run_after <= now()
     and (not v_full or agent not in ('scout','researcher','writer','linker','reviewer','translator','refresher','ping'))
   order by priority desc, run_after, created_at
   for update skip locked limit 1;
  if not found then return null; end if;
  update public.blog_jobs set status = 'running', attempts = attempts + 1, locked_at = now(), started_at = coalesce(started_at, now())
   where id = j.id returning * into j;
  return j;
end $$;

-- Edge Function only: finish a job and hand over to the next agent(s)
create or replace function public.blog_finish(p_job uuid, p_ok boolean, p_result jsonb, p_error text, p_next jsonb default '[]'::jsonb, p_retry_in int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare j public.blog_jobs; n jsonb; v_ids jsonb := '[]'::jsonb; v_id uuid;
begin
  select * into j from public.blog_jobs where id = p_job for update;
  if not found or j.status <> 'running' then return v_ids; end if;   -- cancelled meanwhile
  if p_ok then
    update public.blog_jobs set status = 'done', result = p_result, error = null, finished_at = now(), locked_at = null where id = p_job;
    for n in select * from jsonb_array_elements(coalesce(p_next, '[]'::jsonb)) loop
      v_id := public._blog_enqueue(n->>'agent', coalesce(n->'payload', '{}'::jsonb), n->>'dedupe',
        now() + make_interval(secs => coalesce((n->>'delay_s')::int, 0)), coalesce(nullif(n->>'run_id','')::uuid, j.run_id),
        coalesce(nullif(n->>'post_id','')::uuid, j.post_id), coalesce(nullif(n->>'topic_id','')::uuid, j.topic_id), j.id, j.agent, j.priority);
      if v_id is not null then v_ids := v_ids || to_jsonb(v_id); end if;
    end loop;
  elsif p_retry_in is not null and j.attempts < j.max_attempts then
    update public.blog_jobs set status = 'queued', error = left(p_error, 2000), locked_at = null,
           run_after = now() + make_interval(secs => p_retry_in) where id = p_job;
  else
    update public.blog_jobs set status = 'failed', error = left(p_error, 2000), result = p_result, finished_at = now(), locked_at = null where id = p_job;
  end if;
  return v_ids;
end $$;

-- Edge Function only: AI usage so far (rate + monthly limits)
create or replace function public.blog_usage_now()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'last_minute', (select count(*) from public.blog_ai_usage where created_at > now() - interval '1 minute'),
    'month_calls', (select count(*) from public.blog_ai_usage where created_at >= date_trunc('month', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi'),
    'month_tokens', (select coalesce(sum(input_tokens + output_tokens), 0) from public.blog_ai_usage where created_at >= date_trunc('month', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi'),
    'month_cost', (select coalesce(sum(est_cost), 0) from public.blog_ai_usage where created_at >= date_trunc('month', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi'));
$$;

-- Edge Function only: similar existing articles / topics (duplicate prevention)
create or replace function public.blog_similar(p_text text, p_min real default 0.45)
returns table (kind text, id uuid, title text, status text, sim real)
language sql stable security definer set search_path = public, extensions as $$
  select * from (
    select 'post'::text, p.id, p.title, p.status, extensions.similarity(lower(p.title), lower(p_text)) from public.blog_posts p where p.lang = 'en'
    union all
    select 'topic', t.id, coalesce(nullif(t.title_idea,''), t.query), t.status, greatest(extensions.similarity(lower(t.query), lower(p_text)), extensions.similarity(lower(t.title_idea), lower(p_text)))
      from public.blog_topics t where t.status not in ('rejected','duplicate')
  ) x(kind, id, title, status, sim) where sim >= p_min order by sim desc limit 10;
$$;
revoke execute on function public.blog_claim(), public.blog_finish(uuid, boolean, jsonb, text, jsonb, int), public.blog_usage_now(),
  public.blog_similar(text, real), public._blog_enqueue(text, jsonb, text, timestamptz, uuid, uuid, uuid, uuid, text, int), public._blog_kick()
  from public, anon, authenticated;
grant execute on function public.blog_claim(), public.blog_finish(uuid, boolean, jsonb, text, jsonb, int), public.blog_usage_now(),
  public.blog_similar(text, real), public._blog_enqueue(text, jsonb, text, timestamptz, uuid, uuid, uuid, uuid, text, int), public._blog_kick()
  to service_role;
revoke execute on function public.blog_enqueue(text, jsonb), public.blog_job_action(uuid, text) from public, anon;
grant execute on function public.blog_enqueue(text, jsonb), public.blog_job_action(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- Visitors: blog events (rate-limited; no personal data)
-- ---------------------------------------------------------------------
create or replace function public.blog_track(p jsonb)
returns void language plpgsql volatile security definer set search_path = public as $$
declare v_slug text := left(coalesce(p->>'slug',''), 90); v_ev text := coalesce(p->>'event','');
  v_vis text := left(coalesce(p->>'visitor_id',''), 64); v_ref text := lower(left(coalesce(p->>'referrer_host',''), 80)); v_pid text;
begin
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' or v_ev not in ('read','product_click','scroll_75','ai_referral') then return; end if;
  if auth.uid() is not null and public.is_admin() then return; end if;
  if v_vis <> '' and (select count(*) from public.blog_events where visitor_id = v_vis and created_at > now() - interval '1 minute') >= 20 then return; end if;
  if not exists (select 1 from public.blog_posts where slug = v_slug and status = 'published') then return; end if;
  v_ref := regexp_replace(v_ref, '[^a-z0-9.-]', '', 'g');
  v_pid := left(nullif(p->>'product_id',''), 80);
  insert into public.blog_events (post_slug, event, product_id, referrer_host, visitor_id) values (v_slug, v_ev, v_pid, v_ref, v_vis);
end $$;
grant execute on function public.blog_track(jsonb) to anon, authenticated;

-- ---------------------------------------------------------------------
-- Admin overview (dashboard numbers)
-- ---------------------------------------------------------------------
create or replace function public.blog_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Karachi') at time zone 'Asia/Karachi';
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return jsonb_build_object(
    'posts', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.blog_posts group by status) x),
    'needs_review', (select count(*) from public.blog_posts where status in ('draft','review') and needs_review),
    'topics', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.blog_topics group by status) x),
    'jobs', (select jsonb_object_agg(status, n) from (select status, count(*) n from public.blog_jobs where created_at > now() - interval '7 days' group by status) x),
    'failed_24h', (select count(*) from public.blog_jobs where status = 'failed' and finished_at > now() - interval '24 hours'),
    'month', jsonb_build_object(
      'calls', (select count(*) from public.blog_ai_usage where created_at >= v_month),
      'tokens', (select coalesce(sum(input_tokens + output_tokens), 0) from public.blog_ai_usage where created_at >= v_month),
      'cost', (select coalesce(sum(est_cost), 0) from public.blog_ai_usage where created_at >= v_month)),
    'reads_30d', (select count(*) from public.blog_events where event = 'read' and created_at > now() - interval '30 days'),
    'product_clicks_30d', (select count(*) from public.blog_events where event = 'product_click' and created_at > now() - interval '30 days'),
    'ai_referrals_30d', (select count(*) from public.blog_events where event = 'ai_referral' and created_at > now() - interval '30 days'),
    'open_recos', (select count(*) from public.blog_recommendations where status = 'open'),
    'last_tick', (select max(created_at) from public.blog_jobs));
end $$;
grant execute on function public.blog_overview() to authenticated;

-- per-article numbers for the Performance tab
create or replace function public.blog_performance(p_days int default 28)
returns table (post_id uuid, slug text, title text, status text, published_at timestamptz, reads bigint, product_clicks bigint,
  ai_referrals bigint, gsc_clicks bigint, gsc_impressions bigint, gsc_position numeric)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  return query
  select p.id, p.slug, p.title, p.status, p.published_at,
    (select count(*) from public.blog_events e where e.post_slug = p.slug and e.event = 'read' and e.created_at > now() - make_interval(days => p_days)),
    (select count(*) from public.blog_events e where e.post_slug = p.slug and e.event = 'product_click' and e.created_at > now() - make_interval(days => p_days)),
    (select count(*) from public.blog_events e where e.post_slug = p.slug and e.event = 'ai_referral' and e.created_at > now() - make_interval(days => p_days)),
    (select coalesce(sum(m.clicks), 0) from public.blog_metrics m where m.post_id = p.id and m.source = 'gsc' and m.day > current_date - p_days)::bigint,
    (select coalesce(sum(m.impressions), 0) from public.blog_metrics m where m.post_id = p.id and m.source = 'gsc' and m.day > current_date - p_days)::bigint,
    (select round(avg(m.position), 1) from public.blog_metrics m where m.post_id = p.id and m.source = 'gsc' and m.day > current_date - p_days)
  from public.blog_posts p where p.lang = 'en' and p.status in ('published','unpublished')
  order by p.published_at desc nulls last;
end $$;
grant execute on function public.blog_performance(int) to authenticated;

-- ---------------------------------------------------------------------
-- Clock: every 2 minutes
-- ---------------------------------------------------------------------
create or replace function public.blog_tick()
returns void language plpgsql security definer set search_path = public as $$
declare s public.blog_settings; v_local timestamp := now() at time zone 'Asia/Karachi'; v_kick boolean := false;
begin
  select * into s from public.blog_settings where id = 1;
  update public.blog_posts set status = 'published', published_at = coalesce(scheduled_at, now())
   where status = 'scheduled' and scheduled_at <= now();
  if s.agents_enabled then
    if (extract(hour from v_local) >= 6 or not exists (select 1 from public.blog_jobs where agent = 'planner' and created_at > now() - interval '20 hours'))
       and not exists (select 1 from public.blog_jobs where dedupe_key = 'planner:' || to_char(v_local, 'YYYY-MM-DD')) then
      perform public._blog_enqueue('planner', '{}'::jsonb, 'planner:' || to_char(v_local, 'YYYY-MM-DD'), now(), gen_random_uuid());
    end if;
    if extract(hour from v_local) >= 6 and extract(isodow from v_local) = 1 and not exists (select 1 from public.blog_jobs where dedupe_key = 'monitor:' || to_char(v_local, 'IYYY-IW')) then
      perform public._blog_enqueue('monitor', '{}'::jsonb, 'monitor:' || to_char(v_local, 'IYYY-IW'), now(), gen_random_uuid());
    end if;
    if exists (select 1 from public.blog_jobs where status = 'queued' and run_after <= now())
       or exists (select 1 from public.blog_jobs where status = 'running' and locked_at < now() - interval '8 minutes') then
      v_kick := true;
    end if;
    if v_kick then perform public._blog_kick(); end if;
  end if;
  if extract(minute from v_local) < 2 and extract(hour from v_local) = 3 and to_regprocedure('public.blog_housekeeping()') is not null then
    perform public.blog_housekeeping();
  end if;
end $$;
revoke execute on function public.blog_tick() from public, anon, authenticated;

-- Nightly tidy-up: keep the last 25 versions per article, logs for 90 days, finished jobs for 120 days,
-- visitor events for 400 days. (Kept in its own function and migration because it removes old rows.)
create or replace function public.blog_housekeeping()
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.blog_post_versions v where v.id in (
    select id from (select id, row_number() over (partition by post_id order by created_at desc) rn from public.blog_post_versions) x where x.rn > 25);
  delete from public.blog_logs where created_at < now() - interval '90 days';
  delete from public.blog_jobs where status in ('done','cancelled') and created_at < now() - interval '120 days';
  delete from public.blog_events where created_at < now() - interval '400 days';
end $$;
revoke execute on function public.blog_housekeeping() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from cron.job where jobname = 'blog-tick') then
    perform cron.schedule('blog-tick', '*/2 * * * *', 'select public.blog_tick()');
  end if;
end $$;

-- live updates in the admin pipeline board
do $$ declare t text; begin
  foreach t in array array['blog_jobs', 'blog_logs'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- public bucket for article cover photos (written only by the blog-agents function with the service key)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('blog', 'blog', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- hardening: trigger helpers and admin numbers are never callable by visitors
alter function public.blog_touch() set search_path = public;
revoke execute on function public.blog_overview(), public.blog_performance(int), public.blog_posts_before(), public.blog_touch() from public, anon;
revoke execute on function public.blog_posts_before(), public.blog_touch() from authenticated;
grant execute on function public.blog_overview(), public.blog_performance(int) to authenticated;

-- ---------------------------------------------------------------------
-- "Publish now" (Admin → Guides): publish one article now, or get one written and published right away.
-- Publishing an article early frees its planned slot, so the planner starts the next topic for it.
-- ---------------------------------------------------------------------
-- after an article goes live: free its slot, refill it, translate if Urdu is on, wake the agents
create or replace function public._blog_after_publish(p_post uuid)
returns void language plpgsql security definer set search_path = public as $$
declare s public.blog_settings; p public.blog_posts;
begin
  select * into s from public.blog_settings where id = 1;
  select * into p from public.blog_posts where id = p_post;
  if p.id is null then return; end if;
  if p.quality ? 'planned_for' and p.quality->>'planned_for' is not null then
    update public.blog_posts set quality = (quality - 'planned_for') || jsonb_build_object('was_planned_for', quality->'planned_for', 'published_early', true)
     where id = p_post;
  end if;
  if p.topic_id is not null then update public.blog_topics set status = 'done', post_id = p_post where id = p.topic_id; end if;
  if s.agents_enabled then
    perform public._blog_enqueue('planner', jsonb_build_object('refill', true), 'planner:refill:' || p_post, now() + interval '5 seconds', gen_random_uuid());
    if s.urdu_enabled and p.lang = 'en' then
      perform public._blog_enqueue('translator', jsonb_build_object('post_id', p_post), 'translator:post:' || p_post, now(), gen_random_uuid(), p_post);
    end if;
    perform public._blog_kick();
  end if;
end $$;
revoke execute on function public._blog_after_publish(uuid) from public, anon, authenticated;

-- publish one article now (the editor's "Publish now"): marks it reviewed by you
create or replace function public.blog_publish_post(p_post uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_by text := coalesce(public.my_email(), 'admin'); p public.blog_posts;
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into p from public.blog_posts where id = p_post;
  if p.id is null then raise exception 'That article no longer exists.'; end if;
  update public.blog_posts set status = 'published', published_at = case when status = 'published' then published_at else now() end,
    scheduled_at = null, needs_review = false, reviewed_by = coalesce(reviewed_by, v_by), reviewed_at = coalesce(reviewed_at, now())
   where id = p_post;
  if p.status <> 'published' then perform public._blog_after_publish(p_post); end if;
  return jsonb_build_object('action', 'published', 'post_id', p_post, 'title', p.title, 'slug', p.slug, 'was', p.status);
end $$;

-- the overview's "Publish a guide now": the next ready article, or start one and publish it when it passes the checks
create or replace function public.blog_publish_next()
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.blog_settings; p public.blog_posts; t public.blog_topics; v_run uuid; v_job uuid; v_step text; v_by text := coalesce(public.my_email(), 'admin');
begin
  if not public.is_admin() then raise exception 'Admins only.'; end if;
  select * into s from public.blog_settings where id = 1;
  -- 1. something ready: the next scheduled article, else an article waiting for approval with nothing flagged
  select * into p from public.blog_posts where lang = 'en' and status = 'scheduled' order by scheduled_at nulls last, created_at limit 1;
  if p.id is null then
    select * into p from public.blog_posts where lang = 'en' and status = 'review' and not needs_review order by created_at limit 1;
  end if;
  if p.id is not null then
    perform public.blog_publish_post(p.id);
    return jsonb_build_object('action', 'published', 'post_id', p.id, 'title', p.title, 'slug', p.slug, 'was', p.status);
  end if;
  if not s.agents_enabled then raise exception 'The agents are paused. Turn them on to write a new guide.'; end if;
  -- 2. an article is already on its way: publish it as soon as it passes the checks
  select run_id, agent into v_run, v_step from public.blog_jobs
   where status in ('queued','running') and agent in ('researcher','writer','linker','imager','reviewer','publisher') and run_id is not null
   order by created_at limit 1;
  if v_run is not null then
    update public.blog_jobs set payload = payload || '{"publish_now": true}'::jsonb where run_id = v_run and status = 'queued';
    update public.blog_posts set quality = coalesce(quality, '{}'::jsonb) || '{"publish_now": true}'::jsonb
     where quality->>'run_id' = v_run::text and status in ('draft','review');
    perform public._blog_kick();
    return jsonb_build_object('action', 'in_progress', 'step', v_step);
  end if;
  -- 3. start one now from the best topic (yours first, then the best-scoring idea)
  select * into t from public.blog_topics where status in ('approved','idea')
   order by (status = 'approved') desc, score desc, created_at limit 1;
  v_run := gen_random_uuid();
  if t.id is not null then
    update public.blog_topics set status = 'writing' where id = t.id;
    v_job := public._blog_enqueue('researcher', jsonb_build_object('topic_id', t.id, 'publish_now', true, 'manual', true),
      'article:topic:' || t.id, now(), v_run, null, t.id, null, v_by, 20);
    perform public._blog_kick();
    return jsonb_build_object('action', 'writing', 'topic', coalesce(nullif(t.title_idea, ''), t.query));
  end if;
  -- 4. no topics yet: find some, then write the best one straight away
  v_job := public._blog_enqueue('scout', jsonb_build_object('write_now', true, 'manual', true), 'scout:write-now', now(), v_run, null, null, null, v_by, 20);
  perform public._blog_kick();
  return jsonb_build_object('action', 'finding_topics');
end $$;
revoke execute on function public.blog_publish_post(uuid), public.blog_publish_next() from public, anon;
grant execute on function public.blog_publish_post(uuid), public.blog_publish_next() to authenticated;


-- ---------------------------------------------------------------------
-- Clinic additions
-- ---------------------------------------------------------------------
alter table public.blog_settings add column if not exists email_from text not null default '' check (length(email_from) <= 200);
alter table public.blog_secrets add column if not exists resend_api_key text not null default '';

-- settings can only be changed with the Blog agent permission
drop policy if exists "Admins update blog settings" on public.blog_settings;
create policy "Blog agent staff update settings" on public.blog_settings for update to authenticated using (public._can('blog_agent')) with check (public._can('blog_agent'));
grant update on public.blog_settings to authenticated;
grant select, insert, update, delete on public.blog_posts, public.blog_topics, public.blog_categories, public.blog_recommendations to authenticated;
grant select on public.blog_settings, public.blog_post_versions, public.blog_jobs, public.blog_logs, public.blog_ai_usage, public.blog_events, public.blog_metrics to authenticated;
grant delete on public.blog_logs to authenticated;
grant select on public.blog_categories to anon;
create or replace function public._agent_ok() returns boolean language sql stable security definer set search_path = public as $$ select public._can('blog_agent') $$;
grant execute on function public._agent_ok() to authenticated;

-- keys live in public.ai_keys (the same place as before), so "view key" keeps working
create or replace function public.blog_set_secret(p_name text, p_value text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_prov text;
begin
  if not public._can('blog_agent') then raise exception 'Not allowed'; end if;
  p_value := btrim(coalesce(p_value, ''));
  if length(p_value) > 20000 then raise exception 'That value is too long.'; end if;
  if p_name like 'ai_key:%' then
    v_prov := substr(p_name, 8);
    if v_prov not in ('gemini','anthropic','openai','xai','deepseek','groq','mistral','openrouter','together','fireworks','cerebras','perplexity','cohere','moonshot','qwen','zai','nvidia','huggingface','github','openai_compat') then raise exception 'Unknown AI provider.'; end if;
    if p_value = '' then delete from public.ai_keys where provider = v_prov; perform public._log('Removed AI key', 'blog_agent', jsonb_build_object('provider', v_prov));
    else perform public.set_ai_key(v_prov, p_value); end if;
  elsif p_name = 'resend_api_key' then update public.blog_secrets set resend_api_key = p_value where id = 1; perform public._log('Saved email key', 'blog_agent');
  elsif p_name = 'gsc_service_account' then
    if p_value <> '' then
      begin
        if (p_value::jsonb ->> 'client_email') is null or (p_value::jsonb ->> 'private_key') is null then raise exception 'This is not a Google service-account key (client_email / private_key missing).'; end if;
      exception when invalid_text_representation then raise exception 'Paste the whole JSON key file.';
      end;
    end if;
    update public.blog_secrets set gsc_service_account = p_value where id = 1; perform public._log('Saved Search Console key', 'blog_agent');
  elsif p_name = 'gsc_property' then update public.blog_secrets set gsc_property = p_value where id = 1;
  elsif p_name = 'hook_secret' then update public.blog_secrets set hook_secret = replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','') where id = 1;
  else raise exception 'Unknown setting.'; end if;
  return public.blog_secret_status();
end $$;
create or replace function public.blog_secret_status()
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.blog_secrets; v_prov text; v_key text; v_keys jsonb := '{}'::jsonb; k record;
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  select * into s from public.blog_secrets where id = 1;
  select provider into v_prov from public.blog_settings where id = 1;
  select value into v_key from public.ai_keys where provider = v_prov;
  for k in select provider, value from public.ai_keys loop
    v_keys := v_keys || jsonb_build_object(k.provider, case when length(k.value) > 8 then '…' || right(k.value, 4) else 'saved' end);
  end loop;
  return jsonb_build_object('ai_key_set', length(coalesce(v_key,'')) > 0, 'ai_key_hint', case when length(coalesce(v_key,'')) > 8 then '…' || right(v_key, 4) else '' end,
    'ai_keys', v_keys, 'gsc_set', length(s.gsc_service_account) > 0,
    'gsc_email', case when length(s.gsc_service_account) > 0 then (s.gsc_service_account::jsonb ->> 'client_email') else '' end,
    'gsc_property', s.gsc_property, 'resend_set', length(s.resend_api_key) > 0);
end $$;
revoke execute on function public.blog_set_secret(text, text), public.blog_secret_status() from public, anon;
grant execute on function public.blog_set_secret(text, text), public.blog_secret_status() to authenticated;

-- photos already uploaded to the site, for the picture chooser's Gallery tab
create or replace function public.media_library() returns table (path text, type text)
language plpgsql stable security definer set search_path = public, storage as $$
begin
  if not public.is_admin() then raise exception 'Not allowed'; end if;
  return query select o.name, coalesce(o.metadata->>'mimetype','') from storage.objects o where o.bucket_id = 'media' order by o.created_at desc limit 1000;
end $$;
revoke execute on function public.media_library() from public, anon;
grant execute on function public.media_library() to authenticated;

-- every publishing decision and settings change shows in the Audit log
create or replace function public.blog_audit() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'blog_settings' then perform public._log('Changed blog agent settings', 'blog_agent', jsonb_build_object('agents_enabled', new.agents_enabled, 'manual_approval', new.manual_approval, 'auto_publish', new.auto_publish));
  elsif tg_op = 'DELETE' then perform public._log('Deleted article', 'blog', jsonb_build_object('title', old.title)); return old;
  elsif tg_op = 'INSERT' then if auth.uid() is not null then perform public._log('Created article', 'blog', jsonb_build_object('title', new.title)); end if;
  elsif new.status is distinct from old.status then
    insert into public.audit_log(actor_email, action, area, detail) values (coalesce(public.my_email(), 'blog agent'), 'Article ' || new.status, 'blog', jsonb_build_object('title', new.title, 'from', old.status));
  end if;
  return new;
end $$;
revoke execute on function public.blog_audit() from public, anon, authenticated;
create trigger blog_posts_audit after insert or update or delete on public.blog_posts for each row execute function public.blog_audit();
create trigger blog_settings_audit after update on public.blog_settings for each row execute function public.blog_audit();

-- the owner's saved choice from the old page (7 a week, agents off) carries over
update public.blog_settings b set articles_per_week = coalesce(nullif(d.data->>'postsPerWeek','')::int, b.articles_per_week),
  agents_enabled = coalesce((d.data->>'enabled')::boolean, false), model = coalesce(nullif(d.data->>'model',''), b.model),
  writing_style = left(concat_ws(E'\n', d.data->>'rules', 'Audience: ' || (d.data->>'audience')), 4000)
  from public.site_sections d where d.key = 'blog_agent' and b.id = 1;

grant execute on function public._can(text) to authenticated; -- used by the blog_settings update policy
