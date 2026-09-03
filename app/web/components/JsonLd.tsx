/**
 * Renders a schema.org graph as a <script type="application/ld+json"> block.
 *
 * A SERVER COMPONENT WITH NO 'use client'. Structured data has to be in the
 * HTML the crawler is handed — a block written by client JavaScript is only
 * seen by crawlers that render, and only if they wait long enough. This runs on
 * the server and ships in the document.
 *
 * `JSON.stringify` output is placed with dangerouslySetInnerHTML because that
 * is the only way to put raw text inside a <script>; React would otherwise
 * escape it into entities and the JSON would not parse. The escaping below is
 * the necessary counterpart: `<` is replaced with its unicode escape so that a
 * `</script>` sequence occurring inside any string value (an album title, an
 * article dek) cannot close this tag early and turn the rest of the page into
 * executable markup. This is the standard mitigation and it is not optional —
 * every string in these graphs is authored content.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
