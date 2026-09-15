import { auth } from "./firebase.js";
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const login = document.getElementById("analytics-login");
const dashboard = document.getElementById("analytics-dashboard");
const errorBox = document.getElementById("analytics-error");
const loading = document.getElementById("analytics-loading");
const range = document.getElementById("range");
const refresh = document.getElementById("refresh");
const googleSignIn = document.getElementById("google-sign-in");
const clearButton = document.getElementById("clear-analytics");
const clearStatus = document.getElementById("clear-status");
let currentUser = null;

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

function rows(items) {
  if (!items.length) return "<tr><td colspan=2 class=empty>No data</td></tr>";
  return items.map(([name, count]) => "<tr><td>" + escapeHtml(name) + "</td><td>" + count.toLocaleString() + "</td></tr>").join("");
}

function renderDaily(daily) {
  const chart = document.getElementById("daily-chart");
  const entries = Object.entries(daily).sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) {
    chart.innerHTML = "<p class=muted>No activity in this range.</p>";
    return;
  }
  const max = Math.max(1, ...entries.map(([, value]) => value.pageViews));
  chart.innerHTML = entries.map(([day, value]) => {
    const height = Math.max(4, Math.round((value.pageViews / max) * 100));
    const label = new Date(day + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric" });
    return "<div class=day-bar title=\"" + escapeHtml(day + " — " + value.pageViews + " page views, " + value.uniqueVisitors + " unique visitors") + ""><div class=bar-value>" + value.pageViews.toLocaleString() + "</div><div class=bar style=\"height:" + height + "%\"></div><div class=bar-label>" + escapeHtml(label) + "</div></div>";
  }).join("");
}

function render(data) {
  document.getElementById("page-views").textContent = data.totals.pageViews.toLocaleString();
  document.getElementById("unique-visitors").textContent = data.totals.uniqueVisitors.toLocaleString();
  document.getElementById("today-visitors").textContent = data.totals.todayVisitors.toLocaleString();
  document.getElementById("active-now").textContent = data.totals.activeNow.toLocaleString();
  document.getElementById("device-rows").innerHTML = rows(data.breakdowns.device);
  document.getElementById("os-rows").innerHTML = rows(data.breakdowns.os);
  document.getElementById("browser-rows").innerHTML = rows(data.breakdowns.browser);
  document.getElementById("country-rows").innerHTML = rows(data.breakdowns.country);
  document.getElementById("page-rows").innerHTML = rows(data.breakdowns.page);
  document.getElementById("referrer-rows").innerHTML = rows(data.breakdowns.referrer);
  document.getElementById("recent-rows").innerHTML = data.recent.length ? data.recent.map(e =>
    "<tr><td>" + new Date(e.timestamp).toLocaleString() + "</td><td>" + escapeHtml(e.device) +
    "</td><td>" + escapeHtml(e.os) + "</td><td>" + escapeHtml(e.browser) +
    "</td><td>" + escapeHtml(e.country) + "</td><td>" + escapeHtml(e.page) + "</td></tr>"
  ).join("") : "<tr><td colspan=6 class=empty>No visits in this range.</td></tr>";
  document.getElementById("retention-days").textContent = data.retentionDays + " days";
  document.getElementById("events-loaded").textContent = data.totals.pageViews.toLocaleString() + (data.truncated ? "+" : "");
  document.getElementById("truncation-warning").hidden = !data.truncated;
  renderDaily(data.daily);
}

async function loadAnalytics(user) {
  loading.hidden = false;
  dashboard.hidden = true;
  errorBox.hidden = true;
  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/analytics?days=" + encodeURIComponent(range.value), {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store"
    });
    if (!response.ok) throw new Error("You do not have access to analytics.");
    render(await response.json());
    dashboard.hidden = false;
    refresh.hidden = false;
  } catch (error) {
    showError(error.message || "Unable to load analytics.");
  } finally {
    loading.hidden = true;
  }
}

googleSignIn.addEventListener("click", async () => {
  errorBox.hidden = true;
  googleSignIn.disabled = true;
  googleSignIn.textContent = "Signing in…";
  try {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Kairos analytics Google sign-in failed:", error);
    const messages = {
      "auth/popup-closed-by-user": "Google sign-in was cancelled.",
      "auth/popup-blocked": "The Google sign-in popup was blocked. Allow popups for Kairos and try again.",
      "auth/unauthorized-domain": "This website domain is not authorized in Firebase Authentication.",
      "auth/operation-not-allowed": "Google sign-in is not enabled in Firebase Authentication.",
      "auth/account-exists-with-different-credential": "This Google account is already linked to another sign-in method.",
      "auth/network-request-failed": "Network error while signing in. Check your connection and try again."
    };
    showError(messages[error.code] || "Google sign-in failed. Check the browser console for the Firebase error code.");
  } finally {
    googleSignIn.disabled = false;
    googleSignIn.textContent = "Continue with Google";
  }
});

document.getElementById("logout").addEventListener("click", () => signOut(auth));
range.addEventListener("change", () => currentUser && loadAnalytics(currentUser));
refresh.addEventListener("click", () => currentUser && loadAnalytics(currentUser));

clearButton.addEventListener("click", async () => {
  const confirmed = window.confirm("Clear ALL Kairos analytics data?\n\nThis permanently deletes every stored analytics event and cannot be undone. New visits will start being recorded again immediately afterward.");
  if (!confirmed || !currentUser) return;

  clearButton.disabled = true;
  clearStatus.hidden = false;
  clearStatus.textContent = "Clearing analytics data…";
  errorBox.hidden = true;
  try {
    const token = await currentUser.getIdToken(true);
    const response = await fetch("/api/analytics", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token }
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Unable to clear analytics data.");
    clearStatus.textContent = "Analytics cleared. " + Number(result.deleted || 0).toLocaleString() + " events deleted.";
    await loadAnalytics(currentUser);
  } catch (error) {
    clearStatus.textContent = error.message || "Unable to clear analytics data.";
  } finally {
    clearButton.disabled = false;
  }
});

onAuthStateChanged(auth, user => {
  currentUser = user;
  if (user) {
    login.hidden = true;
    loadAnalytics(user);
  } else {
    login.hidden = false;
    dashboard.hidden = true;
    refresh.hidden = true;
  }
});
