# frozen_string_literal: true

require "minitest/autorun"
require_relative "../../scripts/ruby_coverage"

class RubyCoverageReportTest < Minitest::Test
  def test_metric_counts_covered_and_uncovered_entries
    assert_equal({ covered: 2, total: 3, percent: 66.67 }, RubyCoverageReport.metric([1, 0, 3]))
  end

  def test_zero_length_metric_is_not_a_false_failure
    assert_equal({ covered: 0, total: 0, percent: 100.0 }, RubyCoverageReport.metric([]))
  end

  def test_reviewed_floors_cover_lines_branches_and_methods
    assert_equal(%i[lines branches methods], RubyCoverageReport::THRESHOLDS.keys)
    assert RubyCoverageReport.passing?(
      { lines: { percent: 90 }, branches: { percent: 82 }, methods: { percent: 75 } }
    )
    refute RubyCoverageReport.passing?(
      { lines: { percent: 100 }, branches: { percent: 81.99 }, methods: { percent: 100 } }
    )
    refute RubyCoverageReport.passing?(
      { lines: { percent: 100 }, branches: { percent: 100 }, methods: { percent: 100 } },
      unexpected_unrepresented: ["scripts/new_uncovered_file.rb"]
    )
  end
end
