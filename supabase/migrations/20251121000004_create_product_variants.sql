create table if not exists public.product_variants (
  id uuid not null default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_name text not null,
  sku text,
  price_adjustment numeric not null default 0,
  stock_quantity integer not null default 0,
  is_active boolean not null default true,
  user_id uuid references auth.users(id),
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint product_variants_pkey primary key (id)
);

-- Enable RLS
alter table public.product_variants enable row level security;

-- Policies
create policy "Users can view their own variants"
  on public.product_variants for select
  using (auth.uid() = user_id or user_id is null);

create policy "Users can insert their own variants"
  on public.product_variants for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own variants"
  on public.product_variants for update
  using (auth.uid() = user_id);

create policy "Users can delete their own variants"
  on public.product_variants for delete
  using (auth.uid() = user_id);
