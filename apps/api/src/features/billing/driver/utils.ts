import { ENDED_STATUSES } from "./constants.ts";

export const isLive = (status: string) => !ENDED_STATUSES.has(status);
