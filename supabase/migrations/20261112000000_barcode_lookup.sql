-- Barcode scanning: which catalog item does this barcode belong to?
--
-- Barcodes are shared by every household: once one home tells the app "this barcode is milk",
-- every home's phone knows it. The first answer is kept (a barcode is unique). Lookups only ever
-- point at items the asking household can see (approved, or its own pending items).

create or replace function public.lookup_barcode(p_code text)
returns table (item_id uuid, product_name_ar text, product_name_en text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.item_id, p.name_ar, p.name_en
  from public.product_barcodes b
  join public.products p on p.id = b.product_id and p.deleted_at is null
  join public.items i on i.id = p.item_id and i.deleted_at is null
  where b.barcode = p_code
    and (i.status = 'approved' or public.is_member(i.created_by_household))
  limit 1;
$$;

-- Teach the app a barcode: link it to an item through the item's plain product (no brand, no size),
-- made on first use. Returns the item the barcode belongs to now (someone else's earlier answer wins).
create or replace function public.remember_barcode(p_code text, p_item uuid, p_household uuid, p_name text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item uuid;
  v_product uuid;
  v_name text := nullif(left(trim(coalesce(p_name, '')), 120), '');
  v_arabic boolean := coalesce(p_name, '') ~ '[؀-ۿ]';
begin
  if auth.uid() is null or not public.is_member(p_household) then
    raise exception 'not allowed';
  end if;
  if p_code !~ '^[0-9]{6,14}$' then
    raise exception 'not a product barcode';
  end if;
  if not exists (
    select 1 from public.items i
    where i.id = p_item and i.deleted_at is null and (i.status = 'approved' or i.created_by_household = p_household)
  ) then
    raise exception 'unknown item';
  end if;

  select p.item_id into v_item
  from public.product_barcodes b join public.products p on p.id = b.product_id
  where b.barcode = p_code;
  if found then
    return v_item;
  end if;

  select id into v_product from public.products
  where item_id = p_item and brand_id is null and size_amount is null and size_unit is null and pack_count = 1 and deleted_at is null
  limit 1;
  if v_product is null then
    insert into public.products (item_id, name_en, name_ar, status, created_by, created_by_household)
    values (p_item, case when v_arabic then null else v_name end, case when v_arabic then v_name else null end, 'pending', auth.uid(), p_household)
    returning id into v_product;
  end if;

  insert into public.product_barcodes (barcode, product_id, created_by)
  values (p_code, v_product, auth.uid())
  on conflict (barcode) do nothing;

  select p.item_id into v_item
  from public.product_barcodes b join public.products p on p.id = b.product_id
  where b.barcode = p_code;
  return v_item;
end;
$$;

revoke all on function public.lookup_barcode(text) from public, anon;
revoke all on function public.remember_barcode(text, uuid, uuid, text) from public, anon;
grant execute on function public.lookup_barcode(text) to authenticated;
grant execute on function public.remember_barcode(text, uuid, uuid, text) to authenticated;
