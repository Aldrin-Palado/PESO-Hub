type Props = {
  size?: "small" | "medium";
};

export default function OfficialPESOBadge({ size = "small" }: Props) {
  const badgeSize = size === "medium" ? "h-5 w-5" : "h-4 w-4";
  const checkSize = size === "medium" ? "h-3.5 w-3.5" : "h-3 w-3";

  return (
    <span
      role="img"
      aria-label="Official PESO account"
      title="Official PESO account"
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-[#D4A017] text-white shadow-sm ${badgeSize}`}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        className={checkSize}
      >
        <path
          d="m3.5 8.2 2.8 2.7 6.2-6"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </svg>
    </span>
  );
}
