# frozen_string_literal: true

# Unit tests for _plugins/catalog_feed.rb's CatalogTemplate::CatalogFeedGenerator.
#
#   npm run test:ruby     (or: ruby -Itest test/plugins/catalog_feed_test.rb)
#
# The feed is a published contract: readers poll it, so a malformed document or
# a URL that stops being absolute breaks subscribers silently. The tests parse
# the generated XML with REXML rather than matching strings, which also proves
# it is well-formed.

require "minitest/autorun"
require "jekyll"
require "rexml/document"
require "tmpdir"

require_relative "../../_plugins/catalog_feed"

class CatalogFeedGeneratorTest < Minitest::Test
  def setup
    @generator = CatalogTemplate::CatalogFeedGenerator.new
    @tmp = Dir.mktmpdir("catalog-feed-test")
  end

  def teardown
    FileUtils.remove_entry(@tmp) if @tmp && File.directory?(@tmp)
  end

  # @param entries [Array<Hash>] entry front matter, each needing "slug"
  # @param schema [Hash] _data/schema.yml
  # @param config [Hash] extra _config.yml keys
  # @param expose [Boolean] whether catalog_index.rb already ran
  # @return [Jekyll::Site]
  def build_site(entries: [], schema: nil, config: {}, expose: true)
    conf = Jekyll.configuration({
      "source" => @tmp, "destination" => File.join(@tmp, "_site"),
      "quiet" => true, "url" => "https://example.org"
    }.merge(config))
    site = Jekyll::Site.new(conf)
    site.data["schema"] = schema || { "entry" => { "path" => "catalog" }, "fields" => [] }
    site.data["site"] = { "name" => "Sample Catalog", "description" => "A sample." }
    path = site.data.dig("schema", "entry", "path") || "catalog"
    pages = entries.map do |data|
      page = Jekyll::PageWithoutAFile.new(site, site.source, "#{path}/#{data['slug']}", "index.html")
      page.data.merge!({ "layout" => "entry", "title" => data["slug"] }.merge(data))
      site.pages << page
      page
    end
    site.data["entry_pages"] = pages if expose
    site
  end

  # @param site [Jekyll::Site]
  # @return [REXML::Document, nil]
  def feed_for(site)
    @generator.generate(site)
    file = site.static_files.find { |f| f.name == "feed.xml" }
    file && REXML::Document.new(file.instance_variable_get(:@body))
  end

  # @param n [Integer]
  # @return [Array<Hash>]
  def sample(n)
    (1..n).map { |i| { "slug" => "e#{i}", "title" => "Entry #{i}", "published" => format("2024-01-%02d", i) } }
  end

  # -- placement -----------------------------------------------------------

  def test_writes_the_feed_under_the_configured_entry_path
    site = build_site(entries: sample(1))
    @generator.generate(site)
    file = site.static_files.last

    assert_equal "feed.xml", file.name
    assert_equal "/catalog/feed.xml", file.relative_path
  end

  def test_follows_a_renamed_entry_path
    schema = { "entry" => { "path" => "projects" }, "fields" => [] }
    site = build_site(entries: sample(1), schema: schema)
    @generator.generate(site)

    assert_equal "/projects/feed.xml", site.static_files.last.relative_path
  end

  def test_no_feed_is_written_for_an_empty_catalog
    site = build_site

    assert_nil feed_for(site)
  end

  def test_falls_back_to_scanning_site_pages_when_entry_pages_is_absent
    site = build_site(entries: sample(2), expose: false)
    feed = feed_for(site)

    assert_equal 2, REXML::XPath.match(feed, "/feed/entry").size
  end

  # -- document shape ------------------------------------------------------

  def test_the_feed_carries_the_site_identity_and_both_links
    feed = feed_for(build_site(entries: sample(1)))

    assert_equal "Sample Catalog", REXML::XPath.first(feed, "/feed/title").text
    assert_equal "A sample.", REXML::XPath.first(feed, "/feed/subtitle").text
    assert_equal "https://example.org/catalog/", REXML::XPath.first(feed, "/feed/id").text
    assert_equal "https://example.org/catalog/feed.xml",
                 REXML::XPath.first(feed, "/feed/link[@rel='self']").attributes["href"]
    assert_equal "https://example.org/catalog/",
                 REXML::XPath.first(feed, "/feed/link[@rel='alternate']").attributes["href"]
  end

  def test_entry_urls_are_absolute_and_respect_baseurl
    site = build_site(entries: sample(1), config: { "baseurl" => "/repo" })
    feed = feed_for(site)

    assert_equal "https://example.org/repo/catalog/e1/", REXML::XPath.first(feed, "/feed/entry/id").text
  end

  def test_newest_entries_come_first_and_the_list_is_capped
    limit = CatalogTemplate::CatalogFeedGenerator::LIMIT
    feed = feed_for(build_site(entries: sample(limit + 5)))
    titles = REXML::XPath.match(feed, "/feed/entry/title").map(&:text)

    assert_equal limit, titles.size
    assert_equal "Entry #{limit + 5}", titles.first
  end

  def test_updated_wins_over_published_for_ordering_and_for_the_timestamp
    site = build_site(entries: [
                        { "slug" => "old-but-revised", "title" => "Revised",
                          "published" => "2024-01-01", "updated" => "2024-06-01" },
                        { "slug" => "newer", "title" => "Newer", "published" => "2024-02-01" }
                      ])
    feed = feed_for(site)

    assert_equal %w[Revised Newer], REXML::XPath.match(feed, "/feed/entry/title").map(&:text)
    entry = REXML::XPath.first(feed, "/feed/entry")
    assert_includes REXML::XPath.first(entry, "published").text, "2024-01-01"
    assert_includes REXML::XPath.first(entry, "updated").text, "2024-06-01"
    assert_includes REXML::XPath.first(feed, "/feed/updated").text, "2024-06-01"
  end

  def test_each_facet_value_becomes_a_category
    schema = {
      "entry" => { "path" => "catalog" },
      "fields" => [
        { "key" => "area", "facet" => true },
        { "key" => "stage", "facet" => true },
        { "key" => "notes", "facet" => false }
      ]
    }
    site = build_site(schema: schema, entries: [{
      "slug" => "e1", "title" => "E1", "published" => "2024-01-01",
      "area" => ["Translation & language access", "Outreach"], "stage" => "Live", "notes" => "Ignored"
    }])
    categories = REXML::XPath.match(feed_for(site), "/feed/entry/category")

    assert_equal ["translation-language-access", "outreach", "live"], categories.map { |c| c.attributes["term"] }
    assert_equal ["Translation & language access", "Outreach", "Live"], categories.map { |c| c.attributes["label"] }
  end

  def test_summaries_are_included_when_present
    site = build_site(entries: [{ "slug" => "e1", "title" => "E1", "summary" => "What it does." }])

    assert_equal "What it does.", REXML::XPath.first(feed_for(site), "/feed/entry/summary").text
  end

  def test_markup_in_a_title_or_summary_cannot_break_the_document
    site = build_site(entries: [{
      "slug" => "e1", "title" => "Fish & <chips>", "summary" => 'She said "hi" & left'
    }])
    feed = feed_for(site)

    assert_equal "Fish & <chips>", REXML::XPath.first(feed, "/feed/entry/title").text
    assert_equal 'She said "hi" & left', REXML::XPath.first(feed, "/feed/entry/summary").text
  end

  # -- site_base: where the absolute IRIs come from --------------------------

  def test_site_base_joins_url_and_baseurl_without_a_trailing_slash
    site = build_site(config: { "url" => "https://example.org/", "baseurl" => "/repo/" })

    assert_equal "https://example.org/repo", @generator.send(:site_base, site)
  end

  def test_site_base_falls_back_to_the_github_metadata_url
    site = build_site(config: { "url" => "" })
    site.config["github"] = { "url" => "https://owner.github.io/repo" }

    assert_equal "https://owner.github.io/repo", @generator.send(:site_base, site)
  end

  def test_site_base_ignores_a_github_value_that_is_not_a_hash
    site = build_site(config: { "url" => "" })
    site.config["github"] = nil

    assert_equal "", @generator.send(:site_base, site)
  end

  def test_a_configured_url_wins_over_github_metadata
    site = build_site(config: { "url" => "https://catalog.example.gov" })
    site.config["github"] = { "url" => "https://owner.github.io/repo" }

    assert_equal "https://catalog.example.gov", @generator.send(:site_base, site)
  end

  def test_with_no_url_at_all_the_feed_still_builds_with_relative_ids
    site = build_site(entries: sample(1), config: { "url" => "" })
    feed = feed_for(site)

    assert_equal "/catalog/e1/", REXML::XPath.first(feed, "/feed/entry/id").text
  end

  def test_an_entry_with_no_dates_still_renders
    feed = feed_for(build_site(entries: [{ "slug" => "e1", "title" => "E1" }]))
    entry = REXML::XPath.first(feed, "/feed/entry")

    assert_nil REXML::XPath.first(entry, "published")
    assert_equal "E1", REXML::XPath.first(entry, "title").text
  end
end
