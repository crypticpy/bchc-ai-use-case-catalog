# frozen_string_literal: true

# Module toggles (_data/site.yml → modules) hide navigation links, but the
# pages themselves would still be built and indexed. This hook removes pages
# that belong to a disabled module so they never ship (or show up in search /
# the sitemap). Turn a module back on and the pages return on the next build.
#
# Registered on Jekyll's `:site, :post_read` hook, i.e. right after Jekyll has
# read all pages/data and before any generator (including the events and
# search-index generators) runs, so downstream generators never see pages
# from a disabled module.
# Input: `site.data["site"]["modules"]` (module name => bool), `_data/modules.yml`
# (module name => path prefixes, see that file), and `site.pages`.
# Output: mutates `site.pages` in place (rejects the disabled ones).
module CatalogTemplate
  module ModulePages
    # Pages the catalog module owns beyond the entry folder itself. `/compare/`
    # exists only to lay catalog entries side by side, so a site with the catalog
    # switched off should not ship it, and it is a fixed path rather than a
    # configurable one — hence here rather than in _data/modules.yml, which a
    # fork edits.
    CATALOG_EXTRA_PATHS = ["/compare/"].freeze

    # Path prefixes each module owns, keyed by module name. `catalog` is
    # derived from the schema's entry path rather than _data/modules.yml,
    # since it must track the configured entry folder.
    # @param site_data [Hash] `site.data` (or an equivalent double in tests)
    # @return [Hash{String => Array<String>}]
    def self.module_paths(site_data)
      configured = site_data["modules"] || {}
      paths = configured.each_with_object({}) { |(name, prefixes), out| out[name.to_s] = Array(prefixes) }
      entry_path = site_data.dig("schema", "entry", "path") || "catalog"
      paths["catalog"] = ["/#{entry_path}/"] + CATALOG_EXTRA_PATHS
      paths
    end

    # Removes every page under a disabled module's path prefixes.
    # @param site [Jekyll::Site] (or an equivalent double: responds to `data` and `pages`)
    # @return [void]
    def self.disable_pages(site)
      modules = (site.data["site"] || {})["modules"] || {}
      scoped = module_paths(site.data)
      disabled = scoped.select { |name, _| modules.key?(name) && !modules[name] }.values.flatten
      return if disabled.empty?

      site.pages.reject! do |page|
        url = page.url.to_s
        disabled.any? { |prefix| url.start_with?(prefix) }
      end
    end
  end
end

Jekyll::Hooks.register :site, :post_read do |site|
  CatalogTemplate::ModulePages.disable_pages(site)
end
