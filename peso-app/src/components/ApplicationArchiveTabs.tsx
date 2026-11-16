import type { ApplicationArchiveSection } from "../utils/applicationArchive";

type Props = {
  value: ApplicationArchiveSection;
  onChange: (section: ApplicationArchiveSection) => void;
  activeCount: number;
  archivedCount: number;
};

export default function ApplicationArchiveTabs({
  value,
  onChange,
  activeCount,
  archivedCount,
}: Props) {
  const buttonClass = (selected: boolean) =>
    `flex min-w-0 items-center justify-center gap-2 rounded-lg px-3 py-3 text-sm font-bold transition ${
      selected
        ? "bg-[#0759AE] text-white shadow-sm"
        : "text-slate-600 hover:bg-white hover:text-[#0759AE]"
    }`;

  return (
    <div
      role="group"
      aria-label="Application archive"
      className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
    >
      <button
        type="button"
        aria-pressed={value === "active"}
        onClick={() => onChange("active")}
        className={buttonClass(value === "active")}
      >
        <span>Active Applications</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            value === "active" ? "bg-white/20" : "bg-slate-200"
          }`}
        >
          {activeCount}
        </span>
      </button>
      <button
        type="button"
        aria-pressed={value === "archived"}
        onClick={() => onChange("archived")}
        className={buttonClass(value === "archived")}
      >
        <span>Archived Applications</span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            value === "archived" ? "bg-white/20" : "bg-slate-200"
          }`}
        >
          {archivedCount}
        </span>
      </button>
    </div>
  );
}
