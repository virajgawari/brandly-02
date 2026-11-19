/** Saves an image URL (https or data:) to the user's device. Falls back to opening it in a new tab if the fetch is blocked. */
export async function downloadImage(url: string, filename: string): Promise<void> {
  try {
    const blob = await (await fetch(url)).blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
