ALTER TABLE public.peso_announcements
  ADD COLUMN IF NOT EXISTS image_urls text[] NOT NULL DEFAULT ARRAY[]::text[];

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'peso-announcement-images',
  'peso-announcement-images',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can view PESO announcement images"
  ON storage.objects;
CREATE POLICY "Public can view PESO announcement images"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'peso-announcement-images');

DROP POLICY IF EXISTS "PESO content staff can upload announcement images"
  ON storage.objects;
CREATE POLICY "PESO content staff can upload announcement images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'peso-announcement-images'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.peso_staff staff
      JOIN public.staff_permissions permissions
        ON permissions.peso_staff_id = staff.peso_staff_id
      WHERE staff.user_id = auth.uid()
        AND staff.is_active
        AND permissions.notifications
    )
  )
);

DROP POLICY IF EXISTS "PESO content staff can delete announcement images"
  ON storage.objects;
CREATE POLICY "PESO content staff can delete announcement images"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'peso-announcement-images'
  AND (
    public.is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.peso_staff staff
      JOIN public.staff_permissions permissions
        ON permissions.peso_staff_id = staff.peso_staff_id
      WHERE staff.user_id = auth.uid()
        AND staff.is_active
        AND permissions.notifications
    )
  )
);
