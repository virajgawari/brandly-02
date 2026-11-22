// Onboarding takes an Instagram handle but runs in the browser; the scrape + learn pipeline lives on the
// Brand page. This one-shot flag hands the job over: set at the end of onboarding, consumed once on arrival.
const key = (brandId: string) => `brandly:learn-ig:${brandId}`;

export function queueInstagramLearning(brandId: string): void {
  try {
    localStorage.setItem(key(brandId), "1");
  } catch {
    /* storage blocked: the user can still press "Learn from Instagram" */
  }
}

/** Whether learning is queued, without consuming it (lets the Brand page open the right tab). */
export function hasQueuedInstagramLearning(brandId: string): boolean {
  try {
    return localStorage.getItem(key(brandId)) === "1";
  } catch {
    return false;
  }
}

/** True once per queued brand; clears the flag so a reload never re-runs the scrape. */
export function takeQueuedInstagramLearning(brandId: string): boolean {
  try {
    if (localStorage.getItem(key(brandId)) !== "1") return false;
    localStorage.removeItem(key(brandId));
    return true;
  } catch {
    return false;
  }
}
