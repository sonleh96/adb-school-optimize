/**
 * Before the homepage, `/` opened the screening tool and kept the link's query, so a link such as `/?rule=...` opened
 * that view. Such links keep working: a request for `/` whose query holds anything besides the tags that sharing
 * services add goes on to the tool with its query unchanged. A homepage link passed round on social media keeps its
 * tags and stays on the homepage. Any other query goes to the tool, which ignores what it does not read, so a link
 * made with a key added later still opens its view.
 */
const SHARING_TAG = /^(?:utm_\w+|fbclid|gclid|msclkid)$/i;

/** The tool's address for an old link to it at `/`, or null for any other request. */
export function toolAddressFor(url: Pick<URL, "pathname" | "search" | "searchParams">): string | null {
  if (url.pathname !== "/") return null;
  for (const key of url.searchParams.keys()) if (!SHARING_TAG.test(key)) return `/screening${url.search}`;
  return null;
}
