# frozen_string_literal: true

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

      baseurl = site.config["baseurl"].to_s.chomp("/")
      docs = []
      site.pages.each do |page|
        case page.data["layout"]
        when "entry"
          docs << {
            id: page.data["slug"] || Jekyll::Utils.slugify(page.data["title"].to_s),
            title: page.data["title"],
            summary: page.data["summary"],
            facets: searchable.map { |k| Array(page.data[k]).flatten.compact.join(" ") }.reject(&:empty?).join(" "),
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

      payload = { generated_at: Time.now.utc.iso8601, synonyms: synonyms(site), docs: docs }
      site.static_files << SearchIndexFile.new(site, payload)
    end

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
  end
end
