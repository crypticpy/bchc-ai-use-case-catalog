# frozen_string_literal: true

require "fileutils"
require "time"
require "date"

require_relative "showcase"

# Generates an Atom feed of the newest catalog entries at
# `/<schema.entry.path>/feed.xml` (so `/catalog/feed.xml` by default).
#
# This replaces `jekyll-feed`, which shipped an empty document here: it
# syndicates posts and collections, and catalog entries are `Jekyll::Page`s, so
# the feed advertised in <head> contained a title, a subtitle and zero entries,
# forever. Making `catalog/` a collection would light `jekyll-feed` up, but
# `schema.entry.path` is user-configurable while a collection label is fixed in
# `_config.yml`, and the issue-to-PR scripts, the validators and the workflows
# all address entries by path — so the 60 lines below are the cheaper answer.
#
# Each entry carries a `<category term>` per facet value, which is what makes a
# catalog feed genuinely useful: a subscriber can filter by area or stage in
# their reader.
#
# Runs as a Jekyll::Generator with `priority :low`, after
# `_plugins/catalog_index.rb` has published `site.data["entry_pages"]`. Output:
# a CatalogFeedFile added to `site.static_files`, written at Jekyll's normal
# static-file write pass, exactly like `_plugins/search_index.rb`.
module CatalogTemplate
  # A Jekyll::StaticFile whose content is computed in memory.
  class CatalogFeedFile < Jekyll::StaticFile
    # @param site [Jekyll::Site]
    # @param dir [String] site-relative directory ("catalog")
    # @param body [String] the rendered Atom document
    def initialize(site, dir, body)
      # Leading slash to match how Jekyll's reader builds its own static files,
      # so `relative_path` reads "/catalog/feed.xml" like every other one.
      super(site, site.source, "/#{dir}", "feed.xml")
      @body = body
    end

    # @param dest [String] destination directory
    # @return [Boolean] true on success (Jekyll::StaticFile#write contract)
    def write(dest)
      dest_path = destination(dest)
      FileUtils.mkdir_p(File.dirname(dest_path))
      File.write(dest_path, @body)
      true
    end
  end

  class CatalogFeedGenerator < Jekyll::Generator
    safe true
    priority :low

    # How many entries the feed carries.
    LIMIT = 25

    # @param site [Jekyll::Site]
    # @return [void]
    def generate(site)
      # The showcase landing has no catalog to syndicate; each example has its own feed.
      return if CatalogTemplate::Showcase.landing?(site)

      entries = newest(site, LIMIT)
      return if entries.empty?

      dir = (site.data.dig("schema", "entry", "path") || "catalog").to_s
      site.static_files << CatalogFeedFile.new(site, dir, render(site, dir, entries))
    end

    private

    # The newest entries, by `updated` where present and `published` otherwise.
    # @param site [Jekyll::Site]
    # @param limit [Integer]
    # @return [Array<Jekyll::Page>]
    def newest(site, limit)
      pages = site.data["entry_pages"]
      pages = site.pages.select { |p| p.data["layout"] == "entry" } unless pages.is_a?(Array)
      pages.sort_by { |page| [stamp(page).to_s, page.url.to_s] }.reverse.first(limit)
    end

    # @param page [Jekyll::Page]
    # @return [Object, nil] the freshest date the entry declares
    def stamp(page)
      page.data["updated"] || page.data["published"]
    end

    # @param site [Jekyll::Site]
    # @param dir [String] entry path
    # @param entries [Array<Jekyll::Page>]
    # @return [String] an Atom 1.0 document
    def render(site, dir, entries)
      cfg = site.data["site"] || {}
      base = site_base(site)
      self_url = "#{base}/#{dir}/feed.xml"
      home_url = "#{base}/#{dir}/"
      facets = Array(site.data.dig("schema", "fields")).select { |f| f["facet"] }.map { |f| f["key"] }
      updated = entries.map { |page| rfc3339(stamp(page)) }.compact.max

      body = +%(<?xml version="1.0" encoding="utf-8"?>\n)
      body << %(<feed xmlns="http://www.w3.org/2005/Atom">\n)
      body << "  <title>#{esc(cfg['name'] || site.config['title'])}</title>\n"
      body << "  <subtitle>#{esc(cfg['description'] || site.config['description'])}</subtitle>\n"
      body << "  <id>#{esc(home_url)}</id>\n"
      body << %(  <link rel="self" type="application/atom+xml" href="#{esc(self_url)}"/>\n)
      body << %(  <link rel="alternate" type="text/html" href="#{esc(home_url)}"/>\n)
      body << "  <updated>#{esc(updated)}</updated>\n" if updated
      entries.each { |page| body << entry_xml(page, base, facets) }
      body << "</feed>\n"
      body
    end

    # The absolute site root every `<id>` and `href` in the feed hangs off.
    #
    # Atom requires `<id>` to be an IRI, so a feed built with `url: ""` (what
    # `_config.yml` ships) is not a valid document — its ids and its `self`
    # link are site-relative. In practice the deploy never hits that case:
    # `.github/workflows/pages.yml` works out the Pages origin (CNAME, a
    # `<user>.github.io` repo, or `<owner>.github.io/<repo>`) and builds with an
    # overlay `_config.ci.yml` that sets both `url` and `baseurl`, so the
    # published feed is absolute. This falls back to `site.github.url` for a
    # fork that runs `jekyll-github-metadata` instead of that workflow, and
    # warns once when there is nothing to use — a local `jekyll build` still
    # produces a feed, it just is not portable, which is the correct trade for
    # a dev build.
    # @param site [Jekyll::Site]
    # @return [String] origin + baseurl, no trailing slash
    def site_base(site)
      url = site.config["url"].to_s.strip
      if url.empty?
        # A Drop when jekyll-github-metadata is installed, nil when it is not.
        github = site.config["github"]
        url = github["url"].to_s.strip if github.respond_to?(:[])
      end
      if url.empty? && !@warned
        @warned = true
        Jekyll.logger.warn "Catalog feed:", "no `url` in _config.yml — feed <id>s will be relative. " \
                                            "The Pages workflow sets it at build time; set it yourself " \
                                            "for any other deploy."
      end
      url.chomp("/") + site.config["baseurl"].to_s.chomp("/")
    end

    # @param page [Jekyll::Page]
    # @param base [String] absolute site root
    # @param facets [Array<String>] facet field keys
    # @return [String] one <entry> element
    def entry_xml(page, base, facets)
      url = base + page.url
      xml = +"  <entry>\n"
      xml << "    <title>#{esc(page.data['title'])}</title>\n"
      xml << "    <id>#{esc(url)}</id>\n"
      xml << %(    <link rel="alternate" type="text/html" href="#{esc(url)}"/>\n)
      published = rfc3339(page.data["published"])
      xml << "    <published>#{esc(published)}</published>\n" if published
      stamped = rfc3339(stamp(page))
      xml << "    <updated>#{esc(stamped)}</updated>\n" if stamped
      xml << "    <summary>#{esc(page.data['summary'])}</summary>\n" if page.data["summary"]
      facets.each do |key|
        Array(page.data[key]).flatten.compact.each do |value|
          text = value.to_s.strip
          next if text.empty?

          xml << %(    <category term="#{esc(Jekyll::Utils.slugify(text))}" label="#{esc(text)}"/>\n)
        end
      end
      xml << "  </entry>\n"
      xml
    end

    # @param value [Date, Time, String, nil]
    # @return [String, nil] an RFC 3339 timestamp
    def rfc3339(value)
      case value
      when nil then nil
      when Time then value.iso8601
      when DateTime then value.to_time.iso8601
      when Date then Time.new(value.year, value.month, value.day).iso8601
      else
        begin
          Time.parse(value.to_s).iso8601
        rescue ArgumentError
          nil
        end
      end
    end

    # @param value [Object]
    # @return [String] XML-escaped text, safe in an element or an attribute
    def esc(value)
      value.to_s.gsub("&", "&amp;").gsub("<", "&lt;").gsub(">", "&gt;").gsub('"', "&quot;")
    end
  end
end
