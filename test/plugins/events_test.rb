# frozen_string_literal: true

# Unit tests for _plugins/events.rb's CatalogTemplate::EventsAggregator.
#
#   npm run test:ruby     (or: ruby -Itest test/plugins/events_test.rb)
#
# These run against a real Jekyll::Site rooted in an empty temp directory, not
# a Struct double: the generator now creates Jekyll::PageWithoutAFile objects,
# and Jekyll::Page#initialize reaches for `in_source_dir`, `in_theme_dir` and
# `frontmatter_defaults` on the way to setting `data.default_proc`. The temp
# source keeps `require_plugin_files` from loading this repo's own plugins and
# keeps the site's page list empty except for what a test puts there.

require "minitest/autorun"
require "jekyll"
require "date"
require "tmpdir"

require_relative "../../_plugins/events"

class EventsAggregatorTest < Minitest::Test
  def setup
    @generator = CatalogTemplate::EventsAggregator.new
    @tmp = Dir.mktmpdir("events-test")
  end

  def teardown
    FileUtils.remove_entry(@tmp) if @tmp && File.directory?(@tmp)
  end

  # @param events [Array] _data/events.yml contents
  # @param cohorts [Hash] _data/cohorts/*.yml contents, keyed by year
  # @param pages [Array<Jekyll::Page>] hand-written pages already in the site
  # @param modules [Hash] _data/site.yml's `modules` map
  # @return [Jekyll::Site]
  def build_site(events: [], cohorts: {}, pages: [], modules: nil)
    config = Jekyll.configuration(
      "source" => @tmp, "destination" => File.join(@tmp, "_site"), "quiet" => true
    )
    site = Jekyll::Site.new(config)
    site.data["events"] = events
    site.data["cohorts"] = cohorts
    site.data["site"] = { "modules" => modules } if modules
    pages.each { |page| site.pages << page }
    site
  end

  # A hand-written override file, as Jekyll would have read it.
  # @param site [Jekyll::Site]
  # @param path [String] page directory, e.g. "cohorts/2024/events/kickoff"
  # @param data [Hash] its front matter
  # @return [Jekyll::PageWithoutAFile]
  def page_at(site, path, data = {})
    page = Jekyll::PageWithoutAFile.new(site, site.source, path, "index.html")
    page.data.merge!(data)
    page
  end

  # @param site [Jekyll::Site]
  # @return [Hash{String => Hash}] normalized events keyed by name
  def by_name(site)
    site.data["events_all"].each_with_object({}) { |e, h| h[e["name"]] = e }
  end

  # -- aggregation ---------------------------------------------------------

  def test_merges_site_and_cohort_events_into_events_all
    site = build_site(
      events: [{ "name" => "Site Wide", "date" => "2020-01-01" }],
      cohorts: {
        2024 => { "events" => [{ "name" => "Cohort Kickoff", "date" => "2024-03-01" }] }
      }
    )
    @generator.generate(site)

    assert_equal ["Site Wide", "Cohort Kickoff"].sort, site.data["events_all"].map { |e| e["name"] }.sort
  end

  def test_sorts_by_date_then_name
    site = build_site(
      events: [
        { "name" => "Zebra", "date" => "2024-01-01" },
        { "name" => "Alpha", "date" => "2024-01-01" },
        { "name" => "Earlier", "date" => "2023-01-01" }
      ]
    )
    @generator.generate(site)

    dates_and_names = site.data["events_all"].map { |e| [e["date"], e["name"]] }
    assert_equal [["2023-01-01", "Earlier"], ["2024-01-01", "Alpha"], ["2024-01-01", "Zebra"]], dates_and_names
  end

  def test_tags_source_and_cohort
    site = build_site(
      events: [{ "name" => "Site Event", "date" => "2024-01-01" }],
      cohorts: { "2024" => { "events" => [{ "name" => "Cohort Event", "date" => "2024-01-01" }] } }
    )
    @generator.generate(site)

    assert_equal "site", by_name(site)["Site Event"]["source"]
    assert_nil by_name(site)["Site Event"]["cohort"]
    assert_equal "cohort", by_name(site)["Cohort Event"]["source"]
    assert_equal "2024", by_name(site)["Cohort Event"]["cohort"]
  end

  def test_ignores_entries_without_a_date_or_that_are_not_hashes
    site = build_site(events: [{ "name" => "No date" }, "not a hash", { "name" => "Has date", "date" => "2024-01-01" }])
    @generator.generate(site)

    assert_equal ["Has date"], site.data["events_all"].map { |e| e["name"] }
  end

  def test_ignores_cohort_entries_that_are_not_hashes
    site = build_site(cohorts: { "2024" => "not a hash" })
    @generator.generate(site)

    assert_equal [], site.data["events_all"]
  end

  # -- event_id ------------------------------------------------------------

  def test_event_id_prefers_id_then_slug_then_name
    assert_equal "the-id", @generator.event_id("id" => "the-id", "slug" => "the-slug", "name" => "The Name")
    assert_equal "the-slug", @generator.event_id("slug" => "the-slug", "name" => "The Name")
    assert_equal "the-name", @generator.event_id("name" => "The Name")
  end

  def test_event_id_slugifies_so_underscored_ids_match_their_page_url
    # The bug this replaced: Liquid slugified `scoping_clinic` to `scoping-clinic`
    # when building the URL while Ruby kept the underscore, so the page never
    # matched its data and rendered with no date or location.
    assert_equal "scoping-clinic", @generator.event_id("id" => "scoping_clinic", "name" => "Scoping clinic")
  end

  # -- generated detail pages ----------------------------------------------

  def test_generates_a_page_per_cohort_event
    site = build_site(
      cohorts: {
        "2024" => {
          "events" => [
            { "id" => "kickoff", "name" => "Kickoff", "date" => "2024-01-01",
              "time" => "9–11am", "location" => "Room 2", "description" => "Meet the cohort" }
          ]
        }
      }
    )
    @generator.generate(site)

    page = site.pages.find { |p| p.url == "/cohorts/2024/events/kickoff/" }
    refute_nil page
    assert_equal "event", page.data["layout"]
    assert_equal "Kickoff", page.data["title"]
    assert_equal "2024", page.data["cohort"]
    assert_equal "kickoff", page.data["event_id"]
    assert_equal "2024-01-01", page.data["event_date"]
    assert_equal "9–11am", page.data["event_time"]
    assert_equal "Room 2", page.data["event_location"]
    assert_equal "Meet the cohort", page.data["summary"]
    assert_equal true, page.data["generated"]
  end

  def test_page_url_is_always_set_for_a_cohort_event
    site = build_site(
      cohorts: { "2024" => { "events" => [{ "name" => "No Page Before", "date" => "2024-01-02" }] } }
    )
    @generator.generate(site)

    assert_equal "/cohorts/2024/events/no-page-before/", by_name(site)["No Page Before"]["page_url"]
  end

  def test_page_url_is_written_back_onto_the_raw_cohort_data
    cohorts = { "2024" => { "events" => [{ "id" => "kickoff", "name" => "Kickoff", "date" => "2024-01-01" }] } }
    site = build_site(cohorts: cohorts)
    @generator.generate(site)

    assert_equal "/cohorts/2024/events/kickoff/", cohorts["2024"]["events"].first["page_url"]
  end

  def test_site_events_never_get_a_detail_page
    site = build_site(events: [{ "name" => "Site Wide", "date" => "2024-01-01" }])
    @generator.generate(site)

    assert_nil by_name(site)["Site Wide"]["page_url"]
    assert_empty site.pages
  end

  # -- hand-written overrides ----------------------------------------------

  def test_a_hand_written_page_wins_and_is_not_duplicated
    site = build_site
    site.pages << page_at(site, "cohorts/2024/events/kickoff",
                          "layout" => "event", "title" => "Custom Title")
    site.data["cohorts"] = {
      "2024" => { "events" => [{ "id" => "kickoff", "name" => "Kickoff", "date" => "2024-01-01" }] }
    }
    @generator.generate(site)

    matches = site.pages.select { |p| p.url == "/cohorts/2024/events/kickoff/" }
    assert_equal 1, matches.size
    assert_equal "Custom Title", matches.first.data["title"]
    refute matches.first.data["generated"]
  end

  def test_a_hand_written_page_inherits_the_fields_it_does_not_declare
    site = build_site
    site.pages << page_at(site, "cohorts/2024/events/kickoff", "layout" => "event", "title" => "Custom Title")
    site.data["cohorts"] = {
      "2024" => {
        "events" => [{ "id" => "kickoff", "name" => "Kickoff", "date" => "2024-01-01", "location" => "Room 2" }]
      }
    }
    @generator.generate(site)

    page = site.pages.first
    assert_equal "2024-01-01", page.data["event_date"]
    assert_equal "Room 2", page.data["event_location"]
  end

  # -- module gate ---------------------------------------------------------

  def test_no_pages_are_generated_when_the_cohorts_module_is_off
    site = build_site(
      cohorts: { "2024" => { "events" => [{ "id" => "kickoff", "name" => "Kickoff", "date" => "2024-01-01" }] } },
      modules: { "cohorts" => false }
    )
    @generator.generate(site)

    assert_empty site.pages
    assert_nil by_name(site)["Kickoff"]["page_url"]
  end

  def test_pages_are_generated_when_the_modules_map_says_nothing_about_cohorts
    site = build_site(
      cohorts: { "2024" => { "events" => [{ "id" => "kickoff", "name" => "Kickoff", "date" => "2024-01-01" }] } },
      modules: { "events" => false }
    )
    @generator.generate(site)

    assert_equal 1, site.pages.size
  end

  # -- dates ---------------------------------------------------------------

  def test_past_is_computed_relative_to_today
    site = build_site(
      events: [
        { "name" => "Past", "date" => (Date.today - 1).iso8601 },
        { "name" => "Future", "date" => (Date.today + 1).iso8601 }
      ]
    )
    @generator.generate(site)

    assert_equal true, by_name(site)["Past"]["past"]
    assert_equal false, by_name(site)["Future"]["past"]
  end

  def test_past_uses_end_date_when_present
    site = build_site(
      events: [
        { "name" => "Multi-day", "date" => (Date.today - 5).iso8601, "end_date" => (Date.today + 5).iso8601 }
      ]
    )
    @generator.generate(site)

    assert_equal false, site.data["events_all"].first["past"]
  end

  def test_unparsable_dates_do_not_raise
    site = build_site(events: [{ "name" => "Bad date", "date" => "not-a-date" }])
    @generator.generate(site)

    event = site.data["events_all"].first
    assert_nil event["date"]
    assert_equal false, event["past"]
  end
end
