# frozen_string_literal: true

# Shared reading of a GitHub issue-form body, and safe writing of step outputs,
# for the Ruby halves of the schedule automation
# (update_schedule_from_issue.rb and preview_schedule_ids_from_issue.rb).
#
# Both scripts used to carry their own `### heading` splitter, both
# last-occurrence-wins: a `### Cohort year` typed inside a free-text answer
# replaced the answer GitHub itself collected. `IssueForm.sections` mirrors the
# JavaScript parser in scripts/lib/issue_body.mjs instead:
#
#   1. only a heading the caller lists can start a section — an invented `###`
#      is body text;
#   2. the FIRST occurrence of a heading wins, so a later copy cannot overwrite
#      the real answer;
#   3. once the trailing free-form field's heading is seen, the rest of the body
#      belongs to it, `###` lines included.
#
# See test/scripts/event_scripts_test.rb.

require "securerandom"
require "set"

module IssueForm
  module_function

  # "Schedule entries (YAML)" -> "schedule_entries"
  # @param key [String] a GitHub issue-form field heading
  # @return [String] snake_case key with any parenthetical suffix removed
  def normalize_key(key)
    key.to_s.sub(/\s*\([^)]*\)\s*\z/, "").strip.downcase.gsub(/[^a-z0-9]+/, "_").gsub(/\A_+|_+\z/, "")
  end

  # GitHub wraps a `render: yaml` textarea in a fenced code block.
  # @param text [String] raw issue-form field value
  # @return [String] the text with a leading ```/```lang and trailing ``` removed
  def strip_code_fence(text)
    text.to_s.strip.sub(/\A```[a-zA-Z]*[ \t]*\n/, "").sub(/\n?```\z/, "")
  end

  # Split an issue body into `normalized key => answer`.
  #
  # @param body [String] raw issue body (CRLF tolerated)
  # @param known_keys [Array<String>] headings (or keys) that may start a section
  # @param final_key [String, nil] key of the trailing free-form field
  # @return [Hash{String => String}]
  def sections(body, known_keys, final_key = nil)
    known = known_keys.map { |key| normalize_key(key) }.reject(&:empty?).to_set
    terminal = final_key.nil? ? nil : normalize_key(final_key)

    values = {}
    heading = nil
    buffer = []
    sealed = false

    flush = lambda do
      # First occurrence wins; a duplicate's body is discarded, not merged.
      values[heading] = buffer.join("\n").strip if heading && !values.key?(heading)
      buffer = []
    end

    body.to_s.gsub("\r\n", "\n").split("\n", -1).each do |line|
      match = sealed ? nil : /\A###[ \t]+(.*)\z/.match(line)
      candidate = match ? normalize_key(match[1]) : nil
      if candidate && !candidate.empty? && known.include?(candidate)
        flush.call
        heading = candidate
        sealed = true if terminal && candidate == terminal
        next
      end
      buffer << line if heading
    end
    flush.call

    values
  end

  # Append `key<<DELIM … DELIM` blocks to $GITHUB_OUTPUT (no-op outside CI, so
  # the scripts stay runnable by hand).
  #
  # Values are built from issue text, so a fixed delimiter would let a submitter
  # close the block early and inject their own step outputs (a `branch=` line,
  # say). The delimiter is random per value and generated after the issue text
  # is already fixed, so it cannot appear inside the value being written.
  #
  # @param pairs [Hash{#to_s => #to_s}] output name => value
  # @return [void]
  def write_output(pairs)
    output = ENV["GITHUB_OUTPUT"]
    return unless output

    File.open(output, "a") do |f|
      pairs.each do |key, value|
        delimiter = "GHEOF_#{key}_#{SecureRandom.hex(8)}"
        f.puts("#{key}<<#{delimiter}")
        f.puts(value.to_s)
        f.puts(delimiter)
      end
    end
  end
end
