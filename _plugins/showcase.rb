# frozen_string_literal: true

# The showcase landing build. `scripts/build_showcase.mjs` builds this
# repository several times: once per preset as a complete example site, and
# once as the landing page that introduces them. Every build is the same
# repository, so the landing would otherwise ship a second copy of the catalog,
# the submit form, the governance page and the feeds — at the root, above the
# examples, indexed and crawlable.
#
# This hook reduces a landing build to the three pages that belong to it: the
# landing itself, the wizard (so "Configure your own" works from the landing)
# and the 404. Everything else a build produces from a page — the catalog, the
# entry pages, the modules, `/entries.json` — is dropped. Static files (assets,
# images) are untouched: the landing uses them.
#
# Registered on `:site, :post_read`, like `_plugins/modules.rb`, so it runs
# before any generator: the facet pages, the search index and the Atom feed all
# read `site.pages` and so find nothing to build. `search_index.rb` and
# `catalog_feed.rb` also ask `landing?` directly, since a generator that
# publishes a static file does not need a page to do it.
#
# Input: `site.config["showcase"]` (written by the builder as
# `_config.showcase.yml`) and `site.pages`. Output: mutates `site.pages`.
# Absent on an ordinary build — a fork, `jekyll serve`, CI — and then nothing
# here does anything.
module CatalogTemplate
  module Showcase
    # The only pages a landing build ships. `/` is the landing (index.md
    # branches on the role), `/setup/` is the wizard, `/404.html` is what Pages
    # serves for everything the examples do not own.
    LANDING_PAGES = ["/", "/setup/", "/404.html"].freeze

    # @param site [Jekyll::Site] (or an equivalent double: responds to `config`)
    # @return [Boolean] whether this build is the showcase landing.
    def self.landing?(site)
      (site.config["showcase"] || {})["role"].to_s == "landing"
    end

    # @param site [Jekyll::Site]
    # @return [void]
    def self.keep_landing_pages(site)
      return unless landing?(site)

      site.pages.select! { |page| LANDING_PAGES.include?(page.url.to_s) }
      # The entries' screenshots are static files, not pages; nothing on the
      # landing links to them, so they should not ride in its artifact either.
      entry_path = ((site.data["schema"] || {})["entry"] || {})["path"].to_s
      entry_path = "catalog" if entry_path.empty?
      site.static_files.reject! { |file| file.relative_path.to_s.delete_prefix("/").start_with?("#{entry_path}/") }
    end
  end
end

Jekyll::Hooks.register :site, :post_read do |site|
  CatalogTemplate::Showcase.keep_landing_pages(site)
end
