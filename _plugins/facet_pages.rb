# frozen_string_literal: true

require "set"

# Crawlable browse pages for the catalog: one real page per facet value, plus
# the index that ties them together.
#
# Every facet combination otherwise lives behind a query string on one
# JS-filtered page — `/catalog/?organization=metro-north` serves a crawler the
# same ten cards as `/catalog/`. So there is no page to rank for "AI use cases
# <organization>", nothing to link from a newsletter or a conference slide, and
# no browse path at all without JavaScript. On a static site the fix is cheap:
# Jekyll can just generate the pages.
#
# Output:
#   /<entry.path>/<field>/<value>/   a `layout: facet` page per facet value in
#                                    use (field keys are hyphenated, matching
#                                    the filter query parameter, so
#                                    /catalog/ai-types/chat-assistant/ is the
#                                    static twin of /catalog/?ai-types=chat-assistant)
#   site.data["facet_index"]         [{key, label, slug, icon, values: [...]}] —
#                                    what catalog/a-z/index.md renders, and what
#                                    _includes/filter-groups.html tests to decide
#                                    whether a facet has a page to link to
#   site.data["entry_az"]            [{letter, entries: [...]}] for the same page
#
# Which fields take part is data, not code: `_data/search.yml`'s `landing` block
# (enabled / exclude / max_values / min_entries). With no such file every facet
# field is indexed. `max_values` is the guardrail that matters — a free-text
# `list` facet on a large catalog would otherwise turn into thousands of pages.
#
# Runs as a Jekyll::Generator with `priority :low`: after
# `_plugins/catalog_index.rb` (`:high`) has published `site.data["entry_pages"]`,
# and after `_plugins/modules.rb`'s `:site, :post_read` hook has dropped the
# catalog entirely when that module is off — with no entries, nothing here
# generates.
module CatalogTemplate
  class FacetPagesGenerator < Jekyll::Generator
    safe true
    priority :low

    # Defaults for `_data/search.yml`'s `landing` block, used verbatim when the
    # file (or the block) is absent.
    DEFAULTS = {
      "enabled" => true, "exclude" => [], "max_values" => 200, "min_entries" => 1, "max_entries" => 24
    }.freeze

    # Values that begin with anything other than a letter share this bucket in
    # the A–Z directory, the way a phone book does.
    OTHER_LETTER = "#"

    # @param site [Jekyll::Site]
    # @return [void]
    def generate(site)
      entries = entry_pages(site)
      site.data["facet_index"] = []
      site.data["entry_az"] = alphabetize(entries)
      return if entries.empty?

      base = "/#{(site.data.dig('schema', 'entry', 'path') || 'catalog')}"
      taken = site.pages.map { |page| page.url.to_s }.to_set
      config = DEFAULTS.merge(site.data.dig("search", "landing") || {})

      if config["enabled"]
        site.data["facet_index"] = fields(site, config).filter_map do |field|
          index_field(site, field, entries, config, base, taken)
        end
      end
      add_directory(site, base, taken)
    end

    private

    # Entry pages in the catalog's own display order (newest first by default),
    # so every generated page lists them the way `/catalog/` does.
    # @param site [Jekyll::Site]
    # @return [Array<Jekyll::Page>]
    def entry_pages(site)
      pages = site.data["entry_pages"]
      pages = site.pages.select { |page| page.data["layout"] == "entry" } unless pages.is_a?(Array)
      key = (site.data.dig("schema", "entry", "sort") || "published").to_s
      sorted = pages.sort_by { |page| [page.data[key].to_s, page.url.to_s] }
      site.data.dig("schema", "entry", "sort_order").to_s == "asc" ? sorted : sorted.reverse
    end

    # The facet fields that take part, in schema order.
    # @param site [Jekyll::Site]
    # @param config [Hash] the resolved `landing` block
    # @return [Array<Hash>] schema field definitions
    def fields(site, config)
      excluded = Array(config["exclude"]).map(&:to_s)
      Array(site.data.dig("schema", "fields"))
        .select { |field| field["facet"] && !excluded.include?(field["key"].to_s) }
    end

    # Generates every page for one field and returns its index row.
    # @return [Hash, nil] nil when the field is skipped
    def index_field(site, field, entries, config, base, taken)
      key = field["key"].to_s
      buckets = bucket(entries, key, config["min_entries"].to_i)
      return nil if buckets.empty?

      if buckets.size > config["max_values"].to_i
        Jekyll.logger.info "Facet pages:", "skipping #{key} — #{buckets.size} distinct values " \
                                           "(over search.landing.max_values)."
        return nil
      end

      slug = key.tr("_", "-")
      cap = [config["max_entries"].to_i, 1].max
      values = buckets.map do |value, matched|
        row = value_row(field, slug, value, matched, base)
        add_page(site, field, row, matched.first(cap), taken)
        row
      end

      {
        "key" => key,
        "slug" => slug,
        "label" => (field["label"] || key).to_s,
        "icon" => field["icon"],
        "values" => values
      }
    end

    # Distinct values of `key` across the entries, each with the entries that
    # carry it, in alphabetical order — these feed an A–Z directory, where the
    # schema's editorial option order would be the wrong answer.
    # @return [Array<Array(String, Array<Jekyll::Page>)>]
    def bucket(entries, key, min_entries)
      found = Hash.new { |hash, value| hash[value] = [] }
      entries.each { |page| values(page, key).each { |value| found[value] << page } }
      found.reject! { |_, matched| matched.size < [min_entries, 1].max }
      found.sort_by { |value, _| value.downcase }
    end

    # One row of a field's `facet_index` entry — also the front matter of the
    # page it describes.
    # @return [Hash]
    def value_row(field, field_slug, value, matched, base)
      meta = (field["option_meta"] || {})[value] || {}
      slug = Jekyll::Utils.slugify(value)
      {
        "value" => value,
        "short" => (meta["short"].to_s.empty? ? value : meta["short"].to_s),
        "description" => meta["description"].to_s,
        "slug" => slug,
        "count" => matched.size,
        "url" => "#{base}/#{field_slug}/#{slug}/",
        "filter_url" => "#{base}/?#{field_slug}=#{slug}",
        "letter" => letter(value)
      }
    end

    # Adds the generated page for one facet value, unless something already
    # occupies that URL (an entry whose slug collides with a facet slug).
    # @param matched [Array<Jekyll::Page>] the entries to LIST — already capped
    #   at `landing.max_entries`; `row["count"]` is still the true total, and
    #   the page links to the live filter for the rest.
    # @return [void]
    def add_page(site, field, row, matched, taken)
      if taken.include?(row["url"])
        Jekyll.logger.warn "Facet pages:", "#{row['url']} already exists — not generating a facet page there."
        return
      end
      taken << row["url"]

      # `index.html` + `permalink: pretty` makes Jekyll's URL template "/:path/",
      # so the directory alone decides the URL.
      page = Jekyll::PageWithoutAFile.new(site, site.source, row["url"].chomp("/"), "index.html")
      page.content = ""
      page.data.merge!(
        "layout" => "facet",
        # `<title>` and the SEO tag read `title`; the h1 uses `facet_value`, so
        # the page can be called "Chat assistant — Types of AI" in a tab and
        # still say just "Chat assistant" on the page.
        "title" => "#{row['value']} — #{field['label'] || field['key']}",
        "summary" => summary(field, row),
        "facet_field" => field["key"].to_s,
        "facet_label" => (field["label"] || field["key"]).to_s,
        "facet_icon" => field["icon"],
        "facet_value" => row["value"],
        "facet_description" => row["description"],
        "facet_filter_url" => row["filter_url"],
        "facet_entries" => matched,
        "facet_total" => row["count"]
      )
      site.pages << page
    end

    # The meta description and the page's own standfirst: the option's own
    # definition where the schema gives one, then the count.
    # @return [String]
    def summary(field, row)
      noun = row["count"] == 1 ? "entry" : "entries"
      sentence = "#{row['count']} #{noun} tagged #{row['value']} under #{field['label'] || field['key']}."
      row["description"].to_s.empty? ? sentence : "#{row['description']} #{sentence}"
    end

    # The A–Z directory itself, at `<entry.path>/a-z/`. Generated rather than
    # committed as `catalog/a-z/index.md`, for two reasons: the entry path is
    # the schema's to choose, and `scripts/check_front_matter.rb` validates
    # every `<entry.path>/*/index.md` as an entry, which a directory page is not.
    # @return [void]
    def add_directory(site, base, taken)
      url = "#{base}/a-z/"
      return if taken.include?(url)

      page = Jekyll::PageWithoutAFile.new(site, site.source, url.chomp("/"), "index.html")
      page.content = ""
      singular = (site.data.dig("schema", "entry", "singular") || "Entry").to_s.downcase
      page.data.merge!(
        "layout" => "facet-index",
        "title" => "Browse A–Z",
        "summary" => "Every #{singular} by name, and every way they are tagged."
      )
      site.pages << page
    end

    # Entries grouped by the first letter of their title, for the A–Z directory.
    # @param entries [Array<Jekyll::Page>]
    # @return [Array<Hash>] [{"letter" => "A", "entries" => [...]}, …]
    def alphabetize(entries)
      by_title = entries.sort_by { |page| [page.data["title"].to_s.downcase, page.url.to_s] }
      grouped = by_title.group_by { |page| letter(page.data["title"].to_s) }
      # "#" last, letters in order: a phone book, not ASCII order.
      grouped.sort_by { |initial, _| [initial == OTHER_LETTER ? 1 : 0, initial] }
             .map { |initial, pages| { "letter" => initial, "entries" => pages } }
    end

    # @param text [String]
    # @return [String] the uppercase first letter, or "#" for anything else
    def letter(text)
      first = text.to_s.strip[0].to_s.upcase
      first.match?(/[A-Z]/) ? first : OTHER_LETTER
    end

    # A field's values as a flat array of non-blank strings, whether the field
    # holds a scalar (text/select) or a list (list/multiselect).
    # @return [Array<String>]
    def values(page, key)
      Array(page.data[key]).flatten.compact.map { |value| value.to_s.strip }.reject(&:empty?).uniq
    end
  end
end
