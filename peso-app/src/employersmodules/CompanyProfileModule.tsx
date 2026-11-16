import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import AppIcon from "../components/AppIcon";

interface CompanyProfile {
  employer_id?: number | string;
  company_name: string;
  company_email: string;
  company_phone: string;
  company_address: string;
  company_description: string;
  industry?: string | null;
  website?: string | null;
  contact_person?: string | null;
  company_logo_url?: string | null;
  is_verified?: boolean;
}

interface CompanyProfileModuleProps {
  profile: CompanyProfile;
  onSave: (
    updatedProfile: CompanyProfile,
    logoFile: File | null,
  ) => Promise<string | null>;
}

export default function CompanyProfileModule({
  profile,
  onSave,
}: CompanyProfileModuleProps) {
  const [formData, setFormData] = useState<CompanyProfile>(profile);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [logoFile]);

  const handleLogoChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    setError("");
    setSuccess("");
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPG, PNG, or WebP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Company image must be 5 MB or smaller.");
      return;
    }
    setLogoFile(file);
    setIsSaving(true);
    try {
      const savedLogoUrl = await onSave(profile, file);
      setFormData((current) => ({
        ...current,
        company_logo_url: savedLogoUrl,
      }));
      setLogoFile(null);
      setSuccess("Company logo updated successfully.");
    } catch (saveError) {
      console.error("Company logo update failed:", saveError);
      setLogoFile(null);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to update the company logo. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const logoSrc = logoPreviewUrl || formData.company_logo_url;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-3xl font-black text-[#123B70]">My Profile</h1>
        <p className="mt-1 text-sm text-slate-500">
          View and manage your company profile and business information.
        </p>
      </header>

      {success && (
        <div role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {success}
        </div>
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {/* COMPANY PROFILE OVERVIEW */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-5 md:items-center xl:grid-cols-[auto_minmax(0,1.35fr)_minmax(15rem,auto)_minmax(0,0.65fr)]">
          <div>
            <input
              ref={logoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => void handleLogoChange(event)}
              disabled={isSaving}
              className="sr-only"
              aria-label="Choose a company logo"
            />
            <button
              type="button"
              onClick={() => logoInputRef.current?.click()}
              disabled={isSaving}
              aria-label={isSaving ? "Saving company logo" : "Change company logo"}
              className="relative block rounded-full text-[#0446A7] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#123B70] disabled:cursor-wait disabled:opacity-70"
            >
              <span className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-white bg-[#123B70] text-2xl font-black text-white shadow-md ring-1 ring-slate-200">
                {logoSrc ? (
                  <img
                    src={logoSrc}
                    alt={`${formData.company_name || "Company"} logo`}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  formData.company_name?.trim().charAt(0).toUpperCase() || "C"
                )}
              </span>
              <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-[#0759AE] text-white shadow">
                {isSaving ? (
                  <span aria-hidden="true" className="text-xs font-bold">...</span>
                ) : (
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  >
                    <path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z" />
                  </svg>
                )}
              </span>
            </button>
          </div>

          <div className="min-w-0">
            <h2 className="flex min-w-0 items-center gap-2 break-words text-xl font-black text-[#123B70] sm:text-2xl">
              {formData.company_name || "Company Name"}
              {formData.is_verified && (
                <span
                  title="Verified employer"
                  className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white"
                >
                  <AppIcon name="check" className="h-3.5 w-3.5" />
                </span>
              )}
            </h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-[#0759AE]">
                Employer
              </span>
            </div>
          </div>

          <div className="col-span-2 grid gap-2 border-t border-slate-100 pt-4 text-sm text-slate-700 md:grid-cols-3 md:border-t-0 md:pt-0 xl:col-span-1 xl:grid-cols-1 xl:border-l xl:border-t-0 xl:pl-5">
            <div className="flex min-w-0 items-center gap-2">
              <AppIcon name="mail" className="h-4 w-4 shrink-0 text-[#0759AE]" />
              <span className="break-all">{formData.company_email || "Email not provided"}</span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <AppIcon name="phone" className="h-4 w-4 shrink-0 text-[#0759AE]" />
              <span>{formData.company_phone || "Phone not provided"}</span>
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <AppIcon name="mapPin" className="h-4 w-4 shrink-0 text-[#0759AE]" />
              <span className="break-words">{formData.company_address || "Address not provided"}</span>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}
