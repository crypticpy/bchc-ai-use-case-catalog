# frozen_string_literal: true

# Unit tests for _plugins/text_filters.rb.
#
#   npm run test:ruby     (or: ruby -Itest test/plugins/text_filters_test.rb)

require "minitest/autorun"
require "liquid"

require_relative "../../_plugins/text_filters"

class TextFiltersHost
  include CatalogTemplate::TextFilters
end

class TextFiltersTest < Minitest::Test
  def setup
    @filters = TextFiltersHost.new
  end

  def test_with_article_uses_a_before_consonants
    assert_equal "a use case", @filters.with_article("use case")
    assert_equal "a resource", @filters.with_article("Resource".downcase)
    assert_equal "a unit", @filters.with_article("unit")
    assert_equal "a one-pager", @filters.with_article("one-pager")
  end

  def test_with_article_uses_an_before_vowels
    assert_equal "an entry", @filters.with_article("entry")
    assert_equal "an Event", @filters.with_article("Event")
    assert_equal "an hour", @filters.with_article("hour")
    assert_equal "an umbrella", @filters.with_article("umbrella")
  end

  def test_with_article_returns_empty_for_blank_input
    assert_equal "", @filters.with_article(nil)
    assert_equal "", @filters.with_article("  ")
  end

  # The templates call it exactly like this (index.md, _layouts/catalog.html), so
  # the registration and the filter chain are worth one end-to-end assertion.
  def test_registered_filter_renders_in_a_liquid_template
    template = Liquid::Template.parse("Submit {{ singular | downcase | with_article }}")
    assert_equal "Submit a use case", template.render("singular" => "Use case")
    assert_equal "Submit an entry", template.render("singular" => "Entry")
  end
end
