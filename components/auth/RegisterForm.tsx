"use client";

import LoginForm from "./LoginForm";

// The register card is dark glass (same as /login), so the Google button's
// light text is readable. LoginForm has no focus style of its own, so the
// wrapper gives its button a visible keyboard focus ring.
export default function RegisterForm() {
  return (
    <div className="[&_button:focus-visible]:outline-2 [&_button:focus-visible]:outline-offset-2 [&_button:focus-visible]:outline-[#a855f7]">
      <LoginForm />
    </div>
  );
}
