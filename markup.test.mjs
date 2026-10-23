// markup.test.mjs — a tag in the page's markup is found; the same tag inside a script's text is passed over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markupTag } from './markup.mjs';

const PAGE = '<html><head><script>w.document.write("<html><head></head><body>"+x+"</body></html>")</script></head>'
  + '<body><p>hi</p><script>f.srcdoc = "<body>wait</body>";</script></body></html>';

test('the page’s own </head> and last </body>, never the ones a script writes', () => {
  const head = markupTag(PAGE, '</head>', false);
  assert.equal(PAGE.slice(head - 9, head), '</script>', 'the head the page closes, after its script');
  assert.equal(PAGE.indexOf('</head>') < head, true, 'the first </head> in the text is inside the script');
  const body = markupTag(PAGE, '</body>', true);
  assert.equal(body, PAGE.lastIndexOf('</body>'));
  assert.equal(markupTag(PAGE, '</body>', false), body, 'every other </body> is inside a script');
  assert.equal(markupTag('<p></body><p></body>', '</body>', false), 3);
  assert.equal(markupTag('<p></body><p></body>', '</body>', true), 13);
});

test('a script ends where the browser ends it; a tag at its very edge is markup', () => {
  const s = '<script>a="</head>"</script></head>';
  assert.equal(markupTag(s, '</head>', false), s.length - 7);
  assert.equal(markupTag('</head><script>x</script>', '</head>', false), 0, 'right before a script');
  assert.equal(markupTag('<script>x</script></head>', '</head>', true), 18, 'right after a script');
  assert.equal(markupTag('<SCRIPT type="x">"</head>"</SCRIPT></head>', '</head>', false), 35, 'any case, any attributes');
  assert.equal(markupTag('<script>"</head>"</script>', '</head>', false), -1);
  assert.equal(markupTag('<script>"</head>" never closed', '</head>', false), 9, 'an unclosed script is no script');
  assert.equal(markupTag('<p><script>x</script>', '<script', false), 3, 'a script’s own opening tag is markup');
});

test('junk is answered with -1, never thrown', () => {
  assert.equal(markupTag('<p>', '</head>', false), -1);
  for (const [h, t] of [[null, '</head>'], [5, '</head>'], ['<p></head>', ''], ['<p></head>', null], [[], []]]) assert.equal(markupTag(h, t, false), -1);
});
