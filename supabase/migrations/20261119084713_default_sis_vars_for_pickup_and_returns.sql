insert into public.crm_settings (key, value, description)
values (
  'pickup_defaults',
  '{
    "pickupLocation": "Sis Vars",
    "pickupPincode": "",
    "returnName": "Sis Vars",
    "returnAddress": "",
    "returnCity": "",
    "returnState": "",
    "returnPincode": "",
    "returnPhone": "",
    "sellerGstTin": "",
    "hsnCode": ""
  }'::jsonb,
  'Pickup, return, GST, and HSN defaults used for shipment booking.'
)
on conflict (key) do update
set value = public.crm_settings.value || jsonb_strip_nulls(
  jsonb_build_object(
    'pickupLocation', case
      when coalesce(public.crm_settings.value->>'pickupLocation', '') in ('', 'Hold My Throttle HQ') then 'Sis Vars'
      else null
    end,
    'returnName', case
      when coalesce(public.crm_settings.value->>'returnName', '') in ('', 'Hold My Throttle HQ') then 'Sis Vars'
      else null
    end
  )
),
updated_at = now();
