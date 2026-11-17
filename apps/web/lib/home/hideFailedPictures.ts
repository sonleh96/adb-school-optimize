/**
 * The homepage's one script of its own, run inline before the page's pictures are parsed: a picture that fails to
 * load (a dropped connection, a blocked request) would leave a broken-image frame, so the listener hides it. Hidden,
 * it keeps its place: the hero's window shows the paper behind it, and a backdrop leaves its band's own colour, so
 * the page reads as it does with pictures turned off. An image's error does not bubble, so the listener catches it
 * on its way down, at the document.
 */
export const HIDE_FAILED_PICTURES = `document.addEventListener("error", function (event) {
  if (event.target instanceof HTMLImageElement) event.target.style.visibility = "hidden";
}, true);`;
