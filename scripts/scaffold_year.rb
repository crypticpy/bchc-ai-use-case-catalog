#!/usr/bin/env ruby
# frozen_string_literal: true

# Scaffold a cohort/program year: the landing page and a starter schedule data
# file. Existing files are never overwritten. No events folder is created:
# _plugins/events.rb generates a detail page for every event in the data file,
# and a hand-written file under cohorts/<year>/events/<id>/ overrides it.
#
# Invoked by: the "Scaffold cohort" step in .github/workflows/new-year.yml,
# triggered by an issue labeled `content:new-year` (year read from the issue
# via scripts/extract_event_fields.mjs) or a manual `workflow_dispatch`. That
# workflow opens a PR with the scaffolded files afterwards.
# Env: COHORT_YEAR (required, four digits), COHORT_INTRO (optional).
# Output: writes cohorts/<year>/index.md and _data/cohorts/<year>.yml under the
# repo root; prints a summary line.

require "fileutils"
require "yaml"
require "psych"

# Render one value as the YAML scalar node Psych itself would write for it
# (plain, quoted or a literal block, whichever the value needs).
#
# COHORT_INTRO reaches this script from an issue form. It used to be emitted
# with String#inspect, which produces escapes YAML does not define (`\#{`,
# `\u{1f600}`) and leaves DEL and the C1 block raw — a crafted intro could
# write a cohort landing page Psych then refuses to parse. Letting Psych do the
# escaping makes every input round-trip.
#
# @param value [Object]
# @return [String] a YAML scalar, safe to interpolate after `key: `
def yaml_scalar(value)
  Psych.dump(value, line_width: -1).sub(/\A---[ \n]/, "").chomp
end

year = ENV["COHORT_YEAR"].to_s.strip

unless year.match?(/\A\d{4}\z/)
  warn "COHORT_YEAR must be a four-digit year (got #{year.inspect})."
  exit 1
end

root = File.expand_path("..", __dir__)
cohort_dir = File.join(root, "cohorts", year)
data_dir = File.join(root, "_data", "cohorts")

FileUtils.mkdir_p(cohort_dir)
FileUtils.mkdir_p(data_dir)

intro = ENV["COHORT_INTRO"].to_s.strip
intro = "Overview of the #{year} cohort. Replace this with the program summary." if intro.empty?

index_path = File.join(cohort_dir, "index.md")
unless File.exist?(index_path)
  File.write(index_path, <<~MARKDOWN)
    ---
    layout: cohort
    title: "Cohort #{year}"
    year: #{year}
    intro: #{yaml_scalar(intro)}
    ---

    Add background, goals and participant information for the #{year} cohort here.
  MARKDOWN
end

data_path = File.join(data_dir, "#{year}.yml")
unless File.exist?(data_path)
  template = {
    "year" => year.to_i,
    "events" => [
      { "id" => "kickoff", "name" => "Kickoff", "date" => "#{year}-01-01", "location" => "TBD" },
      { "id" => "midpoint", "name" => "Midpoint check-in", "date" => "#{year}-06-01", "location" => "TBD" },
      { "id" => "closing", "name" => "Closing showcase", "date" => "#{year}-11-01", "location" => "TBD" }
    ],
    "materials" => {
      "essentials" => [
        { "title" => "Program handbook", "type" => "guide", "url" => "" }
      ]
    },
    "policies" => [
      "Publish only public, non-sensitive information.",
      "Accessibility: WCAG 2.1 AA for posted assets."
    ]
  }

  File.write(data_path, Psych.dump(template, line_width: -1))
end

puts "Scaffolded cohort #{year} (cohorts/#{year}/ and _data/cohorts/#{year}.yml)."
