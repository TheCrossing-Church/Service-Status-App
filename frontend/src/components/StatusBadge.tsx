type Props = {
  label: string | null;
  color: string | null;
  icon: string | null;
  // When the underlying campus has no current status yet.
  empty?: boolean;
};

// Pill-shaped status indicator. Falls back to a neutral gray "No status
// yet" badge when the campus has never published.
export function StatusBadge({ label, color, icon, empty }: Props) {
  if (empty || !label) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 text-slate-500 px-3 py-1 text-sm font-medium">
        <span className="h-2 w-2 rounded-full bg-slate-300" />
        No status yet
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-white"
      style={{ backgroundColor: color ?? "#475569" }}
    >
      {icon && <span aria-hidden>{icon}</span>}
      {label}
    </span>
  );
}
