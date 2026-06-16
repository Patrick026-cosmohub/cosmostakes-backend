
CREATE POLICY "Staff read cms buckets" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id IN ('cms-assets','cms-music','platform-logos') AND has_any_staff_role(auth.uid()));

CREATE POLICY "Super admin write cms buckets" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('cms-assets','cms-music','platform-logos') AND has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin update cms buckets" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id IN ('cms-assets','cms-music','platform-logos') AND has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admin delete cms buckets" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id IN ('cms-assets','cms-music','platform-logos') AND has_role(auth.uid(), 'super_admin'));
