import { auth } from "./firebase.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const login = document.getElementById("analytics-login");
const dashboard = document.getElementById("analytics-dashboard");
const errorBox = document.getElementById("analytics-error");
const loading = document.getElementById("analytics-loading");

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}

function rows(items) {
  return items.map(([name, count]) => "<tr><td>" + escapeHtml(name) + "</td><td>" + count + "</td></tr>").join("");
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
  document.getElementById("recent-rows").innerHTML = data.recent.map(e =>
    "<tr><td>" + new Date(e.timestamp).toLocaleString() + "</td><td>" + escapeHtml(e.device) +
    "</td><td>" + escapeHtml(e.os) + "</td><td>" + escapeHtml(e.browser) +
    "</td><td>" + escapeHtml(e.country) + "</td><td>" + escapeHtml(e.page) + "</td></tr>"
  ).join("");
}

async function loadAnalytics(user) {
  loading.hidden = false; dashboard.hidden = true; errorBox.hidden = true;
  try {
    const token = await user.getIdToken();
    const response = await fetch("/api/analytics?days=30", { headers: { Authorization: "Bearer " + token }, cache: "no-store" });
    if (!response.ok) throw new Error("You do not have access to analytics.");
    render(await response.json());
    dashboard.hidden = false;
  } catch (error) {
    showError(error.message || "Unable to load analytics.");
  } finally {
    loading.hidden = true;
  }
}

document.getElementById("login-form").addEventListener("submit", async event => {
  event.preventDefault(); errorBox.hidden = true;
  try {
    await signInWithEmailAndPassword(auth, document.getElementById("email").value.trim(), document.getElementById("password").value);
  } catch { showError("Sign-in failed."); }
});
document.getElementById("logout").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, user => {
  if (user) { login.hidden = true; loadAnalytics(user); }
  else { login.hidden = false; dashboard.hidden = true; }
});
