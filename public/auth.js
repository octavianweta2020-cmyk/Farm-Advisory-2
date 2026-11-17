// auth.js: used by BOTH login.html and signup.html.
// The form's data-action says which API route to call, so one script serves both pages.
const form = document.getElementById("authForm");
const message = document.getElementById("msg");

form.addEventListener("submit", async event => {
  event.preventDefault();                                  // stop the browser reloading the page
  message.textContent = "";
  try {
    await api(form.dataset.action, "POST", Object.fromEntries(new FormData(form)));
    location.href = "/app.html";                           // success: go to the dashboard
  } catch (err) {
    message.textContent = err.message;
  }
});
setupNav();
