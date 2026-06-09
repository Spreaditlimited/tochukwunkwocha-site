(function () {
  function normalizePath(pathname) {
    var path = String(pathname || "/").trim();
    if (!path) return "/";
    return path.endsWith("/") ? path : path + "/";
  }

  function currentLocation() {
    return {
      path: normalizePath(window.location.pathname),
      hash: String(window.location.hash || "").trim().toLowerCase(),
    };
  }

  function isActive(item, loc) {
    var itemPath = normalizePath(item.path);
    if (itemPath !== loc.path) return false;
    if (!item.hash) return !loc.hash;
    return String(item.hash).toLowerCase() === loc.hash;
  }

  function linkHtml(item, active) {
    var activeCls = "flex items-center gap-3 px-3 py-2.5 rounded-lg bg-brand-600/40 text-white";
    var idleCls = "flex items-center gap-3 px-3 py-2.5 rounded-lg text-brand-100 hover:bg-white/5";
    var attrs = active ? ' aria-current="page"' : "";
    var href = String(item.href || item.path || "/dashboard/");
    var extra = item.extraAttr ? " " + String(item.extraAttr) : "";
    var icon = item.icon || "";
    return '<a href="' + href + '" class="' + (active ? activeCls : idleCls) + '"' + attrs + extra + ">" + icon + '<span>' + item.label + "</span></a>";
  }

  function renderForSidebar(aside) {
    if (!aside) return;
    var nav = aside.querySelector("nav");
    if (!nav) return;

    var menu = [
      { label: "Overview", path: "/dashboard/", href: "/dashboard/" },
      { label: "My Courses", path: "/dashboard/courses/", href: "/dashboard/courses/" },
      {
        label: "Group Enrollment",
        path: "/dashboard/family/",
        href: "/dashboard/family/",
        icon: '<svg class="h-4 w-4 flex-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      },
      { label: "My Domains", path: "/dashboard/domains/", href: "/dashboard/domains/" },
      { label: "Affiliate", path: "/dashboard/affiliate/", href: "/dashboard/affiliate/" },
      { label: "Profile", path: "/dashboard/", hash: "#profile", href: "/dashboard/#profile", extraAttr: "data-profile-nav-link" },
    ];

    var loc = currentLocation();
    var html = menu.map(function (item) {
      return linkHtml(item, isActive(item, loc));
    }).join("");
    nav.innerHTML = html;
  }

  var sidebars = Array.prototype.slice.call(document.querySelectorAll("aside")).filter(function (aside) {
    var nav = aside.querySelector("nav");
    return !!nav;
  });
  sidebars.forEach(renderForSidebar);
})();
