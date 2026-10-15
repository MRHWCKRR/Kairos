(function () {
  try {
    const key = "kairosAnalytics:" + location.pathname;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    const payload = JSON.stringify({
      page: location.pathname.slice(0, 160),
      referrer: document.referrer ? document.referrer.slice(0, 500) : ""
    });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
    } else {
      fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => {});
    }
  } catch (_) {}
})();
