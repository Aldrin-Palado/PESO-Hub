REVOKE UPDATE ON TABLE public.application
  FROM authenticated;

GRANT UPDATE (
  status,
  applicant_name,
  applicant_email,
  applicant_contact_no,
  applicant_address,
  applicant_resume_url,
  applicant_qualification_files
)
ON TABLE public.application
TO authenticated;
