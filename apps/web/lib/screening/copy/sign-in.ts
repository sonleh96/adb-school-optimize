/**
 * The words of the sign-in page, the first screen a person sees. They are for staff and counterparts who are not
 * data specialists: plain, short, no blame, and each error says what happened and what to do next. Sign-in is the
 * only page that reads them, so they sit apart from `LAYOUT` and the workspace does not ship them.
 */
export const SIGN_IN = Object.freeze({
  title: "Sign in to see the school screening",
  lead: "Use your work email. We will email you a link that signs you in once.",
  emailLabel: "Work email",
  button: "Email me a sign-in link",
  /** After the link is sent. */
  sent: "We have emailed you a link. Open it on this device to sign in.",
  /** Under the form, when the site cannot send links yet. */
  unavailable: "Signing in is not available until the site is set up.",
  /** By the `error` the page is opened with. */
  errors: Object.freeze({
    allowlist:
      "This email does not have access yet. Try your work email, or ask the project team to add you.",
    callback: "That sign-in link has expired or was already used. Ask for a new link below.",
    configuration:
      "Signing in is not set up for this site yet. Ask the project team to finish setting it up.",
    delivery:
      "We could not send the email. Try again in a moment, and tell the project team if it keeps happening.",
  }),
});
