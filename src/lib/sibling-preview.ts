import { dragActivation } from "./planner-drag";

// Frozen, complete sibling measurements avoid feedback from displaced rows.
export function siblingInsertion(
  centers: number[],
  y: number,
  previous: number,
) {
  let index = previous;
  while (
    index < centers.length &&
    y > centers[index] + dragActivation.hysteresis
  )
    index++;
  while (index > 0 && y < centers[index - 1] - dragActivation.hysteresis)
    index--;
  return index;
}
export function insertSibling(ids: string[], active: string, index: number) {
  const others = ids.filter((id) => id !== active);
  others.splice(index, 0, active);
  return others;
}
