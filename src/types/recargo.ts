export type RecargoConfig = {
  nightStart: string; // HH:MM string when recargo nocturno begins
  nightEnd: string; // HH:MM string when recargo nocturno ends the next day
  nightDiffHours: number; // Hours to discount on cross-day night segments
};

export const DEFAULT_RECARGO_CONFIG: RecargoConfig = {
  nightStart: "19:00",
  nightEnd: "06:00",
  nightDiffHours: 1,
};
