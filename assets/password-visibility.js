(function () {
  var INPUT_SELECTOR = 'input[type="password"], input[type="text"][data-password-visible="1"]';
  var ENHANCED_ATTR = "data-password-toggle-enhanced";

  function buildIcon(isVisible) {
    if (isVisible) {
      return '' +
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
        '<path d="M3 3l18 18" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '<path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '<path d="M9.9 5.1A10.8 10.8 0 0 1 12 5c7.2 0 10 7 10 7a12.9 12.9 0 0 1-3.2 4.1" stroke-linecap="round" stroke-linejoin="round"></path>' +
        '<path d="M6.5 6.5C3.7 8.1 2 12 2 12s2.8 7 10 7c1.3 0 2.4-.2 3.4-.6" stroke-linecap="round" stroke-linejoin="round"></path>' +
        "</svg>";
    }
    return '' +
      '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M2 12s2.8-7 10-7 10 7 10 7-2.8 7-10 7-10-7-10-7z" stroke-linecap="round" stroke-linejoin="round"></path>' +
      '<circle cx="12" cy="12" r="3" stroke-linecap="round" stroke-linejoin="round"></circle>' +
      "</svg>";
  }

  function setButtonState(input, button, visible) {
    button.innerHTML = buildIcon(visible);
    button.setAttribute("aria-label", visible ? "Hide password" : "Show password");
    button.title = visible ? "Hide password" : "Show password";
    if (visible) input.setAttribute("data-password-visible", "1");
    else input.removeAttribute("data-password-visible");
  }

  function enhanceInput(input) {
    if (!input || input.getAttribute(ENHANCED_ATTR) === "1") return;
    var type = String(input.getAttribute("type") || "").toLowerCase();
    if (type !== "password" && !(type === "text" && input.getAttribute("data-password-visible") === "1")) return;

    var wrapper = document.createElement("span");
    wrapper.style.position = "relative";
    wrapper.style.display = "block";
    wrapper.style.width = "100%";

    var parent = input.parentNode;
    if (!parent) return;
    parent.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    var button = document.createElement("button");
    button.type = "button";
    button.style.position = "absolute";
    button.style.right = "10px";
    button.style.top = "50%";
    button.style.transform = "translateY(-50%)";
    button.style.display = "inline-flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    button.style.width = "28px";
    button.style.height = "28px";
    button.style.border = "0";
    button.style.background = "transparent";
    button.style.padding = "0";
    button.style.margin = "0";
    button.style.cursor = "pointer";
    button.style.color = "#475569";
    button.setAttribute("data-password-toggle", "1");

    var existingPaddingRight = parseFloat(window.getComputedStyle(input).paddingRight || "0");
    if (!Number.isFinite(existingPaddingRight) || existingPaddingRight < 40) {
      input.style.paddingRight = "2.5rem";
    }

    setButtonState(input, button, false);
    button.addEventListener("click", function () {
      var visible = String(input.getAttribute("type") || "").toLowerCase() === "password";
      input.setAttribute("type", visible ? "text" : "password");
      setButtonState(input, button, visible);
    });

    wrapper.appendChild(button);
    input.setAttribute(ENHANCED_ATTR, "1");
  }

  function enhanceAll(root) {
    var base = root && root.querySelectorAll ? root : document;
    var inputs = base.querySelectorAll(INPUT_SELECTOR);
    for (var i = 0; i < inputs.length; i += 1) {
      enhanceInput(inputs[i]);
    }
  }

  function init() {
    enhanceAll(document);
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        var mutation = mutations[i];
        for (var j = 0; j < mutation.addedNodes.length; j += 1) {
          var node = mutation.addedNodes[j];
          if (!node || node.nodeType !== 1) continue;
          if (node.matches && node.matches(INPUT_SELECTOR)) {
            enhanceInput(node);
          } else if (node.querySelectorAll) {
            enhanceAll(node);
          }
        }
      }
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
