// General QA never contacts Toy, even if this preview is hosted inside Toy.
export function isToyPage() { return false; }
export async function loadToySdk() { return null; }
export async function loadToyCloudStorage() { return null; }
