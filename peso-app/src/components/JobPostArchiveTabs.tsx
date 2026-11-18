type Props = {
  value: "active" | "archived";
  onChange: (section: "active" | "archived") => void;
  activeCount: number;
  archivedCount: number;
};

export default function JobPostArchiveTabs({
  value,
  onChange,
  activeCount,
  archivedCount,
}: Props) {
  return (
    <div className="relative">
      <select
        aria-label="Job post archive"
        value={value}
        onChange={(event) =>
          onChange(event.target.value as "active" | "archived")
        }
        className="w-full appearance-none rounded-xl border border-slate-200 bg-slate-100 py-3 pl-4 pr-24 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
      >
        <option value="active">Active Job Posts</option>
        <option value="archived">Archived Job Posts</option>
      </select>
      <span className="pointer-events-none absolute right-10 top-1/2 -translate-y-1/2 rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
        {value === "active" ? activeCount : archivedCount}
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500"
      >
        <path
          fillRule="evenodd"
          d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z"
          clipRule="evenodd"
        />
      </svg>
    </div>
  );
}
