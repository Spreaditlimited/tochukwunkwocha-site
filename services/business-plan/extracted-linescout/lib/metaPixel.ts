export function track(eventName: string, params?: Record<string, any>) {
  if (typeof window === "undefined") return;
  const fbq = (window as any).fbq;
  if (typeof fbq !== "function") return;

  if (params) fbq("track", eventName, params);
  else fbq("track", eventName);
}