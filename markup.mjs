// markup.mjs — where a tag sits in a page's own markup, not inside a script's text. porter.mjs puts the kit before the
// page's </head> (else its last </body>); a script that writes a print window or an iframe holds those tags in its
// strings, and a block put there splits the script in two (seven estate pages were broken that way by an older
// injector). A script ends where the browser ends it: at the first </script>. Pure and total.

const SCRIPT = /<script\b[^>]*>[\s\S]*?<\/script>/gi;

/** the index of `tag` as markup: the first such place, or with `last` the last one. -1 when there is none. */
export function markupTag(html, tag, last) {
  if (typeof html !== 'string' || typeof tag !== 'string' || tag.length === 0) return -1;
  const spans = [...html.matchAll(SCRIPT)].map((m) => [m.index, m.index + m[0].length]);
  let found = -1;
  for (let i = html.indexOf(tag); i >= 0; i = html.indexOf(tag, i + 1)) {
    if (spans.some(([a, b]) => i > a && i < b)) continue;
    found = i;
    if (!last) break;
  }
  return found;
}
