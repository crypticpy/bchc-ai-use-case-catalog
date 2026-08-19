# frozen_string_literal: true

require "date"

# Aggregates events from _data/events.yml (site-wide) and every _data/cohorts/YYYY.yml
# into a single normalized, date-sorted list exposed as `site.data.events_all`.
# Each item: name, date (YYYY-MM-DD), end_date, time, location, url, description,
# type, source ("site" | "cohort"), cohort, page_url (detail page), past (bool).
#
# It also gives every cohort event a detail page. A cohort declares its events in
# `_data/cohorts/<year>.yml`; writing a matching stub file per event by hand is
# the kind of bookkeeping nobody does, and the events that lacked one rendered as
# dead text on the cohort page with nothing saying why. So each cohort event gets
# a `Jekyll::PageWithoutAFile` at `/cohorts/<year>/events/<id>/`, and a real file
# under `cohorts/<year>/events/<id>/` overrides it — the file wins for anything it
# declares and inherits date/time/location/attachments from the data file for
# anything it leaves out. `ev["page_url"]` is written back onto the raw event hash
# in `site.data.cohorts` as well, so the cohort layout and the timeline include can
# print a link instead of each re-deriving the URL and scanning `site.pages` for it.
#
# Runs as a Jekyll::Generator (the `generate` hook, priority :high so it runs
# before other generators/pages that read `site.data.events_all` or the pages it
# adds, e.g. the events index and the search index). Input: `site.data["events"]`,
# `site.data["cohorts"]` and `site.data["site"]["modules"]["cohorts"]`. Output:
# `site.data["events_all"]`, `page_url` on each raw cohort event, and one page per
# cohort event appended to `site.pages`.
module CatalogTemplate
  class EventsAggregator < Jekyll::Generator
    safe true
    priority :high

    # Builds the normalized event list and the cohort event pages.
    # @param site [Jekyll::Site]
    # @return [void]
    def generate(site)
      today = Date.today
      events = []

      Array(site.data["events"]).each do |ev|
        next unless ev.is_a?(Hash) && ev["date"]

        events << normalize(ev, "site", nil, nil, today)
      end

      emit = cohorts_enabled?(site)
      pages_by_url = site.pages.each_with_object({}) { |page, out| out[page.url.to_s] = page }

      (site.data["cohorts"] || {}).each do |year, data|
        next unless data.is_a?(Hash)

        Array(data["events"]).each do |ev|
          next unless ev.is_a?(Hash) && ev["date"]

          page_url = resolve_page(site, pages_by_url, year.to_s, ev, emit)
          ev["page_url"] = page_url
          events << normalize(ev, "cohort", year.to_s, page_url, today)
        end
      end

      site.data["events_all"] = events.sort_by { |e| [e["date"], e["name"].to_s] }
    end

    # The one place an event's id is derived. It used to be computed three
    # different ways (here, in _layouts/event.html and in _includes/timeline.html)
    # and they disagreed: Liquid slugified whichever value won, so an id of
    # `scoping_clinic` became `scoping-clinic` in the layout, stayed
    # `scoping_clinic` here, and the page rendered with no date or location.
    # @param ev [Hash] raw event data
    # @return [String] slug used in the event's URL and as `event_id`
    def event_id(ev)
      Jekyll::Utils.slugify((ev["id"] || ev["slug"] || ev["name"]).to_s)
    end

    private

    # @param site [Jekyll::Site]
    # @return [Boolean] false only when the cohorts module is explicitly off
    #   (mirroring _plugins/modules.rb: an absent key means enabled).
    def cohorts_enabled?(site)
      modules = (site.data["site"] || {})["modules"] || {}
      !(modules.key?("cohorts") && !modules["cohorts"])
    end

    # Finds or creates the detail page for one cohort event.
    # @param site [Jekyll::Site]
    # @param pages_by_url [Hash{String => Jekyll::Page}] mutated as pages are added
    # @param year [String]
    # @param ev [Hash] raw event data
    # @param emit [Boolean] whether missing pages may be generated
    # @return [String, nil] the detail page URL, nil when there is no page
    def resolve_page(site, pages_by_url, year, ev, emit)
      id = event_id(ev)
      url = "/cohorts/#{year}/events/#{id}/"
      existing = pages_by_url[url]

      if existing
        fill_blanks(existing, event_data(year, id, ev))
        return url
      end
      return nil unless emit

      page = Jekyll::PageWithoutAFile.new(site, site.source, "cohorts/#{year}/events/#{id}", "index.html")
      page.data.merge!(event_data(year, id, ev).merge("generated" => true))
      page.content = ""
      site.pages << page
      pages_by_url[url] = page
      url
    end

    # Front matter for an event detail page.
    # @param year [String]
    # @param id [String]
    # @param ev [Hash] raw event data
    # @return [Hash]
    def event_data(year, id, ev)
      {
        "layout" => "event",
        "title" => ev["name"],
        "cohort" => year,
        "event_id" => id,
        "summary" => ev["description"],
        "event_date" => ev["date"],
        "event_time" => ev["time"],
        "event_location" => ev["location"],
        "attachments" => ev["attachments"]
      }
    end

    # Copies data-file values into a hand-written page for the keys it did not
    # set itself, so an override file only has to say what it changes. `layout`
    # is skipped: the file already declared one, and `page.data` falls back to
    # `_config.yml`'s `defaults` for missing keys, which would make a "is this
    # set?" test on `layout` meaningless.
    # @param page [Jekyll::Page]
    # @param data [Hash]
    # @return [void]
    def fill_blanks(page, data)
      data.each do |key, value|
        next if key == "layout" || value.nil?

        page.data[key] = value if page.data[key].nil?
      end
    end

    # Converts one raw event hash (from either _data/events.yml or a cohort's
    # `events` list) into the flat shape stored in `events_all`.
    # @param ev [Hash] raw event data
    # @param source [String] "site" or "cohort"
    # @param cohort [String, nil] cohort year, when source is "cohort"
    # @param page_url [String, nil] detail page URL, when one exists
    # @param today [Date] used to compute `past`
    # @return [Hash] normalized event
    def normalize(ev, source, cohort, page_url, today)
      date = parse_date(ev["date"])
      end_date = parse_date(ev["end_date"])
      last_day = end_date || date
      {
        "id" => event_id(ev),
        "name" => ev["name"].to_s,
        "date" => date&.iso8601,
        "end_date" => end_date&.iso8601,
        "month" => date&.strftime("%B %Y"),
        "time" => ev["time"],
        "location" => ev["location"],
        "url" => ev["url"] || ev["registration_url"],
        "description" => ev["description"],
        "type" => ev["type"],
        "source" => source,
        "cohort" => cohort,
        "page_url" => page_url,
        "past" => last_day ? last_day < today : false
      }
    end

    # Parses a date value that may already be a Date (Jekyll's YAML loader
    # sometimes coerces `YYYY-MM-DD` strings automatically) or a plain string.
    # @param value [Date, String, nil]
    # @return [Date, nil] nil when blank or unparsable
    def parse_date(value)
      return nil if value.nil? || value.to_s.strip.empty?
      return value if value.is_a?(Date)

      Date.parse(value.to_s)
    rescue ArgumentError
      nil
    end
  end
end
