# frozen_string_literal: true

# Unit tests for scripts/check_front_matter.rb.
#
#   npm run test:ruby     (or: ruby -Itest test/scripts/check_front_matter_test.rb)
#
# Fixtures are written into a temporary directory rather than committed, so
# Jekyll never sees stray pages with `layout: entry` front matter.

require "minitest/autorun"
require "tmpdir"
require "fileutils"

require_relative "../../scripts/check_front_matter"

class CheckFrontMatterTest < Minitest::Test
  SCHEMA = <<~YAML
    entry:
      path: catalog
    fields:
      - key: title
        label: Title
        type: text
        required: true
      - key: summary
        label: Summary
        type: textarea
        required: true
      - key: stage
        label: Stage
        type: select
        options:
          - Pilot
          - In production
      - key: area
        label: Area
        type: multiselect
        options:
          - Data
          - Policy
      - key: repo_url
        label: Repo
        type: url
      - key: contact_email
        label: Email
        type: email
      - key: screenshots
        label: Screenshots
        type: images
      - key: resources
        label: Resources
        type: links
      - key: deck_pdf
        label: Slide deck
        type: file
        filename: deck.pdf
      - key: body
        label: Write-up
        type: markdown
        required: true
  YAML

  # 1x1 transparent PNG, so an `images` src can point at a file that exists.
  PNG = ["89504e470d0a1a0a0000000d494844520000000100000001080600000" \
         "01f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082"].pack("H*")

  def setup
    @root = Dir.mktmpdir("front-matter-test")
    FileUtils.mkdir_p(File.join(@root, "_data"))
    File.write(File.join(@root, "_data", "schema.yml"), SCHEMA)
  end

  def teardown
    FileUtils.remove_entry(@root)
    FrontMatterCheck.root = FrontMatterCheck::DEFAULT_ROOT
  end

  # Write catalog/<slug>/index.md with the given front matter and body.
  def write_entry(slug, front_matter, body = "Some write-up.")
    dir = File.join(@root, "catalog", slug)
    FileUtils.mkdir_p(dir)
    File.write(File.join(dir, "index.md"), "---\n#{front_matter.strip}\n---\n\n#{body}\n")
    dir
  end

  def run_check
    FrontMatterCheck.run(@root)
  end

  def test_a_complete_entry_passes
    dir = write_entry("good", <<~FM)
      title: A good entry
      slug: good
      render_with_liquid: false
      summary: It does a thing.
      published: "2026-01-05"
      updated: "2026-02-01"
      stage: Pilot
      area:
        - Data
      repo_url: https://example.org/repo
      contact_email: a@example.org
      screenshots:
        - src: screenshots/01.png
          alt: The queue view
      resources:
        - label: Report
          url: https://example.org/r.pdf
    FM
    FileUtils.mkdir_p(File.join(dir, "screenshots"))
    File.binwrite(File.join(dir, "screenshots", "01.png"), PNG)

    failures, warnings = run_check
    assert_empty failures
    assert_empty warnings
  end

  def test_slug_must_match_the_folder_and_dates_must_be_iso
    write_entry("mismatch", <<~FM)
      title: T
      slug: something-else
      summary: S
      published: January 2026
      updated: not-a-date
      verified: last spring
      body: x
    FM

    failures, = run_check
    assert(failures.any? { |f| f.include?("`slug` is \"something-else\" but the folder is \"mismatch\"") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`published`") && f.include?("YYYY-MM-DD") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`updated`") && f.include?("YYYY-MM-DD") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`verified`") && f.include?("YYYY-MM-DD") }, failures.inspect)
  end

  # The scaffolder writes the attachment path from the issue before the file is
  # committed, so a dangling `file` path is a review note, not a broken build.
  def test_a_missing_file_attachment_warns_but_does_not_fail
    write_entry("no-deck", <<~FM)
      title: T
      slug: no-deck
      render_with_liquid: false
      summary: S
      published: "2026-01-05"
      deck_pdf: "/catalog/no-deck/deck.pdf"
    FM

    failures, warnings = run_check
    assert(failures.none? { |f| f.include?("deck_pdf") }, failures.inspect)
    assert(warnings.any? { |w| w.include?("`deck_pdf`") && w.include?("not in the repository yet") }, warnings.inspect)
  end

  def test_a_present_file_attachment_is_silent
    dir = write_entry("has-deck", <<~FM)
      title: T
      slug: has-deck
      render_with_liquid: false
      summary: S
      published: "2026-01-05"
      deck_pdf: "/catalog/has-deck/deck.pdf"
    FM
    File.write(File.join(dir, "deck.pdf"), "%PDF-1.4\n")

    failures, warnings = run_check
    assert(failures.none? { |f| f.include?("deck_pdf") }, failures.inspect)
    assert(warnings.none? { |w| w.include?("deck_pdf") }, warnings.inspect)
  end

  # `verified` is optional and reserved: absent is fine, blank is fine, a real
  # date is fine. Only a value that looks like a date and is not one fails —
  # that is the case the entry page would silently read as "never verified".
  def test_verified_is_optional_but_must_be_a_real_date
    write_entry("verified-ok", <<~FM)
      title: T
      slug: verified-ok
      summary: S
      published: "2026-01-05"
      verified: "2026-06-30"
      stage: Pilot
    FM

    failures, = run_check
    assert(failures.none? { |f| f.include?("`verified`") }, failures.inspect)
  end

  def test_required_fields_and_option_membership
    write_entry("bad-options", <<~FM, "")
      title: T
      slug: bad-options
      summary: ""
      published: "2026-01-05"
      stage: Prototype
      area:
        - Data
        - Nonsense
    FM

    failures, = run_check
    assert(failures.any? { |f| f.include?("`summary` (Summary) is required but missing or empty") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`stage` value \"Prototype\" is not one of the allowed options") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`area` has values outside the allowed options: Nonsense") }, failures.inspect)
    assert(failures.any? { |f| f.include?("the page body is empty") }, failures.inspect)
  end

  def test_failures_carry_a_line_number
    write_entry("lines", <<~FM)
      title: T
      slug: lines
      summary: S
      published: "2026-01-05"
      stage: Nope
    FM

    failures, = run_check
    stage_failure = failures.find { |f| f.include?("`stage` value") }
    assert_equal "catalog/lines/index.md:6", stage_failure.split(": ").first
  end

  def test_images_must_exist_and_alt_text_is_only_a_warning
    write_entry("images", <<~FM)
      title: T
      slug: images
      summary: S
      published: "2026-01-05"
      screenshots:
        - src: screenshots/missing.png
          alt: Gone
        - src: https://example.org/remote.png
        - 12
    FM

    failures, warnings = run_check
    assert(failures.any? { |f| f.include?("screenshots/missing.png, which does not exist") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`screenshots[2]` must be a string or a `{src, alt}` mapping") }, failures.inspect)
    assert(warnings.any? { |w| w.include?("points at a remote host") }, warnings.inspect)
    assert(warnings.any? { |w| w.include?("`screenshots[1]` has no `alt` text") }, warnings.inspect)
  end

  def test_images_must_be_a_list
    write_entry("images-scalar", <<~FM)
      title: T
      slug: images-scalar
      summary: S
      published: "2026-01-05"
      screenshots: screenshots/01.png
    FM

    failures, = run_check
    assert(failures.any? { |f| f.include?("`screenshots` must be a YAML list of images") }, failures.inspect)
  end

  def test_links_need_a_label_and_an_http_or_mailto_url
    write_entry("links", <<~FM)
      title: T
      slug: links
      summary: S
      published: "2026-01-05"
      resources:
        - label: ""
          url: ftp://example.org/x
        - label: Mail us
          url: "mailto:a@example.org"
        - just a string
    FM

    failures, = run_check
    assert(failures.any? { |f| f.include?("`resources[0]` has no `label`") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`resources[0]` must be an http(s) or mailto: URL") }, failures.inspect)
    assert(failures.none? { |f| f.include?("`resources[1]`") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`resources[2]` is not a URL") }, failures.inspect)
  end

  def test_url_and_email_shapes
    write_entry("shapes", <<~FM)
      title: T
      slug: shapes
      summary: S
      published: "2026-01-05"
      repo_url: example.org/repo
      contact_email: nobody
    FM

    failures, = run_check
    assert(failures.any? { |f| f.include?("`repo_url` must start with http://") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`contact_email` does not look like an email address") }, failures.inspect)
  end

  def test_a_missing_render_with_liquid_flag_is_a_failure
    write_entry("liquid", <<~FM, "{% raw %}Body{% endraw %}")
      title: T
      slug: liquid
      summary: S
      published: "2026-01-05"
    FM

    failures, = run_check
    assert(failures.any? { |f| f.include?("add `render_with_liquid: false`") }, failures.inspect)
  end

  def test_render_with_liquid_true_is_a_failure_too
    write_entry("liquid-true", <<~FM)
      title: T
      slug: liquid-true
      render_with_liquid: true
      summary: S
      published: "2026-01-05"
    FM

    failures, = run_check
    assert(failures.any? { |f| f.include?("add `render_with_liquid: false`") }, failures.inspect)
  end

  def test_summary_is_only_required_because_the_schema_says_so
    # `summary` used to be hardcoded alongside title/slug. With it optional in
    # the schema, an entry without one must pass.
    File.write(File.join(@root, "_data", "schema.yml"), SCHEMA.sub(/^  - key: summary\n(?:    .*\n)+/, ""))
    write_entry("no-summary", <<~FM)
      title: T
      slug: no-summary
      render_with_liquid: false
      published: "2026-01-05"
    FM

    failures, = run_check
    assert(failures.none? { |f| f.include?("summary") }, failures.inspect)
  end

  def test_front_matter_that_is_not_a_mapping_is_reported_not_crashed
    dir = File.join(@root, "catalog", "listy")
    FileUtils.mkdir_p(dir)
    File.write(File.join(dir, "index.md"), "---\n- one\n- two\n---\n\nBody\n")

    failures, = run_check
    assert_equal 1, failures.length
    assert_includes failures.first, "front matter must be a mapping of keys to values"
  end

  def test_urls_with_attribute_breaking_characters_are_rejected
    write_entry("nasty-url", <<~FM)
      title: T
      slug: nasty-url
      render_with_liquid: false
      summary: S
      published: "2026-01-05"
      repo_url: "https://example.org/a b"
      resources:
        - label: Quote
          url: 'https://example.org/"onload=x'
    FM

    failures, = run_check
    assert(failures.any? { |f| f.include?("`repo_url` must start with http://") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`resources[0]` must be an http(s) or mailto: URL") }, failures.inspect)
  end

  def test_a_broken_front_matter_header_is_reported_once
    dir = File.join(@root, "catalog", "broken")
    FileUtils.mkdir_p(dir)
    File.write(File.join(dir, "index.md"), "no front matter here\n")

    failures, = run_check
    assert_equal 1, failures.length
    assert_includes failures.first, "is missing YAML front matter"
  end
  # The minimum documentation bar: an entry nobody can reach is a warning by
  # default, and a failure when the schema's `entry.require_link` says so.
  def test_an_entry_with_no_link_warns_or_fails_per_require_link
    write_entry("unreachable", <<~FM)
      title: T
      slug: unreachable
      render_with_liquid: false
      summary: S
      published: "2026-01-05"
      resources: []
    FM

    failures, warnings = run_check
    assert(failures.none? { |f| f.include?("no link anywhere") }, failures.inspect)
    assert(warnings.any? { |w| w.include?("unreachable/index.md: no link anywhere") }, warnings.inspect)

    File.write(File.join(@root, "_data", "schema.yml"), SCHEMA.sub("  path: catalog\n", "  path: catalog\n  require_link: true\n"))
    failures, warnings = run_check
    assert(failures.any? { |f| f.include?("unreachable/index.md: no link anywhere") }, failures.inspect)
    assert(warnings.none? { |w| w.include?("no link anywhere") }, warnings.inspect)
  end

  def test_a_links_item_or_a_url_field_satisfies_the_documentation_bar
    write_entry("by-links", <<~FM)
      title: T
      slug: by-links
      render_with_liquid: false
      summary: S
      published: "2026-01-05"
      resources:
        - label: Report
          url: https://example.org/r.pdf
    FM
    write_entry("by-url", <<~FM)
      title: T
      slug: by-url
      render_with_liquid: false
      summary: S
      published: "2026-01-05"
      repo_url: https://example.org/repo
    FM

    _failures, warnings = run_check
    assert(warnings.none? { |w| w.include?("no link anywhere") }, warnings.inspect)
  end

  # A schema with no url/links field has nowhere a link could go, so the bar
  # is not applied at all — other presets stay silent.
  def test_the_documentation_bar_is_silent_when_the_schema_has_no_link_fields
    schema = SCHEMA.lines.reject { |l| l =~ /repo_url|label: Repo|type: url|key: resources|label: Resources|type: links/ }.join
    File.write(File.join(@root, "_data", "schema.yml"), schema)
    write_entry("plain", <<~FM)
      title: T
      slug: plain
      render_with_liquid: false
      summary: S
      published: "2026-01-05"
    FM

    _failures, warnings = run_check
    assert(warnings.none? { |w| w.include?("no link anywhere") }, warnings.inspect)
  end

  # `escalate_on` is only read by the scaffolder, so a typo there would fail
  # silently forever; the validator checks it against the field's options.
  def test_escalate_on_must_name_real_values
    schema = SCHEMA
             .sub("    options:\n      - Pilot\n", "    escalate_on: [Prototype]\n    options:\n      - Pilot\n")
             .sub("    type: email\n", "    type: email\n  - key: attest\n    label: Attest\n    type: boolean\n    escalate_on: [\"no\"]\n")
    File.write(File.join(@root, "_data", "schema.yml"), schema)

    failures, = run_check
    assert(failures.any? { |f| f.include?("`stage.escalate_on` names values that are not options: Prototype") }, failures.inspect)
    assert(failures.any? { |f| f.include?("`attest.escalate_on` on a boolean field must be true or false") }, failures.inspect)

    File.write(File.join(@root, "_data", "schema.yml"), SCHEMA.sub("    options:\n      - Pilot\n", "    escalate_on: [Pilot]\n    options:\n      - Pilot\n"))
    failures, = run_check
    assert(failures.none? { |f| f.include?("escalate_on") }, failures.inspect)
  end

  # A `list` field carrying `links_entries: true` holds slugs of other entries.
  # The entry page renders an unresolvable slug as plain text rather than a dead
  # link, so the typo has to be caught here or it is never caught at all.
  LINKS_ENTRIES_SCHEMA = SCHEMA.sub(
    "  - key: body\n",
    "  - key: reused_from\n    label: Adapted from\n    type: list\n    links_entries: true\n  - key: body\n"
  )

  def write_source_and_adopter(reused)
    File.write(File.join(@root, "_data", "schema.yml"), LINKS_ENTRIES_SCHEMA)
    write_entry("source", <<~FM)
      title: The source
      slug: source
      render_with_liquid: false
      summary: S
      published: "2026-01-05"
      repo_url: https://example.org/repo
    FM
    write_entry("adopter", <<~FM)
      title: The adopter
      slug: adopter
      render_with_liquid: false
      summary: S
      published: "2026-03-05"
      repo_url: https://example.org/repo
      reused_from:
        - #{reused}
    FM
  end

  def test_a_links_entries_value_must_name_an_entry_that_exists
    write_source_and_adopter("no-such-entry")

    failures, = run_check
    assert(
      failures.any? { |f| f.include?("adopter/index.md") && f.include?("`reused_from` names \"no-such-entry\"") },
      failures.inspect
    )
    assert(failures.any? { |f| f.include?("catalog/no-such-entry/index.md") }, failures.inspect)
  end

  def test_a_links_entries_value_that_names_a_real_entry_passes
    write_source_and_adopter("source")

    failures, = run_check
    assert(failures.none? { |f| f.include?("reused_from") }, failures.inspect)
  end

  # The hint only means something on a list of slugs; on any other type it would
  # be read by nothing, so say so rather than letting it sit there forever.
  def test_links_entries_is_only_valid_on_a_list_field
    File.write(
      File.join(@root, "_data", "schema.yml"),
      SCHEMA.sub("  - key: repo_url\n    label: Repo\n    type: url\n", "  - key: repo_url\n    label: Repo\n    type: url\n    links_entries: true\n")
    )

    failures, = run_check
    assert(
      failures.any? { |f| f.include?("`repo_url.links_entries` is only valid on a `list` field") },
      failures.inspect
    )
  end
end
