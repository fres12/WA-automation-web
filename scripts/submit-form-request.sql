create or replace function public.submit_form_request(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sheet_data jsonb;
  range_value text;
  request_id uuid;
  sheet_id uuid;
begin
  if jsonb_typeof(payload->'sheets') <> 'array'
     or jsonb_array_length(payload->'sheets') = 0 then
    raise exception 'Minimal 1 sheet harus diisi';
  end if;

  insert into public.form_request (
    nama_automation,
    link,
    jam_blast,
    tanggal_blast,
    caption,
    created_by
  ) values (
    payload->>'nama_automation',
    payload->>'link',
    (payload->>'jam_blast')::time,
    payload->>'tanggal_blast',
    nullif(payload->>'caption', ''),
    auth.uid()
  )
  returning id into request_id;

  for sheet_data in
    select jsonb_array_elements(payload->'sheets')
  loop
    insert into public.request_sheets (request_id, sheet_name)
    values (request_id, sheet_data->>'sheet_name')
    returning id into sheet_id;

    for range_value in
      select jsonb_array_elements_text(sheet_data->'ranges')
    loop
      insert into public.sheet_tables (sheet_id, cell_range)
      values (sheet_id, upper(range_value));
    end loop;
  end loop;

  return jsonb_build_array(request_id);
end;
$$;

grant execute on function public.submit_form_request(jsonb) to anon;
grant execute on function public.submit_form_request(jsonb) to authenticated;
