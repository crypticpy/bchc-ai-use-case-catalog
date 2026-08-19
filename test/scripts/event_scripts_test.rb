# frozen_string_literal: true

# Tests for the Ruby halves of the cohort automation:
# scripts/lib/issue_form.rb, scripts/update_schedule_from_issue.rb,
# scripts/preview_schedule_ids_from_issue.rb and scripts/scaffold_year.rb.
#
#   npm run test:ruby     (or: ruby -Itest test/scripts/event_scripts_test.rb)
#
# The two schedule scripts resolve their data file relative to their own
# directory, so the end-to-end cases copy the script (and the lib it needs) into
# a temporary tree — the real _data/cohorts/ is never touched.

require "minitest/autorun"
require "tmpdir"
require "fileutils"
require "yaml"

require_relative "../../scripts/lib/issue_form"

# Reads a $GITHUB_OUTPUT file the way the Actions runner does, so a test can
# tell a real output from a line that only looks like one inside a heredoc.
module OutputFile
  module_function

  def parse(raw)
    outputs = {}
    lines = raw.split("\n")
    index = 0
    while index < lines.length
      line = lines[index]
      if (heredoc = /\A([A-Za-z0-9_-]+)<<(.+)\z/.match(line))
        key, delimiter = heredoc.captures
        buffer = []
        index += 1
        while index < lines.length && lines[index] != delimiter
          buffer << lines[index]
          index += 1
        end
        outputs[key] = buffer.join("\n")
      elsif (plain = /\A([A-Za-z0-9_-]+)=(.*)\z/.match(line))
        outputs[plain[1]] = plain[2]
      end
      index += 1
    end
    outputs
  end
end

class IssueFormTest < Minitest::Test
  HEADINGS = ["Cohort year", "Schedule entries (YAML)", "Notes for reviewers"].freeze
  FINAL = "Notes for reviewers"

  def test_normalizes_headings_to_snake_case_keys
    assert_equal "schedule_entries", IssueForm.normalize_key("Schedule entries (YAML)")
    assert_equal "cohort_year", IssueForm.normalize_key("  Cohort Year  ")
    assert_equal "notes_for_reviewers", IssueForm.normalize_key("Notes for reviewers")
  end

  def test_first_occurrence_of_a_heading_wins
    body = <<~BODY
      ### Cohort year

      2026

      ### Cohort year

      1999
    BODY

    assert_equal "2026", IssueForm.sections(body, HEADINGS)["cohort_year"]
  end

  def test_a_heading_inside_the_final_free_text_field_is_prose
    body = <<~BODY
      ### Cohort year

      2026

      ### Schedule entries (YAML)

      ```yaml
      - name: Kickoff
        date: 2026-01-15
      ```

      ### Notes for reviewers

      Please note:

      ### Cohort year

      1999

      ### Schedule entries (YAML)

      ```yaml
      - name: Forged
        date: 1999-01-01
      ```
    BODY

    values = IssueForm.sections(body, HEADINGS, FINAL)

    assert_equal "2026", values["cohort_year"]
    assert_includes values["schedule_entries"], "Kickoff"
    refute_includes values["schedule_entries"], "Forged"
    assert_includes values["notes_for_reviewers"], "### Cohort year"
  end

  def test_an_unknown_heading_is_body_text
    body = <<~BODY
      ### Cohort year

      2026

      ### Something the submitter invented

      2027
    BODY

    values = IssueForm.sections(body, HEADINGS)

    assert_equal "2026\n\n### Something the submitter invented\n\n2027", values["cohort_year"]
    assert_equal ["cohort_year"], values.keys
  end

  def test_crlf_bodies_parse_the_same_as_lf_bodies
    body = "### Cohort year\r\n\r\n2026\r\n\r\n### Notes for reviewers\r\n\r\nHi\r\n"

    values = IssueForm.sections(body, HEADINGS, FINAL)

    assert_equal "2026", values["cohort_year"]
    assert_equal "Hi", values["notes_for_reviewers"]
  end

  def test_write_output_uses_a_random_delimiter_per_value
    hostile = "Kickoff\nSUMMARY\nbranch=attacker/branch"

    first = capture_output("summary" => hostile)
    second = capture_output("summary" => hostile)

    refute_equal first, second, "the heredoc delimiter must not repeat between runs"
    assert_equal hostile, OutputFile.parse(first)["summary"]
    refute OutputFile.parse(first).key?("branch"), "an injected branch= line became an output"
  end

  private

  # Runs IssueForm.write_output against a temp $GITHUB_OUTPUT and returns the file.
  def capture_output(pairs)
    Dir.mktmpdir do |dir|
      path = File.join(dir, "output.txt")
      File.write(path, "")
      begin
        previous = ENV["GITHUB_OUTPUT"]
        ENV["GITHUB_OUTPUT"] = path
        IssueForm.write_output(pairs)
      ensure
        ENV["GITHUB_OUTPUT"] = previous
      end
      File.read(path)
    end
  end
