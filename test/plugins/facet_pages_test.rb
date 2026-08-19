# frozen_string_literal: true

# Unit tests for _plugins/facet_pages.rb's CatalogTemplate::FacetPagesGenerator.
#
#   npm run test:ruby     (or: ruby -Itest test/plugins/facet_pages_test.rb)
#
# These pages are the site's crawlable surface, so the parts with teeth are the
# URL (it is what a newsletter links to and what a search engine ranks, and it
# has to keep agreeing with the filter query string it mirrors) and the
# guardrails in _data/search.yml's `landing` block, which are all that stand
# between a free-text facet and a build that generates a page per value.

require "minitest/autorun"
require "jekyll"
require "tmpdir"

require_relative "../../_plugins/facet_pages"

class FacetPagesGeneratorTest < Minitest::Test
  def setup
    @generator = CatalogTemplate::FacetPagesGenerator.new
    @tmp = Dir.mktmpdir("facet-pages-test")
  end

  def teardown
    FileUtils.remove_entry(@tmp) if @tmp && File.directory?(@tmp)
  end

  # @param entries [Array<Hash>] entry front matter, each needing "slug"
  # @param fields [Array<Hash>] schema.fields
  # @param landing [Hash, nil] _data/search.yml's `landing` block
  # @param entry [Hash] extra schema.entry keys
  # @param expose [Boolean] whether catalog_index.rb already ran
  # @return [Jekyll::Site]
  def build_site(entries: [], fields: [], landing: nil, entry: {}, expose: true)
    config = Jekyll.configuration(
      "source" => @tmp, "destination" => File.join(@tmp, "_site"), "quiet" => true
    )
    site = Jekyll::Site.new(config)
    site.data["schema"] = { "entry" => { "path" => "catalog" }.merge(entry), "fields" => fields }
    site.data["search"] = { "landing" => landing } if landing
    path = site.data.dig("schema", "entry", "path")
    pages = entries.map do |data|
      page = Jekyll::PageWithoutAFile.new(site, site.source, "#{path}/#{data['slug']}", "index.html")
      page.data.merge!({ "layout" => "entry", "title" => data["slug"] }.merge(data))
      site.pages << page
      page
    end
    site.data["entry_pages"] = pages if expose
    site
  end

  def area_field
    { "key" => "area", "label" => "Program area", "facet" => true, "icon" => "tag" }
  end

  # @return [Array<Jekyll::Page>] only the pages this generator added
  def generated(site, layout)
    site.pages.select { |page| page.data["layout"] == layout }
  end

  def page_at(site, url)
    site.pages.find { |page| page.url == url }
  end

  # -- URLs ----------------------------------------------------------------

  def test_a_page_is_generated_per_field_and_value_with_a_hyphenated_field_slug
    site = build_site(
      fields: [{ "key" => "ai_types", "label" => "Types of AI", "facet" => true }],
      entries: [{ "slug" => "a", "ai_types" => ["Chat assistant"] },
                { "slug" => "b", "ai_types" => ["Computer vision"] }]
    )
    @generator.generate(site)

    assert_equal ["/catalog/ai-types/chat-assistant/", "/catalog/ai-types/computer-vision/"],
                 generated(site, "facet").map(&:url).sort
  end

  def test_the_page_url_is_the_static_twin_of_the_filter_query_string
    site = build_site(fields: [area_field], entries: [{ "slug" => "a", "area" => "Data & informatics" }])
    @generator.generate(site)
    page = generated(site, "facet").first

    assert_equal "/catalog/area/data-informatics/", page.url
    assert_equal "/catalog/?area=data-informatics", page.data["facet_filter_url"]
  end

  def test_the_entry_path_comes_from_the_schema_not_the_word_catalog
    site = build_site(
      entry: { "path" => "projects" }, fields: [area_field],
      entries: [{ "slug" => "a", "area" => "Health" }]
    )
    @generator.generate(site)

    assert_equal "/projects/area/health/", generated(site, "facet").first.url
    assert page_at(site, "/projects/a-z/")
  end

  # -- front matter --------------------------------------------------------

  def test_front_matter_carries_the_title_label_icon_and_the_entries_to_list
    site = build_site(
      fields: [area_field.merge("option_meta" => { "Health" => { "description" => "Clinical work." } })],
      entries: [{ "slug" => "a", "area" => "Health" }, { "slug" => "b", "area" => "Health" }]
    )
    @generator.generate(site)
    page = generated(site, "facet").first

    assert_equal "Health — Program area", page.data["title"]
    assert_equal "Program area", page.data["facet_label"]
    assert_equal "tag", page.data["facet_icon"]
    assert_equal "Health", page.data["facet_value"]
    assert_equal "Clinical work.", page.data["facet_description"]
    assert_equal 2, page.data["facet_total"]
    assert_equal %w[a b], page.data["facet_entries"].map { |e| e.data["slug"] }.sort
    assert_includes page.data["summary"], "Clinical work."
    assert_includes page.data["summary"], "2 entries"
  end

  def test_a_scalar_field_and_a_list_field_are_both_bucketed
    site = build_site(
      fields: [area_field, { "key" => "tags", "label" => "Tags", "facet" => true }],
      entries: [{ "slug" => "a", "area" => "Health", "tags" => %w[one two] }]
    )
    @generator.generate(site)

    assert_equal ["/catalog/area/health/", "/catalog/tags/one/", "/catalog/tags/two/"],
                 generated(site, "facet").map(&:url).sort
  end

  # -- the index the A–Z page renders --------------------------------------

  def test_the_facet_index_is_grouped_by_field_and_alphabetical_within_it
    site = build_site(
      fields: [area_field],
      entries: [{ "slug" => "a", "area" => "Zoning" }, { "slug" => "b", "area" => "Health" }]
    )
    @generator.generate(site)
    row = site.data["facet_index"].first

    assert_equal "area", row["key"]
    assert_equal "area", row["slug"]
    assert_equal "Program area", row["label"]
    assert_equal %w[Health Zoning], row["values"].map { |v| v["value"] }
    assert_equal "H", row["values"].first["letter"]
  end

  def test_entries_are_alphabetized_with_a_hash_bucket_last
    site = build_site(
      fields: [], entries: [{ "slug" => "a", "title" => "Beta" }, { "slug" => "b", "title" => "911 line" },
                            { "slug" => "c", "title" => "alpha" }]
    )
    @generator.generate(site)

    assert_equal %w[A B #], site.data["entry_az"].map { |g| g["letter"] }
    assert_equal ["alpha"], site.data["entry_az"].first["entries"].map { |e| e.data["title"] }
  end

  def test_the_a_to_z_page_is_generated_even_with_no_facet_fields
    site = build_site(fields: [], entries: [{ "slug" => "a" }])
    @generator.generate(site)

    page = page_at(site, "/catalog/a-z/")
    assert_equal "facet-index", page.data["layout"]
    assert_equal "Browse A–Z", page.data["title"]
  end

  # -- guardrails ----------------------------------------------------------

  def test_an_empty_catalog_generates_nothing
    site = build_site(fields: [area_field], entries: [])
    @generator.generate(site)

    assert_empty generated(site, "facet")
    assert_nil page_at(site, "/catalog/a-z/")
    assert_empty site.data["facet_index"]
    assert_empty site.data["entry_az"]
  end

  def test_a_non_facet_field_is_never_indexed
    site = build_site(
      fields: [{ "key" => "summary", "label" => "Summary" }],
      entries: [{ "slug" => "a", "summary" => "Words" }]
    )
    @generator.generate(site)

    assert_empty generated(site, "facet")
  end

  def test_exclude_drops_a_field_by_key
    site = build_site(
      fields: [area_field, { "key" => "ai_tools", "label" => "Tools", "facet" => true }],
      entries: [{ "slug" => "a", "area" => "Health", "ai_tools" => ["Some Model v4"] }],
      landing: { "exclude" => ["ai_tools"] }
    )
    @generator.generate(site)

    assert_equal ["/catalog/area/health/"], generated(site, "facet").map(&:url)
  end

  def test_max_values_skips_a_field_that_has_turned_into_a_directory
    entries = (1..5).map { |i| { "slug" => "e#{i}", "area" => "Value #{i}" } }
    site = build_site(fields: [area_field], entries: entries, landing: { "max_values" => 3 })
    @generator.generate(site)

    assert_empty generated(site, "facet")
    assert_empty site.data["facet_index"]
  end

  def test_min_entries_drops_the_single_entry_tail
    site = build_site(
      fields: [area_field], landing: { "min_entries" => 2 },
      entries: [{ "slug" => "a", "area" => "Health" }, { "slug" => "b", "area" => "Health" },
                { "slug" => "c", "area" => "Zoning" }]
    )
    @generator.generate(site)

    assert_equal ["/catalog/area/health/"], generated(site, "facet").map(&:url)
  end

  def test_max_entries_caps_what_a_page_lists_but_not_what_it_counts
    entries = (1..5).map { |i| { "slug" => "e#{i}", "area" => "Health" } }
    site = build_site(fields: [area_field], entries: entries, landing: { "max_entries" => 2 })
    @generator.generate(site)
    page = generated(site, "facet").first

    assert_equal 2, page.data["facet_entries"].size
    assert_equal 5, page.data["facet_total"]
  end

  def test_enabled_false_keeps_the_a_to_z_page_and_drops_the_landing_pages
    site = build_site(
      fields: [area_field], entries: [{ "slug" => "a", "area" => "Health" }],
      landing: { "enabled" => false }
    )
    @generator.generate(site)

    assert_empty generated(site, "facet")
    assert_empty site.data["facet_index"]
    assert page_at(site, "/catalog/a-z/")
  end

  def test_an_existing_page_at_the_url_is_never_overwritten
    site = build_site(fields: [area_field], entries: [{ "slug" => "a", "area" => "Health" }])
    squatter = Jekyll::PageWithoutAFile.new(site, site.source, "catalog/area/health", "index.html")
    squatter.data["layout"] = "page"
    site.pages << squatter
    @generator.generate(site)

    assert_empty generated(site, "facet")
    assert_equal 1, site.pages.count { |page| page.url == "/catalog/area/health/" }
  end

  # -- ordering ------------------------------------------------------------

  def test_listed_entries_follow_the_schemas_own_sort
    entries = [{ "slug" => "old", "area" => "Health", "published" => "2024-01-01" },
               { "slug" => "new", "area" => "Health", "published" => "2025-01-01" }]
    site = build_site(fields: [area_field], entries: entries)
    @generator.generate(site)

    assert_equal %w[new old], generated(site, "facet").first.data["facet_entries"].map { |e| e.data["slug"] }
  end

  def test_sort_order_asc_reverses_it
    entries = [{ "slug" => "old", "area" => "Health", "published" => "2024-01-01" },
               { "slug" => "new", "area" => "Health", "published" => "2025-01-01" }]
    site = build_site(fields: [area_field], entries: entries, entry: { "sort_order" => "asc" })
    @generator.generate(site)

    assert_equal %w[old new], generated(site, "facet").first.data["facet_entries"].map { |e| e.data["slug"] }
  end

  def test_it_finds_the_entries_itself_when_catalog_index_has_not_run
    site = build_site(fields: [area_field], entries: [{ "slug" => "a", "area" => "Health" }], expose: false)
    @generator.generate(site)

    assert_equal ["/catalog/area/health/"], generated(site, "facet").map(&:url)
  end

  # -- values --------------------------------------------------------------

  def test_blank_and_duplicate_values_are_ignored
    site = build_site(
      fields: [area_field],
      entries: [{ "slug" => "a", "area" => ["Health", "  ", "", "Health"] }]
    )
    @generator.generate(site)
    values = site.data["facet_index"].first["values"]

    assert_equal 1, values.size
    assert_equal 1, values.first["count"]
  end
end
