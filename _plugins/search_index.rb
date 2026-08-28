# frozen_string_literal: true

require "digest"
require "json"
require "fileutils"
require "time"

require_relative "showcase"

# Generates /search.json for the client-side Lunr search. Which fields are
# indexed comes from _data/schema.yml (fields with `search: true` or
# `facet: true`); title and summary are always separate indexed fields. Events
# and cohort pages are indexed too so site search finds them.
#
# Each entry doc is {id, title, summary, facets, sections, url, kind}:
#
#   facets    the schema field values as one string, indexed as its own lunr
#             field so a facet hit can be boosted differently from prose.
#   sections  the write-up split on its `##` headings — [{h: "How to reuse",
#             a: "how-to-reuse", t: "…"}] — so a body hit can name the section
#             it came from and deep-link to it. `a` is the anchor kramdown
#             generates for that heading, which is also what _includes/toc.html
#             links to.
#
# Beside the docs the payload carries two query-side widenings, both read by
# assets/js/search.js and neither able to reorder a literal hit:
#
#   synonyms  the editor's word pairs from _data/search.yml.
#   concepts  term relatedness DERIVED FROM THIS CATALOG'S OWN PROSE — the words
#             that keep turning up in the same entries without simply being
#             common everywhere. See `concept_terms`. Tuned (or switched off)
#             under `concepts:` in _data/search.yml.
#
# Title and summary are deliberately NOT copied into the body text: they are
# already indexed fields, and duplicating them scored every title term three
# times and made the boosts impossible to reason about. The whole write-up is
# indexed by default — the sections that used to fall off the end of a 2,000
# character cap were "Lessons learned" and "How to reuse", which is the content
# a reuse catalog exists to surface. `schema.search.body_chars` caps it again
# for very large catalogs (0 = unlimited).
#
# SearchIndexGenerator runs as a Jekyll::Generator (`generate` hook, priority
# :low so it runs after other generators/pages have populated `site.pages`,
# e.g. entry/event/cohort pages). Input: `site.data["schema"]["fields"]` and
# the rendered `site.pages` (title/summary/body front matter). Output: a
# SearchIndexFile added to `site.static_files`, written to `/search.json` at
# `Jekyll::StaticFile#write` time (Jekyll's normal static-file write pass).
module CatalogTemplate
  # A Jekyll::StaticFile whose content is computed in memory (the search
  # index payload) rather than copied from a file on disk.
  class SearchIndexFile < Jekyll::StaticFile
    # @param site [Jekyll::Site]
    # @param payload [Hash] the JSON-serializable search index ({generated_at:, docs:})
    def initialize(site, payload)
      super(site, site.source, "", "search.json")
      @payload = payload
    end

    # Writes the payload as JSON to `dest/search.json`.
    # @param dest [String] destination directory (Jekyll's `_site` by default)
    # @return [Boolean] true on success (Jekyll::StaticFile#write contract)
    def write(dest)
      dest_path = destination(dest)
      FileUtils.mkdir_p(File.dirname(dest_path))
      File.write(dest_path, JSON.generate(@payload))
      true
    end
  end

  class SearchIndexGenerator < Jekyll::Generator
    safe true
    priority :low

    # Builds the search payload from indexable pages and queues it for write.
    # @param site [Jekyll::Site]
    # @return [void]
    def generate(site)
      # The showcase landing has no catalog to search; each example builds its own.
      return if CatalogTemplate::Showcase.landing?(site)

      schema = site.data["schema"] || {}
      fields = Array(schema["fields"])
      searchable = fields.select { |f| f["search"] || f["facet"] }.map { |f| f["key"] }
      cap = schema.dig("search", "body_chars").to_i
      options = concept_options(site)

      baseurl = site.config["baseurl"].to_s.chomp("/")
      docs = []
      site.pages.each do |page|
        case page.data["layout"]
        when "entry"
          docs << {
            id: page.data["slug"] || Jekyll::Utils.slugify(page.data["title"].to_s),
            title: page.data["title"],
            summary: page.data["summary"],
            facets: searchable.map { |k| field_text(page.data[k]).join(" ") }.reject(&:empty?).join(" "),
            sections: body_sections(page, cap),
            url: baseurl + page.url,
            kind: "entry"
          }
        when "event"
          docs << {
            id: "event:#{page.data['cohort']}:#{page.data['event_id']}",
            title: page.data["title"],
            summary: page.data["summary"],
            facets: [page.data["event_location"], page.data["cohort"]].compact.join(" "),
            sections: [],
            url: baseurl + page.url,
            kind: "event"
          }
        when "cohort"
          docs << {
            id: "cohort:#{page.data['year']}",
            title: page.data["title"],
            summary: page.data["intro"],
            facets: page.data["year"].to_s,
            sections: [],
            url: baseurl + page.url,
            kind: "cohort"
          }
        end
      end

      synonym_map = synonyms(site)
      concept_map = concepts(docs, options)
      # The version names everything the cached build depends on: the CONTENT
      # of the payload — docs plus both widenings, with `generated_at`
      # deliberately left out — and the INDEX IMPLEMENTATION, because the
      # serialized index assets/js/search-worker.js keeps in IndexedDB is also
      # shaped by the lunr build and the worker's fields, boosts and body join.
      # A rebuild that changes none of that keeps the same version, so a
      # redeploy never invalidates a warm cache; a template upgrade that
      # touches lunr or the worker retires every cached build on its own.
      version = Digest::SHA256.hexdigest(
        JSON.generate([docs, synonym_map, concept_map]) + implementation_fingerprint(site)
      )[0, 16]
      payload = {
        generated_at: Time.now.utc.iso8601,
        version: version,
        synonyms: synonym_map,
        concepts: concept_map,
        docs: docs
      }
      # Stamped into the site config so _includes/results-header.html can hand
      # both to assets/js/search.js as data attributes: the version lets the
      # worker answer from its cache without fetching, and the entry count is
      # the build-time half of the "is full search heavy here" decision.
      site.config["search_index"] = {
        "version" => version,
        "entries" => docs.count { |doc| doc[:kind] == "entry" }
      }
      site.static_files << SearchIndexFile.new(site, payload)
    end

    # The files whose bytes decide what a serialized lunr index looks like,
    # digested. Missing files (a stripped-down test site) contribute nothing,
    # deterministically.
    #
    # @param site [Jekyll::Site]
    # @return [String]
    def implementation_fingerprint(site)
      %w[lunr.min.js search-worker.js].map do |name|
        path = site.in_source_dir("assets", "js", name)
        File.file?(path) ? Digest::SHA256.file(path).hexdigest : ""
      end.join
    end

    # A field value as the words a reader could type for it.
    #
    # A field whose type stores structured values — labelled links, a gallery,
    # a contact — holds an array of hashes, and joining those straight into the
    # index writes Ruby's `{"label"=>"…", "url"=>"…"}` into the searchable text:
    # the reader's word is in there, wrapped in punctuation lunr will not match,
    # beside an address nobody types. So a hash contributes its VALUES, and a
    # value that is a URL, a mailto or a site path contributes nothing.
    #
    # Nothing here names a field or a type: it is the shape of the value that
    # decides, so a schema that grows a `{org, url, email, note}` field indexes
    # the org and the note the day it is added.
    #
    # A scalar is indexed as it stands, URL or not — a `url` field marked
    # `search: true` is the reader asking for exactly that.
    #
    # @param value [Object] one field's front matter value
    # @param nested [Boolean] true once inside a hash, where addresses are noise
    # @return [Array<String>]
    def field_text(value, nested: false)
      case value
      when Hash then value.values.flat_map { |inner| field_text(inner, nested: true) }
      when Array then value.flat_map { |inner| field_text(inner, nested: nested) }
      when nil then []
      else
        text = value.to_s.strip
        text.empty? || (nested && text.match?(ADDRESS)) ? [] : [text]
      end
    end

    # A URL, a scheme-relative URL, a site-absolute path, a bare host, or a
    # bare email.
    #
    # A scheme counts only with its `//`, or as one of the two addresses that
    # never carry one. A bare `word:` is prose, not a scheme: "Guidance: redact
    # PII first" and "Contact: Jane Doe" are exactly the words this flattening
    # exists to index, and reading them as URIs would drop them silently. An
    # email usually arrives without its `mailto:`, so a value that is nothing
    # but `name@host` is an address too — the same shape the submission forms
    # and check_front_matter.rb accept, so every address they let in stays out
    # here — while prose that merely contains an `@` keeps its words.
    ADDRESS = %r{\A(?:[a-z][a-z0-9+.\-]*://|mailto:|tel:|//|/|\.{1,2}/|www\.|\S+@\S+\z)}i

    # `_data/search.yml`'s `synonyms`, normalised to lowercase and made
    # bidirectional, so `assets/js/search.js` can expand a query without
    # knowing which side of the pair the reader typed. A term never expands to
    # itself, and empties are dropped so the JSON stays small.
    #
    # @param site [Jekyll::Site]
    # @return [Hash{String => Array<String>}] term => the other terms to try
    def synonyms(site)
      raw = site.data.dig("search", "synonyms")
      return {} unless raw.is_a?(Hash)

      pairs = Hash.new { |h, k| h[k] = [] }
      raw.each do |term, others|
        head = term.to_s.downcase.strip
        next if head.empty?

        Array(others).flatten.compact.each do |other|
          tail = other.to_s.downcase.strip
          next if tail.empty? || tail == head

          pairs[head] << tail
          pairs[tail] << head
        end
      end
      pairs.transform_values { |list| list.uniq.sort }
    end

    # The write-up (the schema's `markdown` body field) split into its `##`
    # sections, so a body hit can say which section it came from and link to it.
    # Text before the first heading becomes a section with no heading.
    #
    # @param page [Jekyll::Page] an entry page, read before Liquid rendering
    # @param cap [Integer] maximum total characters of prose, 0 for unlimited
    # @return [Array<Hash>] [{h: heading, a: anchor, t: text}, …]
    def body_sections(page, cap)
      raw = page.content.to_s
      return [] if raw.strip.empty?

      # Fenced code goes first: a `##` inside a fence is a comment, not a heading.
      raw = raw.gsub(/```.*?```/m, " ")
      # String#split with a capture group yields [preamble, heading, text, …].
      parts = raw.split(/^\#\#[ \t]+(.+?)[ \t]*$/)
      preamble = parts.shift

      chunks = [[nil, preamble]] + parts.each_slice(2).map { |heading, text| [heading, text.to_s] }
      used = 0
      anchors = Hash.new(-1)
      sections = []
      chunks.each do |heading, text|
        body = normalize(text)
        next if body.empty? && heading.nil?

        if cap.positive?
          break if used >= cap

          body = body[0, cap - used].to_s
          used += body.length
        end
        title = heading && normalize(heading)
        sections << { h: title, a: title && anchor(title, anchors), t: body }
      end
      sections
    end

    # Plain words: Liquid tags, HTML and Markdown punctuation dropped.
    # @param text [String, nil]
    # @return [String]
    def normalize(text)
      text.to_s
          .gsub(/\{%.*?%\}/m, " ")       # Liquid tags
          .gsub(/\{\{.*?\}\}/m, " ")     # Liquid output
          .gsub(/<[^>]+>/, " ")          # inline HTML
          .gsub(/[#*_`>\[\]()|!]+/, " ") # Markdown punctuation
          .gsub(/\s+/, " ")
          .strip
    end

    # The `id` kramdown puts on a heading, so the anchor a search hit links to
    # is the one _includes/toc.html already links to. This mirrors
    # Kramdown::Converter::Base#basic_generate_id plus its duplicate suffixes;
    # the ids are read out of the rendered HTML there and cannot be reused here,
    # because the index is built before pages are rendered.
    # @param heading [String] heading text
    # @param seen [Hash] per-page counter of ids already handed out
    # @return [String]
    def anchor(heading, seen)
      id = heading.sub(/\A[^a-zA-Z]+/, "").gsub(/[^a-zA-Z0-9 -]/, "").tr(" ", "-").downcase
      id = "section" if id.empty?
      seen[id] += 1
      seen[id].zero? ? id : "#{id}-#{seen[id]}"
    end

    # ------------------------------------------------------------- concepts

    # Query-side concept expansion, derived from this catalog's own prose.
    #
    # `_data/search.yml`'s `concepts` block tunes it; every value below is the
    # default, and `enabled: false` turns the whole thing off (the payload then
    # carries no terms and assets/js/search.js behaves exactly as it did before
    # the block existed).
    CONCEPT_DEFAULTS = {
      # -- corpus pass
      "enabled" => true,
      "min_entries" => 12,      # below this the statistics are noise, not signal
      "min_df" => 2,            # a term one entry uses relates to nothing
      "max_df_ratio" => 0.5,    # a term over half the catalog uses says nothing
      "terms_per_entry" => 40,  # bounds the O(terms²) pairing pass
      "min_pairs" => 2,         # two entries agreeing is the least evidence there is
      "min_score" => 0.35,      # normalised PMI, -1..1
      "max_related" => 6,       # neighbours kept per term
      "max_terms" => 1500,      # head terms kept, most-used first
      # -- query side, read by assets/js/search.js
      "weight" => 0.9,
      "max_expansions" => 4
    }.freeze

    # How much each field's words count towards what an entry is *about*. A
    # title word is a claim about the whole entry; a body word is a mention.
    CONCEPT_FIELD_WEIGHTS = { title: 3, summary: 2, facets: 2, body: 1 }.freeze

    # Words, lowercased. No stop-word list: a word this catalog uses everywhere
    # is dropped by `max_df_ratio` on the evidence of the catalog itself, which
    # is the same reason "public" is noise here and signal somewhere else.
    #
    # @param text [String, nil]
    # @return [Array<String>]
    def concept_tokens(text)
      text.to_s.downcase.scan(/[[:alpha:]][[:alnum:]]*/).select { |word| word.length >= 3 }
    end

    # `_data/search.yml`'s `concepts` block over CONCEPT_DEFAULTS.
    # @param site [Jekyll::Site]
    # @return [Hash]
    def concept_options(site)
      raw = site.data.dig("search", "concepts")
      return CONCEPT_DEFAULTS.dup unless raw.is_a?(Hash)

      CONCEPT_DEFAULTS.merge(raw.slice(*CONCEPT_DEFAULTS.keys))
    end

    # The concept layer for the search payload.
    #
    # Term relatedness is read off the catalog rather than configured: two words
    # are related when they keep turning up in the same entries and are not
    # simply both common. That is normalised pointwise mutual information over
    # entry-level co-occurrence, which is deterministic (same catalog, same map)
    # and needs nothing at runtime that lunr does not already have.
    #
    # Only each entry's most distinctive words are paired — `terms_per_entry`
    # by tf-idf — because the pairing pass is quadratic in that number and a
    # thousand entries of long-form prose is the size this has to survive.
    #
    # @param docs [Array<Hash>] the docs already built for the payload
    # @param options [Hash] concept_options
    # @return [Hash] {weight:, max_expansions:, terms: {String => Array<String>}}
    def concepts(docs, options)
      terms = concept_terms(docs, options)
      {
        weight: options["weight"].to_f,
        max_expansions: options["max_expansions"].to_i,
        terms: terms
      }
    end

    # @param docs [Array<Hash>]
    # @param options [Hash]
    # @return [Hash{String => Array<String>}] term => related terms, best first
    def concept_terms(docs, options)
      return {} unless options["enabled"]
      return {} if docs.length < options["min_entries"].to_i

      counts = docs.map { |doc| concept_counts(doc) }
      total = docs.length.to_f
      document_frequency = Hash.new(0)
      counts.each { |doc| doc.each_key { |term| document_frequency[term] += 1 } }
      # The most entries a word may appear in and still be about any of them.
      # Rounded DOWN, so a word over the configured share is out at every
      # catalog size: at 13 entries and 0.5, seven of them is 54%, not half.
      # The epsilon only keeps a ratio that lands exactly on an entry count
      # (0.3 of ten) from being lost to binary floating point.
      ceiling = ((total * options["max_df_ratio"].to_f) + 1e-9).floor
      floor = options["min_df"].to_i

      keep = options["terms_per_entry"].to_i
      salient = counts.map do |doc|
        weighted = doc.filter_map do |term, count|
          frequency = document_frequency[term]
          next unless frequency >= floor && frequency <= ceiling

          [term, count * Math.log(total / frequency)]
        end
        weighted.sort_by { |term, weight| [-weight, term] }.first(keep).map(&:first)
      end

      kept = Hash.new(0)
      salient.each { |terms| terms.each { |term| kept[term] += 1 } }
      related = related_terms(salient, kept, total, options)

      related.sort_by { |term, _| [-kept[term], term] }
             .first(options["max_terms"].to_i)
             .sort_by(&:first)
             .to_h
    end

    # One entry's weighted word counts across every indexed field.
    # @param doc [Hash] a payload doc
    # @return [Hash{String => Integer}]
    def concept_counts(doc)
      counts = Hash.new(0)
      CONCEPT_FIELD_WEIGHTS.each do |field, weight|
        text = field == :body ? Array(doc[:sections]).map { |section| section[:t] }.join(" ") : doc[field]
        concept_tokens(text).each { |word| counts[word] += weight }
      end
      counts
    end

    # Normalised PMI over entry-level co-occurrence, kept where it is strong
    # enough and backed by enough entries to be more than a coincidence.
    #
    # @param salient [Array<Array<String>>] each entry's distinctive terms
    # @param kept [Hash{String => Integer}] how many entries each term survived in
    # @param total [Float] entry count
    # @param options [Hash]
    # @return [Hash{String => Array<String>}]
    def related_terms(salient, kept, total, options)
      pairs = Hash.new(0)
      salient.each do |terms|
        sorted = terms.sort
        sorted.each_with_index do |left, at|
          ((at + 1)...sorted.length).each { |other| pairs[[left, sorted[other]]] += 1 }
        end
      end

      minimum = options["min_pairs"].to_i
      threshold = options["min_score"].to_f
      scored = Hash.new { |store, key| store[key] = [] }
      pairs.each do |(left, right), both|
        next if both < minimum

        joint = both / total
        next if joint >= 1.0

        score = Math.log(joint / ((kept[left] / total) * (kept[right] / total))) / -Math.log(joint)
        next if score < threshold

        scored[left] << [right, score]
        scored[right] << [left, score]
      end

      limit = options["max_related"].to_i
      scored.transform_values do |list|
        list.sort_by { |term, score| [-score, term] }.first(limit).map(&:first)
      end
    end
  end
end
