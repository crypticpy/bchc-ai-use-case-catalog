#!/usr/bin/env ruby
# frozen_string_literal: true

# Rewrite the `events` list in _data/cohorts/<year>.yml from the YAML block a
# maintainer pasted into the "Update cohort schedule" issue form.
#
# Invoked by: the "Update schedule data" step in
# .github/workflows/update-schedule.yml, on `issues: opened|edited` for
# issues labeled `content:schedule`, after preview_schedule_ids_from_issue.rb
# has commented the ID preview. That workflow opens a PR with the change
# when `changed=true`, or comments "nothing changed" otherwise. Every refusal
# below goes out through IssueForm.fail, which writes the `error` output the
# workflow quotes back onto the issue — a bare `warn` would reach the run log
# only, and the person who filled the form would never see it.
# Env: ISSUE_BODY (required), ISSUE_TITLE (unused here), ISSUE_NUMBER (optional,
# only used in the final log line). Outputs (via GITHUB_OUTPUT): changed,
# branch, year, summary, error. Writes: _data/cohorts/<year>.yml.

require "yaml"
require "psych"
require "date"
require "time"

require_relative "lib/issue_form"
require_relative "lib/slugify"

# The headings the "Update a cohort schedule" issue form emits, in template
# order. Only these start a section, the first occurrence of each wins, and
# everything after the trailing free-text field is that field's answer — so a
# `### Cohort year` typed into the notes or the YAML block cannot replace the
# answer GitHub itself collected. See scripts/lib/issue_form.rb.
FORM_HEADINGS = ["Cohort year", "Schedule entries (YAML)", "Notes for reviewers"].freeze
FINAL_HEADING = "Notes for reviewers"

issue_body = ENV["ISSUE_BODY"].to_s.gsub("\r\n", "\n")
issue_number = ENV["ISSUE_NUMBER"].to_s.strip

if issue_body.strip.empty?
  IssueForm.fail("The issue is empty, so there is no schedule to read. Fill in the form and the automation will try again.")
end

# Turns free text into a URL/id-safe slug, used as the event id when the
# maintainer didn't supply one. Shared with the JS side (see lib/slugify.rb).
# @param value [String]
# @return [String]
def slugify(value)
  CatalogTemplate::Slugify.call(value)
end

values = IssueForm.sections(issue_body, FORM_HEADINGS, FINAL_HEADING)

cohort_year = values["cohort_year"].to_s.strip
schedule_yaml = IssueForm.strip_code_fence(values["schedule_entries"])

unless cohort_year.match?(/\A\d{4}\z/)
  IssueForm.fail("The **Cohort year** field needs a four-digit year, like `2026`. It currently reads #{cohort_year.inspect}.")
end

if schedule_yaml.empty?
  IssueForm.fail("The **Schedule entries** box is empty. Paste the whole list of events for #{cohort_year} — every event you want to keep.")
end

begin
  parsed_events = YAML.safe_load(schedule_yaml, permitted_classes: [Date], permitted_symbols: [], aliases: false)
rescue Psych::SyntaxError => e
  IssueForm.fail(
    "The **Schedule entries** box could not be read. Check the indentation — every event starts with `- name:` " \
    "and the lines under it line up. The exact complaint was: #{e.message}"
  )
end

unless parsed_events.is_a?(Array)
  IssueForm.fail("The **Schedule entries** box has to be a list: each event starts on its own line with `- name:`.")
end

processed_events = []
used_ids = {}

parsed_events.each_with_index do |event, index|
  unless event.is_a?(Hash)
    IssueForm.fail("Event #{index + 1} in the list is not laid out as an event. It needs a `name:` line and a `date:` line under it.")
  end

  name = event["name"].to_s.strip
  date_value = event["date"].to_s.strip

  if name.empty? || date_value.empty?
    IssueForm.fail("Every event needs both a `name:` and a `date:`. Event #{index + 1} in the list is missing one of them.")
  end

  begin
    date_iso = Date.iso8601(date_value).to_s
  rescue Date::Error
    IssueForm.fail("The date for #{name.inspect} reads #{date_value.inspect}. Dates are written year-month-day, like `2026-01-15`.")
  end

  event_id = event["id"].to_s.strip
  event_id = slugify(name) if event_id.empty?

  base_id = event_id.dup
  counter = 1
  while used_ids[event_id]
    counter += 1
    event_id = "#{base_id}-#{counter}"
  end
  used_ids[event_id] = true

  normalized = { "id" => event_id, "name" => name, "date" => date_iso }

  %w[time location description type state icon].each do |optional_key|
    value = event[optional_key]
    next if value.nil? || value.to_s.strip.empty?

    normalized[optional_key] = value.to_s.strip
  end

  processed_events << normalized
end

data_path = File.expand_path("../_data/cohorts/#{cohort_year}.yml", __dir__)

unless File.exist?(data_path)
  IssueForm.fail(
    "There is no cohort #{cohort_year} yet, so there is no schedule to replace. " \
    "Open a **Start a new cohort year** issue for #{cohort_year} first, merge the pull request it opens, then edit this issue."
  )
end

original_content = File.read(data_path)
data = YAML.safe_load(original_content, permitted_classes: [Date], permitted_symbols: [], aliases: false) || {}
data["events"] = processed_events

new_content = Psych.dump(data, line_width: -1)

if new_content == original_content
  puts "No schedule changes detected for cohort #{cohort_year}."
  IssueForm.write_output("changed" => "false")
  exit 0
end

File.write(data_path, new_content)

summary_lines = processed_events.map { |event| "- #{event['name']} (#{event['date']})" }
branch = "schedule/#{cohort_year}-#{Time.now.utc.strftime('%Y%m%d%H%M%S')}"

# `summary` is built from event names the submitter typed, so it is written
# with a random heredoc delimiter (see IssueForm.write_output): a name
# containing a delimiter line would otherwise close the block early and inject
# its own `branch=` output.
IssueForm.write_output(
  "changed" => "true",
  "branch" => branch,
  "year" => cohort_year,
  "summary" => summary_lines.join("\n")
)

puts "Updated the schedule for cohort #{cohort_year}#{issue_number.empty? ? '' : " (issue ##{issue_number})"}."
