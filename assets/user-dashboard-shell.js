(function () {
  const signoutButtons = Array.from(document.querySelectorAll("[data-user-signout]"));
  if (!signoutButtons.length) return;

  async function signOut() {
    signoutButtons.forEach(function (button) {
      button.disabled = true;
      button.textContent = "Signing out...";
    });

    await fetch("/.netlify/functions/user-auth-logout", {
      method: "POST",
      credentials: "include",
    }).catch(function () {
      return null;
    });

    window.location.href = "/dashboard/";
  }

  signoutButtons.forEach(function (button) {
    button.addEventListener("click", function () {
      signOut().catch(function () {
        window.location.href = "/dashboard/";
      });
    });
  });
})();
