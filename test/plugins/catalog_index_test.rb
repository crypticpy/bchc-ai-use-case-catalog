# frozen_string_literal: true

# Unit tests for _plugins/catalog_index.rb's CatalogTemplate::CatalogIndexGenerator.
#
#   npm run test:ruby     (or: ruby -Itest test/plugins/catalog_index_test.rb)
#
# Two layers: synthetic sites that pin the IDF scoring, the tiebreak and the
# recency top-up, and one integration case that runs the generator over the
# repo's real `_data/schema.yml` and `catalog/*/index.md` front matter, because
# the point of the change is the ranking a reader actually sees.

require "minitest/autorun"
require "jekyll"
require "tmpdir"
require "yaml"

require_relative "../../_plugins/catalog_index"

class CatalogIndexGeneratorTest < Minitest::Test
  REPO = File.expand_path("../..", __dir__)

  def setup
    @generator = CatalogTemplate::CatalogIndexGenerator.new
    @tmp = Dir.mktmpdir("catalog-index-test")
  end

  def teardown
    FileUtils.remove_entry(@tmp) if @tmp && File.directory?(@tmp)
  end

  # @param fields [Array<Hash>] schema facet fields
  # @param entries [Array<Hash>] entry front matter, each needing "slug"
  # @return [Jekyll::Site]
  def build_site(fields: [], entries: [])
    config = Jekyll.configuration(
      "source" => @tmp, "destination" => File.join(@tmp, "_site"), "quiet" => true
    )
    site = Jekyll::Site.new(config)
    site.data["schema"] = { "fields" => fields }
    entries.each do |data|
      page = Jekyll::PageWithoutAFile.new(site, site.source, "catalog/#{data['slug']}", "index.html")
      page.data.merge!({ "layout" => "entry", "title" => data["slug"] }.merge(data))
      site.pages << page
    end
    site
  end

  # @param site [Jekyll::Site]
  # @param slug [String]
  # @return [Array<String>] the related slugs, in rank order
  def related_slugs(site, slug)
    page = site.pages.find { |p| p.data["slug"] == slug }
    page.data["related"].map { |r| r["url"].split("/").reject(&:empty?).last }
  end

  # -- entry_pages ---------------------------------------------------------

  def test_exposes_entry_pages_in_site_pages_order
    site = build_site(entries: [{ "slug" => "b" }, { "slug" => "a" }])
    site.pages << Jekyll::PageWithoutAFile.new(site, site.source, "about", "index.html")
    @generator.generate(site)

    assert_equal %w[b a], site.data["entry_pages"].map { |p| p.data["slug"] }
  end

  def test_leaves_a_user_supplied_entry_pages_data_file_alone
    site = build_site(entries: [{ "slug" => "a" }])
    site.data["entry_pages"] = "mine"
    @generator.generate(site)

    assert_equal "mine", site.data["entry_pages"]
  end

  # -- IDF scoring ---------------------------------------------------------

  def test_a_rare_shared_value_outranks_a_universal_one
    fields = [
      { "key" => "area", "label" => "Area", "facet" => true },
      { "key" => "stage", "label" => "Stage", "facet" => true }
    ]
    # Everything is "Live", so `stage` says nothing; only `me` and `rare` share
    # the uncommon area, while `common` shares nothing but the universal stage.
    entries = [
      { "slug" => "me", "area" => "Translation", "stage" => "Live" },
      { "slug" => "common", "area" => "Everything else", "stage" => "Live" },
      { "slug" => "rare", "area" => "Translation", "stage" => "Live" },
      { "slug" => "filler-1", "area" => "Everything else", "stage" => "Live" },
      { "slug" => "filler-2", "area" => "Everything else", "stage" => "Live" }
    ]
    site = build_site(fields: fields, entries: entries)
    @generator.generate(site)

    assert_equal "rare", related_slugs(site, "me").first
  end

  def test_a_value_on_every_entry_scores_nothing
    fields = [{ "key" => "stage", "label" => "Stage", "facet" => true }]
    site = build_site(fields: fields, entries: [
                        { "slug" => "a", "stage" => "Live" },
                        { "slug" => "b", "stage" => "Live" }
                      ])
    @generator.generate(site)

    page = site.pages.find { |p| p.data["slug"] == "a" }
    assert_equal 0.0, page.data["related"].first["score"]
    assert_empty page.data["related"].first["shared"]
  end

  def test_field_weight_scales_the_contribution
    fields = [
      # Lower weight = more important, as in the card slots: area outranks org.
      { "key" => "area", "label" => "Area", "facet" => true, "weight" => 1 },
      { "key" => "org", "label" => "Org", "facet" => true, "weight" => 9 }
    ]
    entries = [
      { "slug" => "me", "area" => "Translation", "org" => "Health" },
      { "slug" => "same-area", "area" => "Translation", "org" => "Other" },
      { "slug" => "same-org", "area" => "Other", "org" => "Health" },
      { "slug" => "filler", "area" => "Filler", "org" => "Filler" }
    ]
    site = build_site(fields: fields, entries: entries)
    @generator.generate(site)

    assert_equal %w[same-area same-org filler], related_slugs(site, "me")
  end

  def test_multi_valued_fields_accumulate
    fields = [{ "key" => "tags", "label" => "Tags", "facet" => true }]
    entries = [
      { "slug" => "me", "tags" => %w[a b] },
      { "slug" => "one", "tags" => %w[a] },
      { "slug" => "two", "tags" => %w[a b] },
      { "slug" => "none", "tags" => %w[z] }
    ]
    site = build_site(fields: fields, entries: entries)
    @generator.generate(site)

    assert_equal %w[two one none], related_slugs(site, "me")
  end

  # -- determinism and shape -----------------------------------------------

  def test_ties_are_broken_on_url_not_page_order
    fields = [{ "key" => "area", "label" => "Area", "facet" => true }]
    entries = [
      { "slug" => "me", "area" => "Translation" },
      { "slug" => "zebra", "area" => "Translation" },
      { "slug" => "apple", "area" => "Translation" },
      { "slug" => "filler", "area" => "Other" }
    ]
    site = build_site(fields: fields, entries: entries)
    @generator.generate(site)

    assert_equal %w[apple zebra filler], related_slugs(site, "me")
  end

  def test_every_entry_gets_a_full_list_even_with_nothing_in_common
    fields = [{ "key" => "area", "label" => "Area", "facet" => true }]
    entries = (1..5).map { |n| { "slug" => "e#{n}", "area" => "Area #{n}", "published" => "2024-01-0#{n}" } }
    site = build_site(fields: fields, entries: entries)
    @generator.generate(site)

    entries.each do |entry|
      assert_equal 4, related_slugs(site, entry["slug"]).size
    end
    # The top-up is newest first, and never includes the entry itself.
    assert_equal %w[e4 e3 e2 e1], related_slugs(site, "e5")
  end

  def test_shared_carries_the_reason_for_the_match
    fields = [{
      "key" => "primary_capability", "label" => "Capability", "facet" => true,
      "option_meta" => { "Translation & language access" => { "short" => "Translation" } }
    }]
    site = build_site(fields: fields, entries: [
                        { "slug" => "a", "primary_capability" => "Translation & language access" },
                        { "slug" => "b", "primary_capability" => "Translation & language access" },
                        { "slug" => "c", "primary_capability" => "Something else" }
                      ])
    @generator.generate(site)

    shared = site.pages.first.data["related"].first["shared"].first
    # Hyphenated key + slugified value are what the filter URL contract needs.
    assert_equal "primary-capability", shared["key"]
    assert_equal "translation-language-access", shared["slug"]
    assert_equal "Capability", shared["label"]
    assert_equal "Translation & language access", shared["value"]
    assert_equal "Translation", shared["short"]
  end

  def test_short_falls_back_to_the_full_value
    fields = [{ "key" => "area", "label" => "Area", "facet" => true }]
    site = build_site(fields: fields, entries: [
                        { "slug" => "a", "area" => "Translation" },
                        { "slug" => "b", "area" => "Translation" },
                        { "slug" => "c", "area" => "Other" }
                      ])
    @generator.generate(site)

    assert_equal "Translation", site.pages.first.data["related"].first["shared"].first["short"]
  end

  def test_non_facet_fields_are_ignored
    fields = [{ "key" => "summary", "label" => "Summary", "facet" => false }]
    site = build_site(fields: fields, entries: [
                        { "slug" => "a", "summary" => "Same" },
                        { "slug" => "b", "summary" => "Same" }
                      ])
    @generator.generate(site)

    assert_empty site.pages.first.data["related"].first["shared"]
  end

  def test_blank_values_do_not_create_a_shared_reason
    fields = [{ "key" => "area", "label" => "Area", "facet" => true }]
    site = build_site(fields: fields, entries: [
                        { "slug" => "a", "area" => "  " },
                        { "slug" => "b", "area" => nil },
                        { "slug" => "c", "area" => "Real" }
                      ])
    @generator.generate(site)

    assert_empty site.pages.first.data["related"].first["shared"]
  end

  def test_a_site_with_no_entries_does_not_raise
    site = build_site
    @generator.generate(site)

    assert_equal [], site.data["entry_pages"]
  end

  # -- the real catalog ----------------------------------------------------

  # A shape check only. Asserting a named winner here would couple CI to the
  # current contents of catalog/ and turn red the day a contributor adds an
  # entry (it did, on a real submission) — the ranking itself is covered by the
  # fixture corpora above.
  def test_the_sample_catalog_builds_and_relates_without_self_references
    schema = YAML.load_file(File.join(REPO, "_data", "schema.yml"))
    path = schema.dig("entry", "path") || "catalog"
    front_matter = Dir[File.join(REPO, path, "*", "index.md")].sort.map do |file|
      YAML.safe_load(File.read(file).split(/^---\s*$/, 3)[1], permitted_classes: [Date, Time])
    end
    skip "no sample entries in this checkout" if front_matter.size < 5

    site = build_site(fields: schema["fields"], entries: front_matter)
    @generator.generate(site)

    front_matter.each do |fm|
      related = related_slugs(site, fm["slug"])
      refute_empty related, "#{fm["slug"]} has no related entries"
      refute_includes related, fm["slug"]
      assert related.size <= front_matter.size - 1
    end
  end
end
