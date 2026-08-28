---
layout: page
title: "How search works"
eyebrow: "About"
summary: "Search runs entirely in your browser — queries are answered on your device, not by a server."
permalink: /about/search/
---
{% assign cfg = site.data.site %}
{% assign schema = site.data.schema %}
{% assign hs_plural = schema.entry.plural | default: 'Entries' | downcase %}

This site has no search server. When you type into the search box, your browser
searches a copy of the catalog it already downloaded — the query is answered on
your device, by your device.

## Private by architecture

Most site search sends every keystroke to a server, and a server can keep what
it receives. Here there is nothing to send it to: the catalog is published as a
set of static pages, and the search index is just one more public file
(`/search.json`) alongside them. Your browser fetches it once and does the rest
locally, which means:

- **No query log.** Typing sends nothing anywhere: every keystroke is answered
  locally, and there is no analytics event on a search. One honest caveat —
  the page keeps your current search in the address bar, so reloading or
  sharing the page brings the search back, and opening such an address sends
  the query to the web host the way any address is sent. If a search itself
  is sensitive, clear the box before bookmarking or sharing the page.
- **Nothing to breach.** A search backend that does not exist cannot leak.
- **It works the same for everyone.** The index your browser searches is the
  same public file anyone can download and inspect.

## What the search understands

The index is rebuilt every time the catalog changes. Beyond the text of each
entry, the build derives a *concept map* from the catalog's own writing — which
words keep appearing in the same {{ hs_plural }} without being common
everywhere. A query quietly widens to its related words, so a search can find
{{ schema.entry.singular | default: 'an entry' | downcase }} that is *about*
your words without containing them. Two guarantees hold:

- A widened match never outranks anything your own words found — it is added
  strictly below the weakest literal match.
- The map is derived deterministically from the published text at build time.
  No machine-learning model runs in your browser, and none runs in the build.

## Fast without a server

Building a search engine in the browser takes real work, and that work is what
this site engineers around rather than shipping off to a server:

- **The index builds in the background.** On most devices a background thread
  assembles the search engine while you are still reading the page, so the
  first keystroke rarely waits.
- **Finished work is kept.** Your browser stores the built index locally,
  keyed to the exact content it was built from. Come back to an unchanged
  catalog and search is ready instantly — no download, no rebuild. The copy
  lives only in your browser and expires the moment the catalog changes.
- **Weak devices get a choice, not a stall.** On a low-powered device facing a
  large catalog, the page shows a **Load full search** button with an honest
  progress readout instead of silently spending seconds of its time. Until
  then, typing still suggests the catalog's own tags and filters, which need
  no index at all.
- **Metered connections are respected.** On a data-saver or very slow
  connection, nothing is downloaded until you actually search.

The behavior at every catalog size is measured, not assumed: an automated
budget suite drives search, filtering and sorting in a real browser at up to a
thousand {{ hs_plural }} on every change to the template.
