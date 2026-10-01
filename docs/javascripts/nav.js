/* Left navigation: the current page's sections live under its entry (toc.integrate).
 * On wide screens they start folded; a chevron next to the page name opens them, and the choice is
 * remembered for this browser. On narrow screens Material's own drawer behaviour is left alone. */
(function () {
  "use strict";
  const KEY = "rt-toc-open";
  const read = () => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch (e) {
      return false;
    }
  };
  const write = (v) => {
    try {
      localStorage.setItem(KEY, v ? "1" : "0");
    } catch (e) {}
  };
  function setup() {
    const li = document.querySelector(".md-nav--primary .md-nav__item--active:not(.md-nav__item--nested)");
    if (!li || li.dataset.rtToc) return;
    const toc = li.querySelector(":scope > nav.md-nav--secondary");
    const link = li.querySelector(":scope > a.md-nav__link--active");
    if (!toc || !link || !toc.querySelector(".md-nav__link")) return;
    li.dataset.rtToc = "1";
    li.classList.add("rt-has-toc");
    const top = toc.querySelector(":scope > .md-nav__list");
    const n = top ? top.children.length : 0;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rt-toc-toggle";
    btn.innerHTML = `<span class="rt-toc-count">${n}</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    const apply = (open) => {
      li.classList.toggle("rt-toc-open", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.title = open ? "Hide the sections of this page" : `Show the ${n} sections of this page`;
      btn.setAttribute("aria-label", btn.title);
    };
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const open = !li.classList.contains("rt-toc-open");
      apply(open);
      write(open);
    });
    link.after(btn);
    apply(read());
  }
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(setup);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
