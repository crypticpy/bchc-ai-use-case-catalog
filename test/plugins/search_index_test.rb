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

  # -- structured field values ---------------------------------------------

  # A `links`-shaped value is the shipped case, but nothing in the generator
  # names it: what is asserted here is the SHAPE rule, so a schema that grows a
  # `{org, url, email, note}` field is indexed the day it is added.
  def test_a_field_holding_hashes_indexes_their_values_and_not_their_keys
    text = @generator.field_text([
                                   { "label" => "Toolkit", "url" => "https://example.org/toolkit" },
                                   { "org" => "County health", "email" => "mailto:team@example.org",
                                     "note" => "Adapted in 2026" }
                                 ])

    assert_equal ["Toolkit", "County health", "Adapted in 2026"], text
  end

  def test_addresses_inside_a_structured_value_are_not_indexed
    text = @generator.field_text([
                                   { "a" => "https://example.org/x", "b" => "//cdn.example.org/y",
                                     "c" => "/catalog/thing/", "d" => "./relative", "e" => "www.example.org",
                                     "f" => "Readable" }
                                 ])

    assert_equal ["Readable"], text
  end

  def test_only_a_real_address_scheme_is_dropped
    addresses = @generator.field_text([
                                        { "a" => "mailto:team@example.org", "b" => "tel:+15551234567",
                                          "c" => "https://example.org/x", "d" => "HTTPS://EXAMPLE.ORG/Y" }
                                      ])

    assert_equal [], addresses
  end

  # `mailto:` is usually typed without its scheme. A value that is nothing
  # but an email is an address; prose that merely contains one keeps its words.
  def test_a_bare_email_is_an_address_too
    text = @generator.field_text([
                                   { "email" => "digital-services@health.example.gov",
                                     "intranet" => "ops@intranet",
                                     "note" => "Ask at desk@example.org before visiting" }
                                 ])

    # `ops@intranet` has no dot, but the submission forms accept it — whatever
    # they let in stays out of the index.
    assert_equal ["Ask at desk@example.org before visiting"], text
  end

  # A prose label reads as `word:`, which is not a URI scheme. Losing these was
  # losing exactly the words this flattening was built to index.
  def test_prose_that_carries_a_colon_is_kept
    text = @generator.field_text([
                                   { "a" => "Guidance: redact PII first", "b" => "Note: see appendix",
                                     "c" => "Contact: Jane Doe", "d" => "Ratio: 2:1" }
                                 ])

    assert_equal ["Guidance: redact PII first", "Note: see appendix", "Contact: Jane Doe", "Ratio: 2:1"], text
  end

  # A scalar is the reader asking for exactly that value, so a `url` field
  # marked `search: true` still indexes its own URL.
  def test_a_scalar_field_is_indexed_as_it_stands
    assert_equal ["https://example.org/tool"], @generator.field_text("https://example.org/tool")
    assert_equal %w[Alpha Beta], @generator.field_text(["Alpha", "Beta"])
    assert_equal ["2026"], @generator.field_text(2026)
  end

  def test_blank_and_missing_values_contribute_nothing
    assert_equal [], @generator.field_text(nil)
    assert_equal [], @generator.field_text([nil, "  ", []])
    assert_equal [], @generator.field_text({ "url" => "https://example.org" })
  end

  def test_an_entrys_facets_read_a_structured_field_as_words
    schema = { "fields" => [{ "key" => "resources", "search" => true }] }
    site = build_site(schema: schema, pages: [{
      "dir" => "catalog/thing", "layout" => "entry", "slug" => "thing", "title" => "Thing",
      "resources" => [{ "label" => "Evaluation memo", "url" => "https://example.org/memo" }]
    }])

    assert_equal "Evaluation memo", docs_for(site).first[:facets]
  end

  # -- concepts ------------------------------------------------------------

  # @param count [Integer] how many docs
  # @param words [Proc] index -> the body words for that doc
  # @return [Array<Hash>] payload-shaped docs
  def concept_docs(count, &words)
    Array.new(count) do |index|
      { title: "Entry #{index + 1}", summary: "", facets: "",
        sections: [{ h: nil, a: nil, t: words.call(index) }] }
    end
  end

  # Six entries pair "chatbot" with "assistant"; six pair "geocode" with
  # "addresses"; the rest share nothing. Nobody wrote either pair down.
  # @return [Array<Hash>]
  def paired_docs
    concept_docs(20) do |index|
      if index < 6 then "The chatbot answers residents and the assistant drafts replies."
      elsif index < 12 then "Geocode the intake addresses before the addresses reach mapping."
      else "Filler prose number #{index} about unrelated topic #{index}."
      end
    end
  end

  def test_words_that_keep_appearing_together_become_related
    terms = @generator.concept_terms(paired_docs, CatalogTemplate::SearchIndexGenerator::CONCEPT_DEFAULTS)

    assert_includes terms["chatbot"], "assistant"
    assert_includes terms["assistant"], "chatbot"
    assert_includes terms["geocode"], "addresses"
    refute_includes terms["chatbot"], "geocode"
  end

  def test_the_map_is_sorted_and_identical_across_runs
    defaults = CatalogTemplate::SearchIndexGenerator::CONCEPT_DEFAULTS
    first = @generator.concept_terms(paired_docs, defaults)
    second = @generator.concept_terms(paired_docs, defaults)

    assert_equal first, second
    assert_equal first.keys.sort, first.keys
    assert(first.values.none?(&:empty?))
  end

  # The stop-word list nobody maintains: a word this catalog uses everywhere
  # cannot be about any one entry in it.
  def test_a_word_most_entries_use_is_not_a_concept
    docs = concept_docs(20) { |index| "Every entry mentions surveillance. Unique#{index} topic#{index}." }
    terms = @generator.concept_terms(docs, CatalogTemplate::SearchIndexGenerator::CONCEPT_DEFAULTS)

    refute terms.key?("surveillance")
  end

  # Thirteen entries: "dispatch" and "console" are in seven of them (54%),
  # "chatbot" and "assistant" in six (46%). Half of thirteen is not a whole
  # entry, and rounding that share UP let a word over the configured ratio stay.
  # @return [Array<Hash>]
  def threshold_docs
    concept_docs(13) do |index|
      parts = []
      parts << "The dispatch console routes the dispatch console queue." if index < 7
      parts << "The chatbot answers residents and the assistant drafts replies." if index < 6
      parts << "Filler prose number #{index} about unrelated topic #{index}."
      parts.join(" ")
    end
  end

  def test_a_word_over_the_ratio_is_dropped_at_a_size_that_does_not_divide
    terms = @generator.concept_terms(threshold_docs, CatalogTemplate::SearchIndexGenerator::CONCEPT_DEFAULTS)

    refute terms.key?("dispatch")
    assert(terms.values.none? { |related| related.include?("dispatch") })
  end

  def test_a_word_exactly_at_the_ratio_is_kept
    terms = @generator.concept_terms(threshold_docs, CatalogTemplate::SearchIndexGenerator::CONCEPT_DEFAULTS)

    assert_includes terms["chatbot"], "assistant"
  end

  def test_a_catalog_too_small_to_measure_derives_nothing
    docs = concept_docs(6) { "The chatbot answers residents and the assistant drafts replies." }

    assert_empty @generator.concept_terms(docs, CatalogTemplate::SearchIndexGenerator::CONCEPT_DEFAULTS)
  end

  def test_the_layer_can_be_switched_off_without_dropping_the_query_knobs
    options = CatalogTemplate::SearchIndexGenerator::CONCEPT_DEFAULTS.merge("enabled" => false)
    block = @generator.concepts(paired_docs, options)

    assert_empty block[:terms]
    assert_in_delta 0.9, block[:weight]
    assert_equal 4, block[:max_expansions]
  end

  def test_search_yml_overrides_only_the_keys_it_names
    site = build_site
    site.data["search"] = { "concepts" => { "weight" => 0.25, "unknown" => 1 } }
    options = @generator.concept_options(site)

    assert_in_delta 0.25, options["weight"]
    assert_equal 4, options["max_expansions"]
    refute options.key?("unknown")
  end

  def test_the_payload_carries_the_concept_block
    site = build_site(pages: [{
      "dir" => "catalog/thing", "layout" => "entry", "slug" => "thing", "title" => "Thing"
    }])
    @generator.generate(site)

    parsed = JSON.parse(JSON.generate(site.static_files.last.instance_variable_get(:@payload)))
    assert_equal({}, parsed["concepts"]["terms"])
    assert_in_delta 0.9, parsed["concepts"]["weight"]
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

  def test_the_version_names_the_content_not_the_build
    entry = {
      "dir" => "catalog/thing", "layout" => "entry", "slug" => "thing",
      "title" => "Thing", "body" => "## S\nP.\n"
    }
    versions = Array.new(2) do
      site = build_site(pages: [entry.dup])
      @generator.generate(site)
      site.static_files.last.instance_variable_get(:@payload)[:version]
    end
    assert_match(/\A\h{16}\z/, versions.first)
    # Two builds of the same catalog agree, however far apart generated_at is.
    assert_equal versions.first, versions.last

    changed = build_site(pages: [entry.merge("title" => "Other thing")])
    @generator.generate(changed)
    refute_equal versions.first, changed.static_files.last.instance_variable_get(:@payload)[:version]
  end

  def test_the_version_names_the_index_implementation_too
    entry = {
      "dir" => "catalog/thing", "layout" => "entry", "slug" => "thing",
      "title" => "Thing", "body" => "## S\nP.\n"
    }
    FileUtils.mkdir_p(File.join(@tmp, "assets", "js"))
    File.write(File.join(@tmp, "assets", "js", "lunr.min.js"), "/* lunr 2.3.9 */")
    site = build_site(pages: [entry.dup])
    @generator.generate(site)
    before = site.static_files.last.instance_variable_get(:@payload)[:version]

    # Same catalog, upgraded lunr: every cached serialized index must retire.
    File.write(File.join(@tmp, "assets", "js", "lunr.min.js"), "/* lunr 3.0.0 */")
    site = build_site(pages: [entry.dup])
    @generator.generate(site)
    refute_equal before, site.static_files.last.instance_variable_get(:@payload)[:version]
  end

  def test_the_version_and_entry_count_are_stamped_into_site_config
    site = build_site(pages: [
      { "dir" => "catalog/thing", "layout" => "entry", "slug" => "thing", "title" => "Thing" },
      { "dir" => "catalog/other", "layout" => "entry", "slug" => "other", "title" => "Other" },
      { "dir" => "events/kickoff", "layout" => "event", "cohort" => "2026",
        "event_id" => "kickoff", "title" => "Kickoff" }
    ])
    @generator.generate(site)

    stamp = site.config["search_index"]
    payload = site.static_files.last.instance_variable_get(:@payload)
    assert_equal payload[:version], stamp["version"]
    # Entries only: events and cohorts are searchable but never gate the UI.
    assert_equal 2, stamp["entries"]
  end
end
