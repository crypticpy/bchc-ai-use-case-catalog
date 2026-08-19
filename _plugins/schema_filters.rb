# frozen_string_literal: true

require "date"

# Liquid filters that resolve `_data/schema.yml` presentation hints in one place,
# so layouts and includes never re-implement the rules (see docs/content-model.md).
#
# All filters are pure and nil-safe: they accept the raw schema `fields` array
# (or a single field hash) and return plain arrays/hashes for Liquid.
#
# Registered globally via `Liquid::Template.register_filter` below, so every
# layout/include can call these as Liquid filters (e.g. `| facet_fields`) from
# the moment Jekyll starts rendering templates at build time — there is no
# per-page opt-in. Input: schema data already loaded into `site.data.schema`
# (parsed from `_data/schema.yml`) plus whatever field/value Liquid passes in.
# Output: plain arrays/hashes/strings Liquid can iterate or print directly.
module CatalogTemplate
  module SchemaFilters
    DEFAULT_WEIGHT = 5
    # Type -> default card slot when a field says `card: true`.
    CARD_DEFAULTS = {
      "select" => "badge",
      "text" => "meta",
      "list" => "chip",
      "multiselect" => "chip"
    }.freeze
    # `fact` is the odd one out: it is the ENTRY PAGE fact strip and nothing
    # else. The card's signal strip is capped at four glyphs, so a fifth
    # `card: icon` field would silently push an existing one behind a "+n" on
    # every card; a fact that only pays off in a governance conversation
    # (cost, approvals) belongs on the page, not in that budget.
    CARD_SLOTS = %w[badge chip meta icon line fact].freeze
    # Where a group renders on the entry page.
    GROUP_PLACEMENTS = %w[main rail].freeze
    GROUP_PLACEMENT_DEFAULT = "main"
    # Reserved date keys that count as "someone looked at this", strongest first
    # (see `verification`). Not a schema field list — these are engine keys.
    VERIFICATION_KEYS = %w[verified updated published].freeze
    # A year: long enough that a maintainer is not chased over a quiet quarter,
    # short enough that a vendor acquisition or a staff departure is caught.
    # Overridable per site with `catalog.verify_after_days` in _data/site.yml.
    VERIFY_AFTER_DAYS = 365

    # Stable sort by `weight` (default 5). Fields without weight keep their
    # relative schema order among equals.
    # @param fields [Array<Hash>]
    # @return [Array<Hash>]
    # @example
    #   {{ site.data.schema.fields | sort_by_weight }}
    def sort_by_weight(fields)
      Array(fields).each_with_index.sort_by { |f, i| [(f["weight"] || DEFAULT_WEIGHT).to_i, i] }.map(&:first)
    end

    # Fields shown in the filter panel.
    # @param fields [Array<Hash>] schema `fields`
    # @return [Array<Hash>] fields with `facet: true`, weight-sorted
    # @example
    #   {{ site.data.schema.fields | facet_fields }}
    def facet_fields(fields)
      sort_by_weight(Array(fields).select { |f| f["facet"] })
    end

    # Fields shown in submission forms (everything except `form: false`).
    # @param fields [Array<Hash>] schema `fields`
    # @return [Array<Hash>] weight-sorted fields
    # @example
    #   {{ site.data.schema.fields | form_fields }}
    def form_fields(fields)
      sort_by_weight(Array(fields).reject { |f| f["form"] == false })
    end

    # Fields whose `group` equals `key` (fields with no group belong to "other").
    # @param fields [Array<Hash>] schema `fields`
    # @param key [String] group key to match
    # @return [Array<Hash>] weight-sorted fields in that group
    # @example
    #   {{ site.data.schema.fields | fields_in_group: "impact" }}
    def fields_in_group(fields, key)
      key = key.to_s
      sort_by_weight(Array(fields).select { |f| (f["group"] || "other").to_s == key })
    end

    # Group keys actually used by the given fields, in schema `groups` order,
    # followed by "other" when needed. Returns an array of group hashes.
    # @param groups [Array<Hash>] schema-level `groups`
    # @param fields [Array<Hash>] the fields being laid out (e.g. facet_fields)
    # @return [Array<Hash>] group hashes, each at least {"key", "title"}
    # @example
    #   {{ site.data.schema.groups | groups_for: fields }}
    def groups_for(groups, fields)
      used = Array(fields).map { |f| (f["group"] || "other").to_s }.uniq
      ordered = Array(groups).select { |g| used.include?(g["key"].to_s) }
      known = ordered.map { |g| g["key"].to_s }
      leftovers = used - known
      leftovers.each { |k| ordered << { "key" => k, "title" => (k == "other" ? "More" : k.tr("_-", "  ").capitalize) } }
      ordered
    end

    # Groups whose `placement` matches, in the order given. `placement` is
    # optional on a group and anything unrecognised falls back to "main", so a
    # schema that never mentions it keeps every group in the page body.
    # @param groups [Array<Hash>] usually the output of `groups_for`
    # @param placement [String] "rail" | "main"
    # @return [Array<Hash>] the subset of `groups` matching `placement`
    # @example
    #   {{ groups | groups_placed: "rail" }}
    def groups_placed(groups, placement)
      want = placement.to_s.strip
      want = GROUP_PLACEMENT_DEFAULT unless GROUP_PLACEMENTS.include?(want)
      Array(groups).select do |g|
        actual = g.is_a?(Hash) ? g["placement"].to_s.strip : ""
        actual = GROUP_PLACEMENT_DEFAULT unless GROUP_PLACEMENTS.include?(actual)
        actual == want
      end
    end

    # Effective card slot for a field: "badge" | "chip" | "meta" | "icon" | "line" | nil.
    # @param field [Hash] a single schema field
    # @return [String, nil] the resolved slot name, or nil when `card` is falsy
    # @example
    #   {{ field | card_slot }}
    def card_slot(field)
      return nil unless field.is_a?(Hash)

      card = field["card"]
      return nil if card.nil? || card == false
      return CARD_DEFAULTS[field["type"].to_s] if card == true

      CARD_SLOTS.include?(card.to_s) ? card.to_s : nil
    end

    # Fields whose effective card slot is `slot`, sorted by weight.
    # @param fields [Array<Hash>] schema `fields`
    # @param slot [String] one of CARD_SLOTS
    # @return [Array<Hash>] matching, weight-sorted fields
    # @example
    #   {{ site.data.schema.fields | card_fields: "badge" }}
    def card_fields(fields, slot)
      sort_by_weight(Array(fields).select { |f| card_slot(f) == slot.to_s })
    end

    # Resolved presentation for one option value:
    #   { "value", "short", "icon", "tone", "description" } with defaults filled
    #   (short = value, icon = field icon, tone = "neutral").
    # @param field [Hash] the schema field the value belongs to
    # @param value [String] the raw option value
    # @return [Hash] {"value", "short", "icon", "tone", "description"}
    # @example
    #   {{ field | option_meta: entry[field.key] }}
    def option_meta(field, value)
      field = {} unless field.is_a?(Hash)
      value = value.to_s
      meta = (field["option_meta"] || {})[value]
      meta = {} unless meta.is_a?(Hash)
      {
        "value" => value,
        "short" => (meta["short"].to_s.strip.empty? ? value : meta["short"].to_s),
        "icon" => (meta["icon"].to_s.strip.empty? ? field["icon"].to_s : meta["icon"].to_s),
        "tone" => (meta["tone"].to_s.strip.empty? ? "neutral" : meta["tone"].to_s),
        "description" => meta["description"].to_s
      }
    end

    # Short label for a value (falls back to the value itself).
    # @param field [Hash] the schema field the value belongs to
    # @param value [String] the raw option value
    # @return [String] the option's `short` label, or `value` when unset
    # @example
    #   {{ field | option_short: entry[field.key] }}
    def option_short(field, value)
      option_meta(field, value)["short"]
    end

    # Normalise a scalar-or-list front matter value into an array of strings.
    # @param value [Object] a scalar, array, or nil field value
    # @return [Array<String>] non-blank string values
    # @example
    #   {{ entry.tags | as_list }}
    def as_list(value)
      Array(value).flatten.compact.map(&:to_s).reject { |v| v.strip.empty? }
    end

    # Normalise an `images` field item (string or {src, alt}) to a hash.
    # @param item [String, Hash] one entry of an `images` field's array value
    # @param fallback_alt [String] alt text to use when the item has none
    # @return [Hash] {"src", "alt"}
    # @example
    #   {{ img | image_item: entry.title }}
    def image_item(item, fallback_alt = "")
      if item.is_a?(Hash)
        { "src" => item["src"].to_s, "alt" => (item["alt"].to_s.strip.empty? ? fallback_alt.to_s : item["alt"].to_s) }
      else
        { "src" => item.to_s, "alt" => fallback_alt.to_s }
      end
    end

    # First image src of an `images` value, or "" when none.
    # @param value [Array, nil] an `images` field's value
    # @return [String] the first image's src, or "" when there isn't one
    # @example
    #   {{ entry.images | first_image }}
    def first_image(value)
      first = Array(value).first
      first.is_a?(Hash) ? first["src"].to_s : first.to_s
    end

    # How long ago an entry was last confirmed accurate, and whether that is
    # long enough to say so.
    #
    # "Last confirmed" is the NEWEST of three reserved keys, because they answer
    # progressively weaker versions of the same question:
    #   verified   a maintainer re-checked the facts with the contact
    #   updated    someone edited the text
    #   published  nothing at all has happened since it landed
    # An entry with no `verified` is therefore not treated as unverified — it is
    # treated as last confirmed on the day it was last touched, which is the
    # honest reading and means a fresh fork shows no notices at all.
    #
    # Pure: the reference instant is passed in (`site.time`) rather than read
    # from the clock, so a build is reproducible and the filter is testable.
    #
    # @param entry [#[]] the entry page/document (a plain Hash in tests)
    # @param now [Time, Date, String] reference instant, normally `site.time`
    # @param after_days [Integer] age at which the entry counts as stale
    # @param keys [String, nil] comma-separated front matter keys to consider
    # @return [Hash] {"key", "date", "days", "stale"}; "" / -1 / false when the
    #   entry carries none of the keys
    # @example
    #   {%- assign v = page | verification: site.time, 365 -%}
    #   {%- if v.stale %}Last {{ v.key }} {{ v.date | date: '%B %Y' }}{% endif -%}
    def verification(entry, now, after_days = VERIFY_AFTER_DAYS, keys = nil)
      unknown = { "key" => "", "date" => "", "days" => -1, "stale" => false }
      return unknown unless entry.respond_to?(:[])

      names = keys.to_s.split(",").map(&:strip).reject(&:empty?)
      names = VERIFICATION_KEYS if names.empty?

      best_key = nil
      best = nil
      names.each do |name|
        parsed = iso_date(entry[name])
        next if parsed.nil? || (best && parsed <= best)

        best = parsed
        best_key = name
      end
      return unknown if best.nil?

      today = iso_date(now) || Date.today
      limit = after_days.to_i
      limit = VERIFY_AFTER_DAYS unless limit.positive?
      days = (today - best).to_i
      { "key" => best_key, "date" => best.strftime("%Y-%m-%d"), "days" => days, "stale" => days > limit }
    end

    # Whether an entry carries the schema's "deprecated" review status.
    #
    # Reads `entry.status_key` and `entry.deprecated_value` from the schema, so
    # no template names the field; a schema without them never deprecates
    # anything. Deprecated entries stay in the catalog and the search index —
    # this is what lets the templates show a notice, sort them last and keep
    # them out of the featured carousel (see docs/content-model.md).
    #
    # @param entry [#[]] the entry page/document (a plain Hash in tests)
    # @param schema [Hash] `site.data.schema`
    # @return [Boolean]
    # @example
    #   {%- if page | deprecated_entry: site.data.schema %}…{% endif -%}
    def deprecated_entry(entry, schema)
      settings = schema.respond_to?(:[]) ? schema["entry"] : nil
      return false unless settings.respond_to?(:[]) && entry.respond_to?(:[])

      key = settings["status_key"].to_s
      value = settings["deprecated_value"].to_s
      return false if key.empty? || value.empty?

      entry[key].to_s == value
    end

    # The entries that are not deprecated (see `deprecated_entry`), in order.
    # @param entries [Array<#[]>]
    # @param schema [Hash] `site.data.schema`
    # @return [Array]
    # @example
    #   {%- assign live = entries | live_entries: site.data.schema -%}
    def live_entries(entries, schema)
      Array(entries).reject { |entry| deprecated_entry(entry, schema) }
    end

    # The deprecated entries only — the complement of `live_entries`, so a
    # caller can put them after everything else without a second pass.
    # @param entries [Array<#[]>]
    # @param schema [Hash] `site.data.schema`
    # @return [Array]
    def deprecated_entries(entries, schema)
      Array(entries).select { |entry| deprecated_entry(entry, schema) }
    end

    private

    # Coerce a front matter date value to a Date. Anything that is not a real
    # date (a typo, a blank, a number) is nil rather than an exception — a
    # malformed date must not take the whole build down, and
    # scripts/check_front_matter.rb is what fails the pull request over it.
    # @param value [Object]
    # @return [Date, nil]
    def iso_date(value)
      return nil if value.nil?
      return value.to_date if value.respond_to?(:to_date)

      text = value.to_s.strip
      return nil if text.empty?

      Date.iso8601(text)
    rescue ArgumentError, TypeError, Date::Error
      nil
    end
  end
end

Liquid::Template.register_filter(CatalogTemplate::SchemaFilters)
