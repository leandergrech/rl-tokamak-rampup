/* Left navigation: the current page's sections sit under its entry (toc.integrate), folded by default.
 * A chevron next to the page name opens or closes them; the choice is remembered in this browser.
 * The same control works in the phone drawer (opened with the menu button, top left). */
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
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "rt-toc-toggle";
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const apply = (open) => {
      li.classList.toggle("rt-toc-open", open);
      btn.setAttribute("aria-expanded", String(open));
      btn.title = open ? "Hide the sections of this page" : "Show the sections of this page";
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
    // Phone drawer: tapping a section closes the drawer so the reader lands on it.
    toc.addEventListener("click", (e) => {
      if (e.target.closest("a")) {
        const drawer = document.getElementById("__drawer");
        if (drawer && drawer.checked) drawer.checked = false;
      }
    });
  }
  if (window.document$ && window.document$.subscribe) window.document$.subscribe(setup);
  else if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
