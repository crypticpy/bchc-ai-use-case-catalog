#!/usr/bin/env ruby
# frozen_string_literal: true

# Read-only companion to update_schedule_from_issue.rb: shows the maintainer
# which event IDs their YAML block will produce before anything is written.
#
# Invoked by: the "Preview normalized event IDs" step in
# .github/workflows/update-schedule.yml, on `issues: opened|edited` for
# issues labeled `content:schedule`, before update_schedule_from_issue.rb
# writes anything — this step's output is posted back as an issue comment.
# Env: ISSUE_BODY (the raw GitHub issue form body). Outputs (via
# GITHUB_OUTPUT): year, preview_ids (a markdown bullet list).

require "yaml"
require "date"

require_relative "lib/issue_form"
require_relative "lib/slugify"

# Must stay in step with update_schedule_from_issue.rb: the preview is only
# useful if both scripts read the same answers out of the same body.
FORM_HEADINGS = ["Cohort year", "Schedule entries (YAML)", "Notes for reviewers"].freeze
FINAL_HEADING = "Notes for reviewers"

issue_body = ENV["ISSUE_BODY"].to_s.gsub("\r\n", "\n")

# Turns free text into a URL/id-safe slug. Shared with the JS side so the id
# previewed here is the id update_schedule_from_issue.rb writes.
# @param value [String]
# @return [String]
def slugify(value)
  CatalogTemplate::Slugify.call(value)
end

values = IssueForm.sections(issue_body, FORM_HEADINGS, FINAL_HEADING)

year = values["cohort_year"].to_s.strip

parsed = begin
  YAML.safe_load(IssueForm.strip_code_fence(values["schedule_entries"]), permitted_classes: [Date], permitted_symbols: [], aliases: false) || []
rescue StandardError
  []
end

used_ids = {}
events = Array(parsed).select { |e| e.is_a?(Hash) }.map do |event|
  name = event["name"].to_s
  id = event["id"].to_s.strip
  id = slugify(name) if id.empty?

  # Mirrors the de-duplication in update_schedule_from_issue.rb.
  base_id = id.dup
  counter = 1
  while used_ids[id]
    counter += 1
    id = "#{base_id}-#{counter}"
  end
  used_ids[id] = true

  { "id" => id, "name" => name, "date" => event["date"] }
end

md = if events.empty?
       "No events could be read from the YAML block."
     else
       events.map { |e| "- `#{e['id']}` — #{e['name']}#{e['date'] ? " (#{e['date']})" : ''}" }.join("\n")
     end

# `md` is built from issue text, so a fixed heredoc delimiter would let a
# submitter close the block early and inject their own step outputs. Every
# value is written with a random delimiter instead (IssueForm.write_output).
IssueForm.write_output(
  "year" => year.gsub(/[^0-9]/, ""),
  "preview_ids" => md
)

puts "Previewed normalized event IDs."
