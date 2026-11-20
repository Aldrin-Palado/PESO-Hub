DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_permissions'
      AND policyname = 'Superadmin can create staff permissions'
  ) THEN
    ALTER POLICY "Superadmin can create staff permissions"
      ON public.staff_permissions
      RENAME TO "Admin can create staff permissions";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_permissions'
      AND policyname = 'Superadmin can update staff permissions'
  ) THEN
    ALTER POLICY "Superadmin can update staff permissions"
      ON public.staff_permissions
      RENAME TO "Admin can update staff permissions";
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'staff_permissions'
      AND policyname = 'Superadmin can view staff permissions'
  ) THEN
    ALTER POLICY "Superadmin can view staff permissions"
      ON public.staff_permissions
      RENAME TO "Admin can view staff permissions";
  END IF;
END
$$;
