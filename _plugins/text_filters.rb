# frozen_string_literal: true

# Liquid filters for schema-driven copy: the templates never hardcode the
# entry noun (`schema.entry.singular` / `plural`), so the small grammar around
# it has to be computed too — "Submit a use case" but "Submit an entry".
module CatalogTemplate
  module TextFilters
    # Prefix a noun with the indefinite article that fits it. The choice is by
    # sound, not spelling: "an entry", "an hour", but "a use case", "a unit",
    # "a one-pager". A leading acronym pronounced letter-by-letter ("an FAQ")
    # is not modelled — the plain rule covers every noun the presets ship.
    # @param noun [String] e.g. "use case", "entry", "event"
    # @return [String] "a use case", "an entry"; "" when the noun is blank
    # @example
    #   Submit {{ singular | downcase | with_article }}
    def with_article(noun)
      text = noun.to_s.strip
      return "" if text.empty?

      consonant_sound = text.match?(/\A(?:u[^aeiou][aeiou]|eu|one\b|uni)/i) # use, unit, euro, one
      vowel_sound = text.match?(/\A(?:[aeiou]|hour|honest|honou?r|heir)/i)
      article = vowel_sound && !consonant_sound ? "an" : "a"
      "#{article} #{text}"
    end
  end
end

Liquid::Template.register_filter(CatalogTemplate::TextFilters)
