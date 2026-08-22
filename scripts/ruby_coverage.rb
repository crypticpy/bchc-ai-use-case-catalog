#!/usr/bin/env ruby
# frozen_string_literal: true

# Collect standard-library coverage for Ruby production code loaded by Minitest.

require "coverage"
require "fileutils"
require "json"

module RubyCoverageReport
  THRESHOLDS = { lines: 90, branches: 82, methods: 75 }.freeze
  SOURCE_PREFIXES = ["_plugins/", "scripts/"].freeze
  SUBPROCESS_ONLY_FILES = %w[
    scripts/check_file_sizes.rb
    scripts/check_gem_licenses.rb
    scripts/lib/slugify.rb
    scripts/preview_schedule_ids_from_issue.rb
    scripts/scaffold_year.rb
    scripts/update_schedule_from_issue.rb
  ].freeze

  module_function

  def metric(counts)
    total = counts.length
    covered = counts.count(&:positive?)
    percent = total.zero? ? 100.0 : (100.0 * covered / total).round(2)
    { covered: covered, total: total, percent: percent }
  end

  def file_metrics(data)
    {
      lines: metric(Array(data[:lines]).compact),
      branches: metric((data[:branches] || {}).values.flat_map(&:values)),
      methods: metric((data[:methods] || {}).values)
    }
  end

  def summarize(result, root:)
    files = result.each_with_object({}) do |(file, data), selected|
      next unless file.start_with?(root)

      relative = file.delete_prefix(root)
      next unless SOURCE_PREFIXES.any? { |prefix| relative.start_with?(prefix) }

      selected[relative] = file_metrics(data)
    end.sort.to_h

    totals = %i[lines branches methods].to_h do |kind|
      counts = files.values.flat_map do |file|
        value = file.fetch(kind)
        Array.new(value[:covered], 1) + Array.new(value[:total] - value[:covered], 0)
      end
      [kind, metric(counts)]
    end
    { files: files, metrics: totals }
  end

  def passing?(metrics, unexpected_unrepresented: [])
    unexpected_unrepresented.empty? &&
      THRESHOLDS.all? { |kind, minimum| metrics.fetch(kind).fetch(:percent) >= minimum }
  end

  def run
    root = "#{File.expand_path("..", __dir__)}/"
    output_directory = File.join(root, "coverage")
    runner = File.expand_path(__FILE__)
    $LOADED_FEATURES << runner unless $LOADED_FEATURES.include?(runner)
    Coverage.start(lines: true, branches: true, methods: true)
    require "minitest/autorun"

    Minitest.after_run do
      summary = summarize(Coverage.result, root: root)
      source_files = SOURCE_PREFIXES.flat_map do |prefix|
        Dir[File.join(root, prefix, "**/*.rb")].map { |file| file.delete_prefix(root) }
      end.reject { |file| file == "scripts/ruby_coverage.rb" }.sort
      unrepresented = source_files - summary[:files].keys
      unexpected_unrepresented = unrepresented - SUBPROCESS_ONLY_FILES
      passed = passing?(summary[:metrics], unexpected_unrepresented: unexpected_unrepresented)
      report = {
        schema_version: 1,
        runtime: RUBY_VERSION,
        label: "Ruby production code loaded in-process by the complete Minitest suite",
        scope: SOURCE_PREFIXES,
        thresholds: THRESHOLDS,
        metrics: summary[:metrics],
        files: summary[:files],
        subprocess_only_files: SUBPROCESS_ONLY_FILES,
        unrepresented_files: unrepresented,
        unexpected_unrepresented_files: unexpected_unrepresented,
        passed: passed
      }
      FileUtils.mkdir_p(output_directory)
      File.write(File.join(output_directory, "ruby.json"), "#{JSON.pretty_generate(report)}\n")

      puts "\nRuby coverage (covered / total / percent)"
      %i[lines branches methods].each do |kind|
        value = summary[:metrics].fetch(kind)
        puts format(
          "  %-8s %4d / %-4d %6.2f%% (floor %g%%)",
          kind,
          value[:covered],
          value[:total],
          value[:percent],
          THRESHOLDS.fetch(kind)
        )
      end
      puts "  Files represented: #{summary[:files].length}"
      puts "  Source files not represented in-process: #{report[:unrepresented_files].length}"
      unless unexpected_unrepresented.empty?
        warn "  Unexpected unrepresented files: #{unexpected_unrepresented.join(", ")}"
      end
      unless passed
        warn "Ruby coverage fell below a reviewed regression floor; inspect coverage/ruby.json."
        exit 1
      end
    end

    Dir[File.join(root, "test/**/*_test.rb")].sort.each { |file| require file }
  end
end

RubyCoverageReport.run if $PROGRAM_NAME == __FILE__
