export const AUTH_COOKIE = "bw_auth";

/** Hash the shared password into the token stored in the cookie.
 *  Uses Web Crypto so it runs in both edge middleware and node routes. */
export async function passwordToken(password: string): Promise<string> {
  const data = new TextEncoder().encode(`body-workshop:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
