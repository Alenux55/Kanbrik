export function registrationAllowed(mode: string, url: URL, localEnabled: boolean, previewEnabled: boolean) {
  if (mode === "preview") return previewEnabled && url.protocol === "https:";
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return (mode === "local" || mode === "test") && loopback && localEnabled && ["http:", "https:"].includes(url.protocol);
}
