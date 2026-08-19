# frozen_string_literal: true

# Unit tests for _plugins/modules.rb's CatalogTemplate::ModulePages.
#
#   npm run test:ruby     (or: ruby -Itest test/plugins/modules_test.rb)
#
# `jekyll` must be loaded first: the plugin calls `Jekyll::Hooks.register` at
# load time (registering against the real Jekyll::Hooks event queue, but that
# registration is never triggered here — the tests call
# `CatalogTemplate::ModulePages.disable_pages` directly instead, against a
# lightweight `ModulesFakeSite` double). `module_paths`/`disable_pages` only touch
# `site.data` and `site.pages`, so a double is enough; no real Jekyll::Site
# is built.

require "minitest/autorun"
require "jekyll"

require_relative "../../_plugins/modules"

ModulesFakeSite = Struct.new(:data, :pages) unless defined?(ModulesFakeSite)
ModulesFakePage = Struct.new(:url) unless defined?(ModulesFakePage)

class ModulePagesTest < Minitest::Test
  def build_site(modules: {}, modules_data: {}, schema: {}, pages: [])
    data = { "site" => { "modules" => modules }, "modules" => modules_data, "schema" => schema }
    ModulesFakeSite.new(data, pages)
  end

  # -- module_paths -------------------------------------------------------

  def test_module_paths_reads_prefixes_from_modules_data
    data = { "modules" => { "events" => ["/events/"], "cohorts" => ["/cohorts/"] }, "schema" => {} }
    paths = CatalogTemplate::ModulePages.module_paths(data)
    assert_equal ["/events/"], paths["events"]
    assert_equal ["/cohorts/"], paths["cohorts"]
  end

  def test_module_paths_derives_catalog_from_schema_entry_path
    data = { "modules" => {}, "schema" => { "entry" => { "path" => "projects" } } }
    assert_equal ["/projects/", "/compare/"], CatalogTemplate::ModulePages.module_paths(data)["catalog"]
  end

  def test_module_paths_defaults_catalog_to_slash_catalog_slash_when_schema_is_missing
    assert_equal ["/catalog/", "/compare/"], CatalogTemplate::ModulePages.module_paths({})["catalog"]
  end

  def test_module_paths_does_not_let_modules_data_override_catalog
    data = { "modules" => { "catalog" => ["/should-be-ignored/"] }, "schema" => { "entry" => { "path" => "catalog" } } }
    assert_equal ["/catalog/", "/compare/"], CatalogTemplate::ModulePages.module_paths(data)["catalog"]
  end

  def test_module_paths_keeps_compare_with_the_catalog_whatever_the_entry_folder_is_called
    # /compare/ is not under the entry folder, so it needs naming explicitly or a
    # catalog-less site ships a page that can never fill.
    data = { "modules" => {}, "schema" => { "entry" => { "path" => "projects" } } }
    assert_includes CatalogTemplate::ModulePages.module_paths(data)["catalog"], "/compare/"
  end

  # -- disable_pages --------------------------------------------------------

  def test_disable_pages_removes_pages_under_a_disabled_modules_prefix
    site = build_site(
      modules: { "events" => false },
      modules_data: { "events" => ["/events/"] },
      pages: [ModulesFakePage.new("/events/summer-social/"), ModulesFakePage.new("/about/")]
    )
    CatalogTemplate::ModulePages.disable_pages(site)
    assert_equal ["/about/"], site.pages.map(&:url)
  end

  def test_disable_pages_leaves_pages_alone_when_module_is_enabled
    site = build_site(
      modules: { "events" => true },
      modules_data: { "events" => ["/events/"] },
      pages: [ModulesFakePage.new("/events/summer-social/"), ModulesFakePage.new("/about/")]
    )
    CatalogTemplate::ModulePages.disable_pages(site)
    assert_equal ["/events/summer-social/", "/about/"], site.pages.map(&:url)
  end

  def test_disable_pages_ignores_a_module_absent_from_the_toggle_map
    # A module with path data but no boolean in _data/site.yml's `modules:`
    # is left alone rather than treated as disabled.
    site = build_site(
      modules: {},
      modules_data: { "events" => ["/events/"] },
      pages: [ModulesFakePage.new("/events/summer-social/")]
    )
    CatalogTemplate::ModulePages.disable_pages(site)
    assert_equal ["/events/summer-social/"], site.pages.map(&:url)
  end

  def test_disable_pages_drops_disabled_catalog_pages_using_the_schema_path
    site = build_site(
      modules: { "catalog" => false },
      schema: { "entry" => { "path" => "projects" } },
      pages: [ModulesFakePage.new("/projects/some-entry/"), ModulesFakePage.new("/about/")]
    )
    CatalogTemplate::ModulePages.disable_pages(site)
    assert_equal ["/about/"], site.pages.map(&:url)
  end

  def test_disable_pages_drops_compare_with_the_catalog
    site = build_site(
      modules: { "catalog" => false },
      schema: { "entry" => { "path" => "projects" } },
      pages: [ModulesFakePage.new("/compare/"), ModulesFakePage.new("/about/")]
    )
    CatalogTemplate::ModulePages.disable_pages(site)
    assert_equal ["/about/"], site.pages.map(&:url)
  end

  def test_disable_pages_keeps_compare_while_the_catalog_is_on
    site = build_site(
      modules: { "catalog" => true },
      schema: { "entry" => { "path" => "projects" } },
      pages: [ModulesFakePage.new("/compare/")]
    )
    CatalogTemplate::ModulePages.disable_pages(site)
    assert_equal ["/compare/"], site.pages.map(&:url)
  end

  def test_disable_pages_is_a_noop_when_nothing_is_disabled
    site = build_site(modules: { "events" => true }, pages: [ModulesFakePage.new("/events/x/")])
    CatalogTemplate::ModulePages.disable_pages(site)
    assert_equal ["/events/x/"], site.pages.map(&:url)
  end
end
