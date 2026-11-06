import type { Resource } from "../types.ts";
export const actionNames = [
  "accounts.suspend",
  "accounts.restore",
  "videos.hide",
  "videos.restore",
] as const;
export type AdminAction = (typeof actionNames)[number];
export function actionApplies(action: AdminAction, item: Resource) {
  if (
    !Number.isInteger(item.revision) ||
    Number(item.revision) < 0 ||
    Number(item.revision) > 2147483646
  )
    return false;
  return action === "accounts.suspend"
    ? item.status !== "suspended"
    : action === "accounts.restore"
      ? item.status === "suspended"
      : action === "videos.hide"
        ? !["hidden", "deletion-pending"].includes(item.status)
        : item.status === "hidden";
}
