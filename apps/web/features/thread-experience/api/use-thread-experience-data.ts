"use client";

// SDK backend is the only backend after the Step 6 cutover. This module keeps
// the historical `useThreadExperienceData` name (consumed across the chat
// surfaces) but now delegates straight to the first-party v2 hook.
export { useThreadExperienceDataV2 as useThreadExperienceData } from "./use-thread-experience-data-v2";
