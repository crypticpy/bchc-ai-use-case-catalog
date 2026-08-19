# frozen_string_literal: true

# Unit tests for _plugins/theme_filters.rb's Liquid filters.
#
#   npm run test:ruby     (or: ruby -Itest test/plugins/theme_filters_test.rb)
#
# `jekyll` (for Jekyll::Utils.slugify) and `liquid` (register_filter target)
# must be loaded before the plugin file. The filters are plain instance
# methods on `CatalogTemplate::ThemeFilters`, exercised here via a throwaway
# host class rather than a full Liquid template/context.

require "minitest/autorun"
require "jekyll"
require "liquid"

require_relative "../../_plugins/theme_filters"

class ThemeFiltersHost
  include CatalogTemplate::ThemeFilters
end

class ThemeFiltersTest < Minitest::Test
  def setup
    @filters = ThemeFiltersHost.new
  end

  # -- hex_to_rgb ---------------------------------------------------------

  def test_hex_to_rgb_converts_six_digit_hex
    assert_equal "29 78 137", @filters.hex_to_rgb("#1D4E89")
  end

  def test_hex_to_rgb_accepts_missing_leading_hash
    assert_equal "29 78 137", @filters.hex_to_rgb("1D4E89")
  end

  def test_hex_to_rgb_expands_three_digit_shorthand
    assert_equal "255 0 0", @filters.hex_to_rgb("#f00")
  end

  def test_hex_to_rgb_falls_back_to_black_for_unparsable_input
    assert_equal "0 0 0", @filters.hex_to_rgb("not-a-color")
    assert_equal "0 0 0", @filters.hex_to_rgb(nil)
    assert_equal "0 0 0", @filters.hex_to_rgb("")
  end

  # -- facet_values / slugify_list -----------------------------------------

  def test_facet_values_joins_slugified_values_with_commas
    assert_equal "in-production,pilot", @filters.facet_values(["In production", "Pilot"])
  end

  def test_facet_values_handles_scalar_and_blank_entries
    assert_equal "public-facing", @filters.facet_values("Public-facing")
    assert_equal "", @filters.facet_values(nil)
    assert_equal "", @filters.facet_values([])
    assert_equal "a", @filters.facet_values(["a", "", nil, "  "])
  end

  def test_slugify_list_returns_an_array_not_a_joined_string
    assert_equal %w[in-production pilot], @filters.slugify_list(["In production", "Pilot"])
    assert_equal [], @filters.slugify_list(nil)
  end

  # -- link_host -------------------------------------------------------------

  def test_link_host_strips_leading_www
    assert_equal "github.com", @filters.link_host("https://www.github.com/org/repo")
  end

  def test_link_host_keeps_non_www_host_as_is
    assert_equal "example.org", @filters.link_host("https://example.org/docs")
  end

  def test_link_host_returns_empty_string_for_unparsable_or_hostless_url
    assert_equal "", @filters.link_host("not a url")
    assert_equal "", @filters.link_host(nil)
    assert_equal "", @filters.link_host("mailto:person@example.org")
  end

  # -- query_encode ------------------------------------------------------------

  def test_query_encode_percent_encodes_spaces_not_plus
    assert_equal "a%20b", @filters.query_encode("a b")
  end

  def test_query_encode_escapes_reserved_query_characters
    assert_equal "a%26b%3Dc", @filters.query_encode("a&b=c")
  end

  def test_query_encode_is_nil_safe
    assert_equal "", @filters.query_encode(nil)
  end

  # -- facet_options -----------------------------------------------------------

  def test_facet_options_collects_unique_values_case_insensitively_sorted
    entries = [
      { "area" => ["Outreach", "Translation"] },
      { "area" => "Translation" },
      { "area" => ["benefits"] }
    ]
    # Sorted on the downcased value, so "benefits" leads rather than trailing
    # the capitalized ones as a plain `sort` would put it.
    assert_equal %w[benefits Outreach Translation], @filters.facet_options(entries, "area")
  end

  def test_facet_options_drops_blanks_and_missing_values
    entries = [{ "area" => ["A", "", nil, "  "] }, { "other" => "B" }, {}]
    assert_equal ["A"], @filters.facet_options(entries, "area")
  end

  def test_facet_options_is_nil_safe
    assert_equal [], @filters.facet_options(nil, "area")
  end

  # -- static_file -------------------------------------------------------------

  # static_file reads the site off the Liquid context, so it needs a real one.
  # @param paths [Array<String>] relative_path of each static file in the site
  # @param value [String] the path to test
  # @return [Object] the filter's return value
  def static_file(paths, value)
    site = Struct.new(:static_files).new(paths.map { |path| Struct.new(:relative_path).new(path) })
    host = ThemeFiltersHost.new
    host.instance_variable_set(:@context, Liquid::Context.new({}, {}, { site: site }))
    host.static_file(value)
  end

  def test_static_file_finds_a_file_jekyll_is_copying
    assert_equal true, static_file(["/catalog/a/deck.pdf"], "/catalog/a/deck.pdf")
  end

  def test_static_file_accepts_a_path_without_a_leading_slash
    assert_equal true, static_file(["/catalog/a/deck.pdf"], "catalog/a/deck.pdf")
  end

  def test_static_file_is_false_for_a_missing_file_or_a_blank_path
    assert_equal false, static_file(["/catalog/a/deck.pdf"], "/catalog/a/other.pdf")
    assert_equal false, static_file(["/catalog/a/deck.pdf"], "")
    assert_equal false, static_file(["/catalog/a/deck.pdf"], nil)
  end

  def test_static_file_scans_the_site_only_once
    site = Struct.new(:static_files).new([Struct.new(:relative_path).new("/a.pdf")])
    host = ThemeFiltersHost.new
    host.instance_variable_set(:@context, Liquid::Context.new({}, {}, { site: site }))
    host.static_file("/a.pdf")
    # The cache, not the site, answers from here on — proven by emptying the site.
    site.static_files = []

    assert_equal true, host.static_file("/a.pdf")
  end

  def test_static_file_is_false_without_a_site_in_the_context
    host = ThemeFiltersHost.new
    host.instance_variable_set(:@context, Liquid::Context.new({}, {}, {}))

    assert_equal false, host.static_file("/a.pdf")
  end
end
