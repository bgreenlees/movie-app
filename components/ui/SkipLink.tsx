"use client";

// First focusable element on every page. Hidden until it receives keyboard
// focus, then jumps past the navbar to the page's <main>.
export default function SkipLink() {
  function skip(e: React.MouseEvent<HTMLAnchorElement>) {
    // Pages differ (some have no id), so fall back to the first <main>.
    const main =
      document.getElementById("main-content") ?? document.querySelector("main");
    if (!main) return;
    e.preventDefault();
    if (!main.hasAttribute("tabindex")) main.setAttribute("tabindex", "-1");
    main.focus();
    main.scrollIntoView();
  }

  return (
    <a
      href="#main-content"
      onClick={skip}
      className="skip-link"
    >
      Skip to content
    </a>
  );
}
