export class PlanningConflict extends Error {
  constructor(public current: unknown) { super("Someone saved a newer version. Your draft has been kept. Review the saved version before retrying."); }
}
export class PlanningInputError extends Error {}
