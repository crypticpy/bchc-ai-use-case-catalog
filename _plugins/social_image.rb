# Site-wide social preview image.
#
# jekyll-seo-tag only emits og:image / twitter:card when the page sets `image:`
# in front matter, and it always emits a twitter:card of its own — so emitting
# meta tags by hand in head.html would duplicate them. Instead, feed the
# configured default into each page's front matter before rendering and let
# jekyll-seo-tag own the whole tag set. A page that brings its own `image:`
# keeps it. OG scrapers require absolute URLs; with `url:` unset in _config.yml
# this degrades to a site-relative path that scrapers ignore, which is no worse
# than having no default at all.
module CatalogTemplate
  module SocialImage
    def self.apply_default(site)
      image = site.data.dig("site", "social", "og_image").to_s.strip
      return if image.empty?

      site.pages.each do |page|
        page.data["image"] ||= image
      end
    end
  end
end

# :pre_render rather than :post_read — generators (facet pages, showcase
# copies) append pages after :post_read fires, and they need the default too.
Jekyll::Hooks.register :site, :pre_render do |site, _payload|
  CatalogTemplate::SocialImage.apply_default(site)
end
