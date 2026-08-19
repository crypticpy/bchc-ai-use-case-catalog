# frozen_string_literal: true

# Derived catalog data that Liquid should not be asked to compute.
#
# Two outputs, both consumed by templates:
#
#   site.data["entry_pages"]  every `layout: entry` page, in site.pages order —
#                             a drop-in for `site.pages | where: 'layout','entry'`,
#                             which allocates and scans the whole page array on
#                             every call (once per catalog page, per layout, per
#                             include).
#   page.data["related"]      for each entry, the ranked neighbours it shares
#                             facet values with, with the reason for each match.
#
# Relatedness is IDF-weighted rather than a raw count of shared values. In a
# catalog with required low-cardinality fields the raw count scores noise: on
# the ten sample entries `readiness = "Human review built in"` appears on 9 and
# `ai_role = "AI is part of the solution"` on 8, so every pair collects those
# two free points and the ranking ends up decided by whichever entry carries the
# most facet values overall. Weighting each shared value by log(N / df) makes a
# value that appears on every entry contribute exactly 0, which is the right
# answer and falls out for free. The field's schema `weight` (1..9, default 5,
# lower = more important, as everywhere else in the schema) scales its
# contribution, so "organization similarity matters less than area similarity"
# is expressible with a knob docs/content-model.md already documents.
#
# Runs as a Jekyll::Generator with `priority :high` — after _plugins/modules.rb's
# `:site, :post_read` hook has dropped pages belonging to disabled modules, and
# before `priority :low` generators (search_index.rb, catalog_feed.rb) that read
# `site.data["entry_pages"]`.
module CatalogTemplate
  class CatalogIndexGenerator < Jekyll::Generator
    safe true
    priority :high

    # How many neighbours are precomputed per entry. The include decides how
    # many it shows (`limit`); anything beyond this is never reachable.
    RELATED_MAX = 8

    # Schema `weight` that scales a field's contribution by exactly 1.0. Weight
    # 1 (most important) scales by 1.8, weight 9 by 0.2 — the same direction as
    # the card slots and the fact strip, where lower weight wins.
    NEUTRAL_WEIGHT = 5.0
    WEIGHT_SPAN = 10.0

    # @param site [Jekyll::Site]
    # @return [void]
    def generate(site)
      entries = site.pages.select { |page| page.data["layout"] == "entry" }
      expose_entry_pages(site, entries)
      return if entries.empty?

      facets = facet_fields(site)
      postings = build_postings(entries, facets)
      attach_related(entries, facets, postings)
    end

    private

    # Publishes the entry list as `site.data["entry_pages"]`, unless the site
    # already has a `_data/entry_pages.yml` of its own — clobbering a user's
    # data file would be a silent, very confusing failure.
    # @param site [Jekyll::Site]
    # @param entries [Array<Jekyll::Page>]
    # @return [void]
    def expose_entry_pages(site, entries)
      if site.data.key?("entry_pages")
        Jekyll.logger.warn "Catalog:", "site.data.entry_pages already exists (a _data/entry_pages.yml?); " \
                                       "leaving it alone. Templates expecting the generated entry list will not see it."
        return
      end

      site.data["entry_pages"] = entries
    end

    # Facet fields, each with the values needed to score and explain a match.
    # @param site [Jekyll::Site]
    # @return [Array<Hash>] {"key", "label", "weight" (ratio), "option_meta"}
    def facet_fields(site)
      Array(site.data.dig("schema", "fields")).select { |f| f["facet"] }.map do |f|
        {
          "key" => f["key"].to_s,
          "label" => (f["label"] || f["key"]).to_s,
          "weight" => (WEIGHT_SPAN - (f["weight"] || NEUTRAL_WEIGHT).to_f.clamp(1.0, 9.0)) / NEUTRAL_WEIGHT,
          "option_meta" => f["option_meta"] || {}
        }
      end
    end

    # Inverted index: "<field key>\0<value>" => [entry index, ...]. One pass
    # over the entries, so document frequency is just the posting list's size.
    # @param entries [Array<Jekyll::Page>]
    # @param facets [Array<Hash>]
    # @return [Hash{String => Array<Integer>}]
    def build_postings(entries, facets)
      postings = Hash.new { |h, k| h[k] = [] }
      entries.each_with_index do |page, i|
        facets.each do |field|
          values(page, field["key"]).each { |value| postings[posting_key(field["key"], value)] << i }
        end
      end
      postings
    end

    # Sets `page.data["related"]` on every entry.
    # @param entries [Array<Jekyll::Page>]
    # @param facets [Array<Hash>]
    # @param postings [Hash{String => Array<Integer>}]
    # @return [void]
    def attach_related(entries, facets, postings)
      total = entries.size.to_f
      by_recency = recency_order(entries)

      entries.each_with_index do |page, i|
        scores = Hash.new(0.0)
        shared = Hash.new { |h, k| h[k] = [] }

        facets.each do |field|
          values(page, field["key"]).each do |value|
            others = postings[posting_key(field["key"], value)]
            weight = Math.log(total / others.size) * field["weight"]
            # A value carried by every entry (or a field weighted to nothing)
            # says nothing about similarity — skip it rather than scoring it.
            next unless weight.positive?

            others.each do |j|
              next if j == i

              scores[j] += weight
              shared[j] << [weight, field, value]
            end
          end
        end

        ranked = scores.keys.sort_by { |j| [-scores[j], entries[j].url.to_s] }
        ranked.concat(by_recency.reject { |j| j == i || scores.key?(j) })
        page.data["related"] = ranked.first(RELATED_MAX).map do |j|
          related_item(entries[j], scores[j], shared[j])
        end
      end
    end

    # Entry indexes newest first; ties broken on url so the top-up is stable
    # across builds and platforms.
    # @param entries [Array<Jekyll::Page>]
    # @return [Array<Integer>]
    def recency_order(entries)
      entries.each_index.sort_by { |i| [entries[i].data["published"].to_s, entries[i].url.to_s] }.reverse
    end

    # One row of `page.data["related"]`.
    # @param page [Jekyll::Page] the neighbour
    # @param score [Float, nil] nil for a recency top-up
    # @param shared [Array<Array>] [weight, field, value] triples, unsorted
    # @return [Hash]
    def related_item(page, score, shared)
      {
        "url" => page.url,
        "title" => page.data["title"],
        "score" => (score || 0.0).round(4),
        # The page itself, so the include can render the same meta line the
        # catalog cards do without a second `where` scan to find it again.
        "page" => page,
        "shared" => Array(shared).sort_by { |weight, field, value| [-weight, field["key"], value] }
                                 .map { |weight, field, value| shared_value(field, value, weight) }
      }
    end

    # @param field [Hash] a facet_fields entry
    # @param value [String] the shared value
    # @param weight [Float] its IDF contribution
    # @return [Hash] {"key" (hyphenated, as the filter URL uses), "label", "value", "short", "slug", "weight"}
    def shared_value(field, value, weight)
      short = field["option_meta"].dig(value, "short")
      {
        "key" => field["key"].tr("_", "-"),
        "label" => field["label"],
        "value" => value,
        "short" => (short && !short.to_s.empty? ? short.to_s : value),
        "slug" => Jekyll::Utils.slugify(value),
        "weight" => weight.round(4)
      }
    end

    # A field's values as a flat array of non-blank strings, whether the field
    # holds a scalar (text/select) or a list (list/multiselect).
    # @param page [Jekyll::Page]
    # @param key [String]
    # @return [Array<String>]
    def values(page, key)
      Array(page.data[key]).flatten.compact.map { |v| v.to_s.strip }.reject(&:empty?)
    end

    # @param key [String] field key
    # @param value [String]
    # @return [String] posting-list key ("\0" cannot occur in either half)
    def posting_key(key, value)
      "#{key}\0#{value}"
    end
  end
end

# `jekyll-sitemap` reads `page.last_modified_at` for <lastmod> and no entry sets
# it, so every catalog URL shipped as a bare <loc> even though entries carry
# `published`/`updated`. `:pages, :post_init` fires as each page is read, before
# any generator, so the value is in place by the time the sitemap is built.
Jekyll::Hooks.register :pages, :post_init do |page|
  next unless page.data["layout"] == "entry"

  stamp = page.data["updated"] || page.data["published"]
  page.data["last_modified_at"] ||= stamp if stamp
end