end

# End-to-end runs of the scripts themselves, in a throwaway tree.
class CohortScriptsTest < Minitest::Test
  ROOT = File.expand_path("../..", __dir__)

  def test_update_schedule_cannot_inject_a_branch_output
    hostile_name = "Kickoff\nSUMMARY\nbranch=attacker/branch\nchanged=true"
    body = <<~BODY
      ### Cohort year

      2999

      ### Schedule entries (YAML)

      ```yaml
      - name: #{hostile_name.dump}
        date: 2999-01-01
      ```
    BODY

    in_tree do |dir, output|
      status = run_script(dir, "update_schedule_from_issue.rb", body, output)
      outputs = OutputFile.parse(File.read(output))

      assert_equal 0, status
      assert_equal "true", outputs["changed"]
      assert_match %r{\Aschedule/2999-\d{14}\z}, outputs["branch"]
      assert_includes outputs["summary"], "branch=attacker/branch"
      assert_equal 1, YAML.safe_load(File.read(File.join(dir, "_data", "cohorts", "2999.yml")))["events"].length
    end
  end

  def test_update_schedule_ignores_a_heading_typed_into_the_notes
    body = <<~BODY
      ### Cohort year

      2999

      ### Schedule entries (YAML)

      ```yaml
      - name: Kickoff
        date: 2999-01-01
      ```

      ### Notes for reviewers

      Looks good.

      ### Schedule entries (YAML)

      ```yaml
      - name: Forged
        date: 1999-01-01
      ```
    BODY

    in_tree do |dir, output|
      status = run_script(dir, "update_schedule_from_issue.rb", body, output)
      events = YAML.safe_load(File.read(File.join(dir, "_data", "cohorts", "2999.yml")))["events"]

      assert_equal 0, status
      assert_equal ["Kickoff"], events.map { |event| event["name"] }
    end
  end

  def test_preview_matches_the_update_and_cannot_inject_an_output
    body = <<~BODY
      ### Cohort year

      2999

      ### Schedule entries (YAML)

      ```yaml
      - name: "Kickoff\\npreview_ids\\nbranch=attacker/branch"
        date: 2999-01-01
      ```

      ### Notes for reviewers

      ### Cohort year

      1999
    BODY

    in_tree do |dir, output|
      status = run_script(dir, "preview_schedule_ids_from_issue.rb", body, output)
      outputs = OutputFile.parse(File.read(output))

      assert_equal 0, status
      assert_equal "2999", outputs["year"]
      refute outputs.key?("branch"), "an injected branch= line became an output"
      assert_includes outputs["preview_ids"], "branch=attacker/branch"
    end
  end

  def test_scaffold_year_writes_front_matter_psych_can_parse
    hostile_intro = "Budget \#{1+1} plan     \"quoted\" \\ backslash"

    Dir.mktmpdir do |dir|
      FileUtils.mkdir_p(File.join(dir, "scripts"))
      FileUtils.cp(File.join(ROOT, "scripts", "scaffold_year.rb"), File.join(dir, "scripts"))

      status = system(
        { "COHORT_YEAR" => "2999", "COHORT_INTRO" => hostile_intro },
        "ruby", File.join(dir, "scripts", "scaffold_year.rb"),
        out: File::NULL
      )

      assert status, "scaffold_year.rb failed"
      page = File.read(File.join(dir, "cohorts", "2999", "index.md"))
      front_matter = page.split(/^---$/)[1]
      data = YAML.safe_load(front_matter)

      assert_equal hostile_intro, data["intro"]
      assert_equal "Cohort 2999", data["title"]
      assert_equal 2999, data["year"]
    end
  end

  private

  # Copies the schedule scripts into a temp tree with a cohort data file, so the
  # scripts write there instead of into the repository.
  def in_tree
    Dir.mktmpdir do |dir|
      FileUtils.mkdir_p(File.join(dir, "scripts", "lib"))
      FileUtils.mkdir_p(File.join(dir, "_data", "cohorts"))
      %w[update_schedule_from_issue.rb preview_schedule_ids_from_issue.rb].each do |script|
        FileUtils.cp(File.join(ROOT, "scripts", script), File.join(dir, "scripts"))
      end
      # Whole lib, not a named list: the scripts require from it and a new
      # shared file must not fail here as a missing require.
      FileUtils.cp(Dir[File.join(ROOT, "scripts", "lib", "*.rb")], File.join(dir, "scripts", "lib"))
      File.write(File.join(dir, "_data", "cohorts", "2999.yml"), "year: 2999\nevents: []\n")

      output = File.join(dir, "output.txt")
      File.write(output, "")
      yield dir, output
    end
  end

  def run_script(dir, script, body, output)
    ok = system(
      { "ISSUE_BODY" => body, "GITHUB_OUTPUT" => output },
      "ruby", File.join(dir, "scripts", script),
      out: File::NULL, err: File::NULL
    )
    ok ? 0 : 1
  end
end
