# frozen_string_literal: true

# Unit tests for _plugins/search_index.rb's CatalogTemplate::SearchIndexGenerator.
#
#   npm run test:ruby     (or: ruby -Itest test/plugins/search_index_test.rb)
#
# The section splitter is the part with teeth: assets/js/search.js maps a lunr
# match position back to the section it fell in and deep-links to its anchor, so
# a lost trailing section or an anchor that disagrees with _includes/toc.html is
# a silently wrong link, not a crash.

require "minitest/autorun"
require "jekyll"
require "json"
require "tmpdir"

require_relative "../../_plugins/search_index"

SearchIndexFakePage = Struct.new(:content)

class SearchIndexGeneratorTest < Minitest::Test
  def setup
    @generator = CatalogTemplate::SearchIndexGenerator.new
    @tmp = Dir.mktmpdir("search-index-test")
  end

  def teardown
    FileUtils.remove_entry(@tmp) if @tmp && File.directory?(@tmp)
  end

  # @param body [String] raw page content
  # @param cap [Integer]
  # @return [Array<Hash>]
  def sections(body, cap = 0)
    @generator.body_sections(SearchIndexFakePage.new(body), cap)
  end

  # -- section splitting ---------------------------------------------------

  def test_splits_on_level_two_headings_and_keeps_the_last_one
    result = sections(<<~MD)
      Intro prose.

      ## What it does
      It translates.

      ## How to reuse
      Fork it.
    MD

    assert_equal [nil, "What it does", "How to reuse"], result.map { |s| s[:h] }
    assert_equal "Fork it.", result.last[:t]
  end

  def test_text_before_the_first_heading_becomes_a_headingless_section
    result = sections("Just the intro.\n\n## Later\nMore.\n")

    assert_nil result.first[:h]
    assert_nil result.first[:a]
    assert_equal "Just the intro.", result.first[:t]
  end

  def test_a_body_with_no_headings_is_one_section
    result = sections("No headings at all, just prose.\n")

    assert_equal 1, result.size
    assert_nil result.first[:h]
  end

  def test_an_empty_body_produces_no_sections
    assert_equal [], sections("")
    assert_equal [], sections("   \n\n")
  end

  def test_a_heading_with_no_prose_under_it_is_still_indexed
    result = sections("## Empty section\n\n## Next\nText.\n")

    assert_equal ["Empty section", "Next"], result.map { |s| s[:h] }
    assert_equal "", result.first[:t]
  end

  def test_hashes_inside_a_fenced_code_block_are_not_headings
    result = sections(<<~MD)
      Intro.

      ```yaml
      ## not a heading
      key: value
      ```

      ## Real heading
      Body.
    MD

    assert_equal [nil, "Real heading"], result.map { |s| s[:h] }
  end

  def test_deeper_headings_stay_inside_their_section
    result = sections("## Top\nBefore.\n\n### Nested\nAfter.\n")

    assert_equal ["Top"], result.map { |s| s[:h] }
    assert_includes result.first[:t], "Nested"
  end

  # -- anchors -------------------------------------------------------------

  def test_anchors_match_the_ids_kramdown_generates
    result = sections("## What it does & why\nText.\n\n## 2024 results\nText.\n")

    # Punctuation dropped, spaces hyphenated, leading non-letters stripped —
    # the same rules _includes/toc.html reads out of the rendered HTML.
    assert_equal %w[what-it-does--why results], result.map { |s| s[:a] }
  end

  def test_repeated_headings_get_kramdowns_numeric_suffixes
    result = sections("## Notes\nA.\n\n## Notes\nB.\n\n## Notes\nC.\n")

    assert_equal %w[notes notes-1 notes-2], result.map { |s| s[:a] }
  end

  def test_a_heading_with_no_usable_characters_falls_back_to_section
    result = sections("## 12345\nText.\n")

    assert_equal ["section"], result.map { |s| s[:a] }
  end

  # -- normalization and the cap -------------------------------------------

  def test_markup_liquid_and_html_are_stripped_from_the_text
    result = sections("## H\nSome **bold**, a [link](/a/), {% raw %}x{% endraw %} and <b>html</b>.\n")

    refute_includes result.first[:t], "**"
    refute_includes result.first[:t], "<b>"
    refute_includes result.first[:t], "{%"
    assert_includes result.first[:t], "bold"
  end

  def test_body_chars_caps_the_total_prose_and_drops_later_sections
    body = "## One\n#{'a' * 100}\n\n## Two\n#{'b' * 100}\n\n## Three\n#{'c' * 100}\n"
    result = sections(body, 150)

    assert_equal %w[One Two], result.map { |s| s[:h] }
    assert_equal 150, result.sum { |s| s[:t].length }
  end

  def test_a_cap_of_zero_means_unlimited
    body = "## One\n#{'a' * 5000}\n"

    assert_equal 5000, sections(body, 0).first[:t].length
  end

  # -- the payload ---------------------------------------------------------

  # @return [Jekyll::Site]
  def build_site(schema: {}, pages: [])
    config = Jekyll.configuration(
      "source" => @tmp, "destination" => File.join(@tmp, "_site"), "quiet" => true
    )
    site = Jekyll::Site.new(config)
    site.data["schema"] = schema
    pages.each do |data|
      page = Jekyll::PageWithoutAFile.new(site, site.source, data.delete("dir"), "index.html")
      page.content = data.delete("body").to_s
      page.data.merge!(data)
      site.pages << page
    end
    site
  end

  # @param site [Jekyll::Site]
  # @return [Array<Hash>] the generated docs, symbol-keyed as written
  def docs_for(site)
    @generator.generate(site)
    site.static_files.last.instance_variable_get(:@payload)[:docs]
  end

  def test_entry_docs_carry_facets_sections_and_a_baseurl_prefixed_url
    schema = { "fields" => [{ "key" => "area", "facet" => true }, { "key" => "notes", "search" => true }] }
    site = build_site(schema: schema, pages: [{
      "dir" => "catalog/thing", "layout" => "entry", "slug" => "thing", "title" => "Thing",
      "summary" => "A thing.", "area" => ["Translation", "Outreach"], "notes" => "Extra",
      "body" => "## Section\nProse.\n"
    }])
    doc = docs_for(site).first

    assert_equal "thing", doc[:id]
    assert_equal "entry", doc[:kind]
    assert_equal "/catalog/thing/", doc[:url]
    assert_equal "Translation Outreach Extra", doc[:facets]
    assert_equal [{ h: "Section", a: "section", t: "Prose." }], doc[:sections]
  end

  def test_the_title_and_summary_are_not_duplicated_into_the_body
    site = build_site(pages: [{
      "dir" => "catalog/thing", "layout" => "entry", "slug" => "thing",
      "title" => "Multilingual", "summary" => "A summary.", "body" => "Prose only.\n"
    }])
    doc = docs_for(site).first

    text = doc[:sections].map { |s| s[:t] }.join(" ")
    refute_includes text, "Multilingual"
    refute_includes text, "A summary."
  end

  def test_events_and_cohorts_are_indexed_with_empty_sections
    site = build_site(pages: [
                        { "dir" => "cohorts/2026/events/kickoff", "layout" => "event", "title" => "Kickoff",
                          "cohort" => "2026", "event_id" => "kickoff", "event_location" => "Room 2" },
                        { "dir" => "cohorts/2026", "layout" => "cohort", "title" => "Cohort 2026", "year" => 2026 }
                      ])
    docs = docs_for(site)

    assert_equal ["event:2026:kickoff", "cohort:2026"], docs.map { |d| d[:id] }
    assert(docs.all? { |d| d[:sections] == [] })
    assert_equal "Room 2 2026", docs.first[:facets]
  end

  def test_pages_with_other_layouts_are_not_indexed
    site = build_site(pages: [{ "dir" => "about", "layout" => "default", "title" => "About" }])

    assert_equal [], docs_for(site)
  end

  # -- synonyms ------------------------------------------------------------

  def test_synonyms_are_bidirectional_lowercased_and_deduplicated
    site = build_site
    site.data["search"] = { "synonyms" => { "Chatbot" => ["Chat Assistant", "conversational"] } }

    result = @generator.send(:synonyms, site)

    assert_equal ["chat assistant", "conversational"], result["chatbot"]
    assert_equal ["chatbot"], result["chat assistant"]
    assert_equal ["chatbot"], result["conversational"]
  end

  # Deliberately not transitive: a => b and b => c does not make a => c, so an
  # editor can widen one term without silently widening its neighbours too.
  def test_a_pair_listed_from_both_sides_appears_once_and_does_not_chain
    site = build_site
    site.data["search"] = { "synonyms" => { "a" => ["b"], "b" => ["a", "c"] } }
    result = @generator.send(:synonyms, site)

    assert_equal ["b"], result["a"]
    assert_equal %w[a c], result["b"]
    assert_equal ["b"], result["c"]
  end

  def test_blank_and_self_referential_synonyms_are_dropped
    site = build_site
    site.data["search"] = { "synonyms" => { "  " => ["x"], "rag" => ["", "RAG", "document q&a"] } }

    result = @generator.send(:synonyms, site)

    assert_equal ["document q&a"], result["rag"]
    refute result.key?("")
    refute result.key?("  ")
  end

  def test_a_missing_or_malformed_search_data_file_yields_no_synonyms
    assert_empty @generator.send(:synonyms, build_site)

    site = build_site
    site.data["search"] = { "synonyms" => "not a hash" }
    assert_empty @generator.send(:synonyms, site)
  end

  def test_the_payload_carries_the_synonyms_beside_the_docs
    site = build_site(pages: [{
      "dir" => "catalog/thing", "layout" => "entry", "slug" => "thing", "title" => "Thing"
    }])
    site.data["search"] = { "synonyms" => { "llm" => ["large language model"] } }
    @generator.generate(site)

    parsed = JSON.parse(JSON.generate(site.static_files.last.instance_variable_get(:@payload)))
    assert_equal ["large language model"], parsed["synonyms"]["llm"]
    assert_equal ["llm"], parsed["synonyms"]["large language model"]
  end

  def test_the_payload_serializes_to_json
    site = build_site(pages: [{
      "dir" => "catalog/thing", "layout" => "entry", "slug" => "thing",
      "title" => "Thing", "body" => "## S\nP.\n"
    }])
    @generator.generate(site)

    parsed = JSON.parse(JSON.generate(site.static_files.last.instance_variable_get(:@payload)))
    assert_equal "thing", parsed["docs"].first["id"]
    assert_equal "S", parsed["docs"].first["sections"].first["h"]
  end
end
