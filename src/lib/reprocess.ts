export function shouldReuseDocument(status: string, force: boolean): boolean {
  return !force && status !== "failed";
}
