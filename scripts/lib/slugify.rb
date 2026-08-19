# frozen_string_literal: true

# The one slug implementation the Ruby scripts share.
#
# It has to agree, character for character, with `slugify` in
# assets/js/configurator/strings.js (which scripts/lib/issue_body.mjs re-exports):
# /submit/ shows a submitter the slug that implementation produces, and the same
# rule names the folder an entry lives at forever. Two implementations of one
# rule is how "Réunion de cohorte" becomes `r-union-de-cohorte` on one side and
# `reunion-de-cohorte` on the other, so test/scripts/slugify_parity.test.mjs runs
# both over the same fixture list and fails when they diverge.
module CatalogTemplate
  module Slugify
    # Combining marks NFKD decomposition leaves behind (é -> e + U+0301).
    COMBINING_MARKS = /[\u0300-\u036F]/

    # Letters NFKD leaves whole that still have an obvious ASCII spelling
    # (ß -> ss, ø -> o, ł -> l). Keep in step with LIGATURES in
    # assets/js/configurator/strings.js.
    LIGATURES = {
      "ß" => "ss", "ẞ" => "ss", "ø" => "o", "Ø" => "o", "ł" => "l", "Ł" => "l",
      "đ" => "d", "Đ" => "d", "æ" => "ae", "Æ" => "ae", "œ" => "oe", "Œ" => "oe",
      "þ" => "th", "Þ" => "th", "ð" => "d", "Ð" => "d", "ı" => "i"
    }.freeze
    LIGATURE_RE = /[#{LIGATURES.keys.join}]/

    # Turn free text into a URL/id-safe slug.
    #
    # Accents are folded to their base letter rather than dropped, so a title
    # with no ASCII in it at all (CJK, emoji) is the only case that returns "".
    # Callers decide what to do about that; see `slugFallback` on the JS side.
    #
    # @param value [String, nil]
    # @return [String] lowercase, hyphen-separated, `[a-z0-9-]` only
    def self.call(value)
      text = value.to_s
      # Invalid UTF-8 would raise out of unicode_normalize; a bad byte in an
      # issue body must not take the whole job down.
      text = text.scrub("") unless text.valid_encoding?
      text
        .gsub(LIGATURE_RE, LIGATURES)
        .unicode_normalize(:nfkd)
        .gsub(COMBINING_MARKS, "")
        .downcase
        .gsub(/[^a-z0-9]+/, "-")
        .gsub(/\A-+|-+\z/, "")
    end
  end
end
