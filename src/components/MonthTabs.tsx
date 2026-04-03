type MonthTabsProps = {
  months: string[];
  activeIndex: number;
  onSelect: (index: number) => void;
};

export function MonthTabs({ months, activeIndex, onSelect }: MonthTabsProps) {
  if (!months.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-muted/25 p-2">
      {months.map((month, index) => {
        const isActive = index === activeIndex;
        return (
          <button
            key={month}
            type="button"
            onClick={() => onSelect(index)}
            className={[
              "rounded-lg px-3.5 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              isActive
                ? "bg-foreground text-background shadow-sm"
                : "text-muted-foreground hover:bg-background hover:text-foreground hover:shadow-sm",
            ].join(" ")}
            aria-pressed={isActive}
          >
            {month}
          </button>
        );
      })}
    </div>
  );
}
